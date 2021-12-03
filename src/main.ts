import * as core from '@actions/core'
import * as github from '@actions/github'
import * as Webhooks from '@octokit/webhooks-types'
import * as fs from 'fs'
import * as YAML from 'yaml'
import { EOL } from 'os'
import { Settings, ReviewGatekeeper } from './review_gatekeeper'

export async function assignReviewers(client: any, reviewer_persons: string[], reviewer_teams: string[], pr_number: number) {
  try {
    console.log(`entering assignReviewers`)
    if (reviewer_persons.length || reviewer_teams.length) {
      await client.rest.pulls.requestReviewers({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr_number,
        reviewers: reviewer_persons[0],
        // UNCOMMENT IF USING PAT TOKEN team_reviewers: reviewer_teams[0],
      });
      core.info(`Requested review from: ${reviewer_persons}.`);
      // UNCOMMENT IF USING PAT TOKEN core.info(`Assigned team reviews to ${reviewer_teams}.`)
    }
    console.log(`exiting assignReviewers`)
  } catch (error) {
    core.setFailed(error.message)
    console.log("error: ", error)
  }
}

async function run(): Promise<void> {
  try {
    const context = github.context
    if (
      context.eventName !== 'pull_request' &&
      context.eventName !== 'pull_request_review'
    ) {
      core.setFailed(
        `Invalid event: ${context.eventName}. This action should be triggered on pull_request and pull_request_review`
      )
      return
    }
    const payload = context.payload as
      | Webhooks.PullRequestEvent
      | Webhooks.PullRequestReviewEvent

    const token: string = core.getInput('token')
    const octokit = github.getOctokit(token)
    const pr_number = payload.pull_request.number
    const sha = payload.pull_request.head.sha
    const workflow_url = `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`

    // Read values from config file if it exists
    const config_file = fs.readFileSync(core.getInput('config-file'), 'utf8')

    // Parse contents of config file into variable
    const config_file_contents = YAML.parse(config_file)

    console.log(config_file_contents.rerequest_review)
    let rerequest_review: boolean = config_file_contents.rerequest_review

    if(!rerequest_review) {
      console.log(`IF HIT - rerequest_review = ${rerequest_review}`)
    } else {
      console.log(`ELSE HIT - reresquest_review = ${rerequest_review}`)
    }

    const reviewer_persons: string[] = []
    const reviewer_teams: string[] = []
    for (const reviewers of config_file_contents.approvals.groups) {
      reviewer_persons.push(reviewers.from.person)
      reviewer_teams.push(reviewers.from.team)
    }

    // const reviewsParam = {
    //   ...context.repo,
    //   pull_number: pr_number,
    // };
    // const reviewsResponse = await octokit.rest.pulls.listReviews(reviewsParam);

    // const reviews = new Map();
    // reviewsResponse.data.forEach(review => {
    //   reviews.set(review.user?.login, review.state);
    // });

    // core.info(`Latest Reviews`);
    // reviews.forEach((value, key) => {
    //   core.info(`${key} = ${value}`);
    // });

    // Request reviews if eventName == pull_request
    if (context.eventName == 'pull_request') {
      console.log(`We are going to request someones approval!!!`)
      assignReviewers(octokit, reviewer_persons, reviewer_teams, pr_number)

      octokit.rest.repos.createCommitStatus({
        ...context.repo,
        sha,
        state: 'failure',
        context: 'PR Gatekeeper Status',
        target_url: workflow_url,
        description: "PR contains changes subject to special review"
      })

    }

    console.log(`We don't care about requesting approvals! We'll just check who already approved`)

    //retrieve approvals
    const reviews = await octokit.rest.pulls.listReviews({
      ...context.repo,
      pull_number: payload.pull_request.number
    })
    const approved_users: Set<string> = new Set()
    for (const review of reviews.data) {
      if (review.state === `APPROVED`) {
        approved_users.add(review.user!.login)
        console.log(`Approval from: ${review.user!.login}`)
      }
    }

    // check approvals
    const review_gatekeeper = new ReviewGatekeeper(
      config_file_contents as Settings,
      Array.from(approved_users),
      payload.pull_request.user.login
    )

    console.log(`sha: ${sha}`)
    // The workflow url can be obtained by combining several environment varialbes, as described below:
    // https://docs.github.com/en/actions/reference/environment-variables#default-environment-variables
    console.log(`workflow_url: ${workflow_url}`)
    core.info(`Setting a status on commit (${sha})`)


    octokit.rest.repos.createCommitStatus({
      ...context.repo,
      sha,
      state: review_gatekeeper.satisfy() ? 'success' : 'failure',
      context: 'PR Gatekeeper Status',
      target_url: workflow_url,
      description: review_gatekeeper.satisfy()
        ? undefined
        : review_gatekeeper.getMessages().join(' ').substr(0, 140)
    })

    if (!review_gatekeeper.satisfy() && context.eventName == 'pull_request_review') {
      core.setFailed(review_gatekeeper.getMessages().join(EOL))
      return
    }
  } catch (error) {
    core.setFailed(error.message)
    console.log("error: ", error)
  }
}

run()

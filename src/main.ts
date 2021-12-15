import * as core from '@actions/core'
import * as github from '@actions/github'
import * as Webhooks from '@octokit/webhooks-types'
import * as fs from 'fs'
import * as YAML from 'yaml'
import { EOL } from 'os'
import { Settings, ReviewGatekeeper } from './review_gatekeeper'

export function checkCondition(check_type: string, condition: RegExp, pr_diff_body: any, pr_files: any): boolean {
  var condition_match: boolean = false
  console.log("Enter checkCondition func") //DEBUG
  // console.log(pr_files) //DEBUG
  console.log(`condition: ${condition}`) //DEBUG
  console.log(`check_cond: ${pr_diff_body.data.match(condition)}`) //DEBUG
  if (pr_diff_body.data.match(condition)) {
    console.log(`Condition ${condition} matched`)  //DEBUG
    console.log(pr_diff_body.data.match(condition))
    console.log(`Condition ${condition} matched`)  //DEBUG
    condition_match = true
  }
  return condition_match
}

export async function assignReviewers(client: any, reviewer_users: string[], reviewer_teams: string[], pr_number: number) {
  try {
    console.log(`entering assignReviewers`) //DEBUG
    console.log(`users length: ${reviewer_users.length} - ${reviewer_users}`) //DEBUG
    if (reviewer_users) {
      await client.rest.pulls.requestReviewers({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr_number,
        reviewers: reviewer_users,
      });
      core.info(`Requested review from users: ${reviewer_users}.`);
    }
    console.log(`passed by users trying teams`) //DEBUG
    console.log(`teams length: ${reviewer_teams}`) //DEBUG
    // if default GITHUB_TOKEN used request below will fail
    if (reviewer_teams) {
      await client.rest.pulls.requestReviewers({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr_number,
        team_reviewers: reviewer_teams,
      });
      core.info(`Requested review from teams: ${reviewer_teams}.`);
    }
    console.log(`exiting assignReviewers`) //DEBUG
  } catch (error) {
    core.setFailed(error.message)
    console.log("error: ", error)
  }
}

async function run(): Promise<void> {
  try {
    type ApprovalGroup = {name: string, min_approvals: number, users: string[], teams: string[]}
    const final_approval_groups: ApprovalGroup[] = []

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
    const repo = payload.repository.url
    const pr_number = payload.pull_request.number
    const pr_diff_url = payload.pull_request.diff_url
    const pr_owner = payload.pull_request.user.login
    const sha = payload.pull_request.head.sha
    const workflow_name = `${process.env.GITHUB_WORKFLOW}`
    const workflow_url = `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
    const organization: string = process.env.GITHUB_REPOSITORY?.split("/")[0]!
    const pr_diff_body = await octokit.request(pr_diff_url)
    const pr_files = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      pull_number: pr_number
    })
    // retrieve pr files list
    for (var i = 0; i < pr_files.data.length; i++){
      var obj = pr_files.data[i]
      console.log(obj.filename)
    }

    var CUSTOM_REVIEW_REQUIRED: boolean = false
    const status_messages: string[] = []


    // condition to search files with changes to locked lines
    const search_locked_lines_regexp = /🔒.*(\n^[\+|\-].*)|^[\+|\-].*🔒/gm
    const search_res = pr_diff_body.data.match(search_locked_lines_regexp) //DEBUG
    console.log(`Search result: ${search_res}`) //DEBUG
    if (pr_diff_body.data.match(search_locked_lines_regexp)) {
      console.log(`if condition for locks triggered`)  //DEBUG
      console.log(pr_diff_body.data.match(search_locked_lines_regexp))
      CUSTOM_REVIEW_REQUIRED = true
      final_approval_groups.push({name: '🔒LOCKS TOUCHED🔒', min_approvals: 2, users: [], teams: ['s737team']})
      console.log(final_approval_groups)
      status_messages.push()
    }


    // Read values from config file if it exists
    const config_file = fs.readFileSync(core.getInput('config-file'), 'utf8')

    // Parse contents of config file into variable
    const config_file_contents = YAML.parse(config_file)

    for (const approval_group of config_file_contents.approval_groups) {
      console.log(approval_group.name)  //DEBUG
      console.log(approval_group.condition)  //DEBUG
      console.log(approval_group.check_type)  //DEBUG
      console.log(approval_group.min_approvals)  //DEBUG
      console.log(approval_group.users)  //DEBUG
      console.log(approval_group.teams)  //DEBUG
      const conditionEtalon: RegExp = /👜.*(\n^[\+|\-].*)|^[\+|\-].*👜/gm
      const condString: string = '/👜.*(\n^[\+|\-].*)|^[\+|\-].*👜/gm'
      const condFromString: RegExp = new RegExp(condString)
      const condition: RegExp = new RegExp(approval_group.condition)
      console.log(`cond_work: ${conditionEtalon}`)
      console.log(`cond_from_yml: ${condition}`)
      console.log(`cond_string: ${condString}`)
      console.log(`cond_from_string: ${condFromString}`)
      checkCondition(approval_group.check_type, condition, pr_diff_body, pr_files)
    }






    // No breaking changes - no cry. Set status OK and exit.
    // if (false) {
    if (!CUSTOM_REVIEW_REQUIRED) {
      console.log(`Special approval of this PR is not required.`)

      octokit.rest.repos.createCommitStatus({
        ...context.repo,
        sha,
        state: 'success',
        context: workflow_name,
        target_url: workflow_url,
        description: "Special approval of this PR is not required."
      })
      return
    }

    console.log("Before users evaluation")  //DEBUG

    const reviewer_users_set: Set<string> = new Set()
    const reviewer_teams_set: Set<string> = new Set()

    for (const reviewers of config_file_contents.approvals.groups) {
      if (reviewers.from.users) {
        for (var entry of reviewers.from.users) {
          if (entry != pr_owner) {
            reviewer_users_set.add(entry)
          }
        }
      }
      if (reviewers.from.teams) {
        for (var entry of reviewers.from.teams) {
          reviewer_teams_set.add(entry)
        }
      }
    }

    console.log(`users set:`) //DEBUG
    console.log(reviewer_users_set) //DEBUG
    console.log(`teams set:`) //DEBUG
    console.log(reviewer_teams_set) //DEBUG
    console.log(Array.from(reviewer_users_set))  //DEBUG

    if (context.eventName == 'pull_request') {
      console.log(`I'm going to request someones approval!!!`) //DEBUG
      assignReviewers(octokit, Array.from(reviewer_users_set), Array.from(reviewer_teams_set), pr_number)

      octokit.rest.repos.createCommitStatus({
        ...context.repo,
        sha,
        state: 'failure',
        context: workflow_name,
        target_url: workflow_url,
        description: `PR contains changes subject to special review. Review requested from: ${Array.from(reviewer_users_set)}`
      })
    } else {
      console.log(`I don't care about requesting approvals! Will just check who already approved`)

      // aggregate reviewers from users and teams
      console.log(`org: ${organization}`)

      const teams_list = await octokit.rest.teams.list({
        ...context.repo,
        org: organization
      });

      for (const team of teams_list.data) {
        console.log(`team list: ${team.slug}`)

        const team_list_obj = await octokit.rest.teams.listMembersInOrg({
          ...context.repo,
          org: organization,
          team_slug: team.slug
        });

        for (const member of team_list_obj.data) {
          if (pr_owner != member!.login) {
            console.log(`team_member: ${member!.login!}`) //debug output
            reviewer_users_set.add(member!.login)
          }
        }
      }

      //retrieve approvals
      const reviews = await octokit.rest.pulls.listReviews({
        ...context.repo,
        pull_number: payload.pull_request.number
      })
      const approved_users: Set<string> = new Set()
      for (const review of reviews.data) {
        if (review.state === `APPROVED`) {
          approved_users.add(review.user!.login)
          console.log(`Approved: ${review.user!.login} --- ${review.state}`)
        } else {
          approved_users.delete(review.user!.login)
          console.log(`Other state: ${review.user!.login} --- ${review.state}`)
        }
      }

      // check approvals
      const review_gatekeeper = new ReviewGatekeeper(
        config_file_contents as Settings,
        Array.from(approved_users),
        reviewer_users_set,
        payload.pull_request.user.login
      )

      // The workflow url can be obtained by combining several environment varialbes, as described below:
      // https://docs.github.com/en/actions/reference/environment-variables#default-environment-variables
      core.info(`Setting a status on commit (${sha})`)


      octokit.rest.repos.createCommitStatus({
        ...context.repo,
        sha,
        state: review_gatekeeper.satisfy() ? 'success' : 'failure',
        context: workflow_name,
        target_url: workflow_url,
        description: review_gatekeeper.satisfy()
          ? undefined
          : review_gatekeeper.getMessages().join(' ')
      })

      if (!review_gatekeeper.satisfy()) {
        core.setFailed(review_gatekeeper.getMessages().join(EOL))
        return
      }
    }
  } catch (error) {
    core.setFailed(error.message)
    console.log("error: ", error)
  }
}

run()

import * as core from '@actions/core'
import * as github from '@actions/github'
import * as Webhooks from '@octokit/webhooks-types'
import * as fs from 'fs'
import * as YAML from 'yaml'
import { EOL } from 'os'
import { Settings, ReviewGatekeeper } from './review_gatekeeper'
import { stderr } from 'process'
import { resourceLimits } from 'worker_threads'
import { stringify } from 'querystring'

const dummy = "asdf"

const context = github.context

const payload = context.payload as
  | Webhooks.PullRequestEvent
  | Webhooks.PullRequestReviewEvent

const token: string = core.getInput('token')
const octokit = github.getOctokit(token)
const repo = payload.repository.url
const pr_number = payload.pull_request.number
const pr_diff = payload.pull_request.diff_url
const pr_owner = payload.pull_request.user.login
const sha = payload.pull_request.head.sha
const workflow_url = `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`
const workflow_name = `${process.env.GITHUB_WORKFLOW}`
const organization: string = process.env.GITHUB_REPOSITORY?.split("/")[0]!
const diff_body = octokit.request(pr_diff)

export interface ApprovalSettings {
  name: string
  condition: string
  min_approvals: number
  from: {
    users: string[]
    teams: string[]
  }
}
export class SpecialApproval {
  private name: string
  public condition: string
  public min_approvals: number
  public approving_users: string[]
  public approving_teams: string[]


  constructor(settings: ApprovalSettings){
    this.name = settings.name
    this.condition = settings.condition
    this.min_approvals = settings.min_approvals
    this.approving_users = settings.from.users
    this.approving_teams = settings.from.teams
  }

  async check_condition(): Promise<boolean>{
    var check_result: boolean = false
    console.log(repo)
    try{
      console.log(`enter check_condition func`)
      eval(this.condition)
      console.log(check_result)
      console.log(repo)
      // F()
      console.log(check_result)
    } catch(error){
      console.log("error: ", error)
    }
    return check_result
  }

  describe(): void{
    console.log(`This obj data: \n name ${this.name} \n ${this.condition}`)
  }
}

export async function checkObjProcess(check_object: SpecialApproval) {
  console.log(`checkObjProcess invoked`)
  check_object.describe()
  console.log(`checkObjProcess finished`)
}

export async function assignReviewers(client: any, reviewer_persons: string[], reviewer_teams: string[], pr_number: number) {
  try {
    console.log(`entering assignReviewers`) //DEBUG
    console.log(`persons length: ${reviewer_persons.length} - ${reviewer_persons}`) //DEBUG
    if (reviewer_persons) {
      await client.rest.pulls.requestReviewers({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr_number,
        reviewers: reviewer_persons,
      });
      core.info(`Requested review from users: ${reviewer_persons}.`);
    }
    console.log(`passed by persons trying teams`) //DEBUG
    console.log(`teams length: ${reviewer_teams}`) //DEBUG
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
    const CheckLocks: ApprovalSettings = {
      name: 'Check files with lock signs',
      condition: "console.log(`IT WORKS! repo: ${repo}`)\n"+
      "console.log(`pr_owner: ${pr_owner}`)\n"+
      "console.log(`diff url: ${pr_diff}`)\n"+
      "const diff_body = `(async () => {await octokit.request(pr_diff)})();`\n"+
      "console.log(diff_body)\n"+
      "console.log(typeof diff_body)\n"+
      "console.log(typeof diff_body.data)\n"+
      "console.log(diff_body.data)\n"+
      "const re = \/🔒.*(\\n^[\\+|\\-].*){1,5}|^[\\+|\\-].*🔒\/gm;\n"+
      "const search_res = diff_body.data.match(re)\n"+
      "console.log(`Search result: ${search_res}`)\n"+
      "console.log(`Search res type: ${typeof search_res}`)\n"+
      "if (search_res) {check_result = true}",
      min_approvals: 2,
      from: {
        users: [],
        teams: ['s737team']
      }
    }




    if (
      context.eventName !== 'pull_request' &&
      context.eventName !== 'pull_request_review'
    ) {
      core.setFailed(
        `Invalid event: ${context.eventName}. This action should be triggered on pull_request and pull_request_review`
      )
      return
    }

    // console.log(`repo: ${repo}`)
    // console.log(`pr_owner: ${pr_owner}`)
    // console.log(`diff url: ${pr_diff}`)

    
    console.log(repo)
    console.log(typeof diff_body)
    // console.log(typeof diff_body.data)
    // console.log(diff_body.data)

    // const re = /🔒.*(\n^[\+|\-].*){1,5}|^[\+|\-].*🔒/gm;
    // const search_res = diff_body.data.match(re)
    // console.log(`Search result: ${search_res}`)
    // console.log(`Search res type: ${typeof search_res}`)
    // console.log(`Search res is instance of Array? ${search_res.length}`)


    // experiment with shell exec
    // const { exec } = require("child_process");

    // exec("git --no-pager diff ${{ github.event.pull_request.base.sha }}...${{ github.event.pull_request.head.sha }} -U1 | { grep 🔒 || true; }", (error, stdout, stderr) => {
    //   if (error) {
    //     console.log(`error: ${error.message}`);
    //     return;
    //   }
    //   if (stderr) {
    //     console.log(`stderr: ${stderr}`);
    //     return;
    //   }
    //   console.log(`stdout: ${stdout}`);
    // });

    // const execSync = require('child_process').execSync;
    // // import { execSync } from 'child_process';  // replace ^ if using ES modules
    // const output = execSync("git --no-pager diff ${{ github.event.pull_request.base.sha }}...${{ github.event.pull_request.head.sha }} -U1 | grep 🔒 ", { encoding: 'utf-8' });  // the default is 'buffer'
    // console.log('Output was:\n', output);
    console.log(`Will try to spawn SpecialApproval`)
    const default_check = new SpecialApproval(CheckLocks as ApprovalSettings)
    // default_check.describe()

    // checkObjProcess(default_check)
    default_check.check_condition()

    // No breaking changes - no cry. Set status OK and exit.
    if (false) {
    // if (process.env.CUSTOM_REVIEW_REQUIRED == 'not_required') {
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

    // Read values from config file if it exists
    const config_file = fs.readFileSync(core.getInput('config-file'), 'utf8')

    // Parse contents of config file into variable
    const config_file_contents = YAML.parse(config_file)

    const reviewer_persons_set: Set<string> = new Set()
    const reviewer_teams_set: Set<string> = new Set()

    for (const reviewers of config_file_contents.approvals.groups) {
      if (reviewers.from.persons) {
        for (var entry of reviewers.from.persons) {
          if (entry != pr_owner) {
            reviewer_persons_set.add(entry)
          }
        }
      }
      if (reviewers.from.teams) {
        for (var entry of reviewers.from.teams) {
          reviewer_teams_set.add(entry)
        }
      }
    }

    console.log(`persons set:`) //DEBUG
    console.log(reviewer_persons_set) //DEBUG
    console.log(`teams set:`) //DEBUG
    console.log(reviewer_teams_set) //DEBUG
    console.log(Array.from(reviewer_persons_set))  //DEBUG

    if (context.eventName == 'pull_request') {
      console.log(`I'm going to request someones approval!!!`) //DEBUG
      assignReviewers(octokit, Array.from(reviewer_persons_set), Array.from(reviewer_teams_set), pr_number)

      octokit.rest.repos.createCommitStatus({
        ...context.repo,
        sha,
        state: 'failure',
        context: workflow_name,
        target_url: workflow_url,
        description: `PR contains changes subject to special review. Review requested from: ${Array.from(reviewer_persons_set)}`
      })

      // const { data: prDiff } = await octokit.rest.pulls.get({
      //   owner: pr_owner,
      //   repo: repo,
      //   pull_number: pr_number,
      //   mediaType: {
      //     format: "diff"
      //   }
      // })

      // console.log(prDiff.body)

    } else {
      console.log(`I don't care about requesting approvals! Will just check who already approved`)

      // aggregate reviewers from persons and teams
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
            reviewer_persons_set.add(member!.login)
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
        reviewer_persons_set,
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

import * as core from '@actions/core'
import * as github from '@actions/github'
import * as Webhooks from '@octokit/webhooks-types'
import * as fs from 'fs'
import * as YAML from 'yaml'
import { EOL } from 'os'
import { Settings, ReviewGatekeeper } from './review_gatekeeper'
import { Context } from '@actions/github/lib/context'

export function checkCondition(check_type: string, condition: RegExp, pr_diff_body: any, pr_files: any): boolean {
  var condition_match: boolean = false
  // TODO implement file lists evaluation
  console.log("Enter checkCondition func") //DEBUG
  console.log(`condition: ${condition}`) //DEBUG
  console.log(`check_cond: ${pr_diff_body.data.match(condition)}`) //DEBUG
  if (pr_diff_body.data.match(condition)) {
    console.log(`Condition ${condition} matched`)  //DEBUG
    condition_match = true
  }
  return condition_match
}

export async function combineUsersTeams(client: any, context: Context, org: string, pr_owner: string, users: string[], teams: string[]): Promise<string[]> {
  const full_approvers_list: Set<string> = new Set()
  console.log(`Users inside combine func: ${users} - ${users.length}`) //DEBUG
  if (users.length) {
    for (const user of users) {
      if (pr_owner != user) {
        console.log(`user: ${user}`) //DEBUG
        full_approvers_list.add(user)
      }
    }
  }
  console.log(`Teams inside combine func: ${teams} - ${teams.length}`) //DEBUG
  if (true) {
    console.log(`Get inside if`) //DEBUG
    for (const team of teams) {
      console.log(team) //DEBUG
      const team_users_list = await client.rest.teams.listMembersInOrg({
        ...context.repo,
        org: org,
        team_slug: team
      });

      console.log(`Team users list: ${team_users_list.data}`)
      for (const member of team_users_list.data) {
        if (pr_owner != member!.login) {
          console.log(`team_member: ${member!.login!}`) //DEBUG
          full_approvers_list.add(member!.login)
        }
      }
    }
  }
  console.log(`Resulting full_approvers_list: ${full_approvers_list}`)
  return Array.from(full_approvers_list)
}

export async function assignReviewers(client: any, reviewer_users: string[], reviewer_teams: string[], pr_number: number) {
  try {
    console.log(`entering assignReviewers`) //DEBUG
    console.log(`users length: ${reviewer_users.length} - ${reviewer_users}`) //DEBUG
    // You're safe to use default GITHUB_TOKEN until you request review only from users not teams
    // It teams review is needed, then PAT token required
    if (reviewer_users) {
      await client.rest.pulls.requestReviewers({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pull_number: pr_number,
        reviewers: reviewer_users,
      });
      core.info(`Requested review from users: ${reviewer_users}.`);
    }
    console.log(`teams length: ${reviewer_teams.length} - ${reviewer_teams}`) //DEBUG
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
    type ApprovalGroup = { name: string, min_approvals: number, users?: string[], teams?: string[], approvers: string[] }
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
    // TODO retrieve pr files list
    for (var i = 0; i < pr_files.data.length; i++) {
      var obj = pr_files.data[i]
      console.log(obj.filename)
    }

    var CUSTOM_REVIEW_REQUIRED: boolean = false
    const pr_status_messages: string[] = []
    const prr_status_messages: string[] = []


    // condition to search files with changes to locked lines
    const search_locked_lines_regexp = /🔒.*(\n^[\+|\-].*)|^[\+|\-].*🔒/gm
    const search_res = pr_diff_body.data.match(search_locked_lines_regexp) //DEBUG
    console.log(`Search result: ${search_res}`) //DEBUG
    if (pr_diff_body.data.match(search_locked_lines_regexp)) {
      console.log(`if condition for locks triggered`)  //DEBUG
      console.log(pr_diff_body.data.match(search_locked_lines_regexp))  //DEBUG
      CUSTOM_REVIEW_REQUIRED = true
      var approvers: string[] = []
      combineUsersTeams(octokit, context, organization, pr_owner, [], ['s737team']).then(res =>
        approvers = res)
      console.log(`Approvers: ${approvers}`)
      final_approval_groups.push({ name: '🔒LOCKS TOUCHED🔒', min_approvals: 2, users: ['sergioko747'], teams: ['s737team'], approvers: approvers })
      console.log(final_approval_groups)  //DEBUG
      pr_status_messages.push(`LOCKS TOUCHED review required`)
    }


    // Read values from config file if it exists
    var config_file_contents: any = ""
    if (fs.existsSync(core.getInput('config-file'))) {
      const config_file = fs.readFileSync(core.getInput('config-file'), 'utf8')
      config_file_contents = YAML.parse(config_file)

      for (const approval_group of config_file_contents.approval_groups) {
        console.log(approval_group.name)  //DEBUG
        console.log(approval_group.condition)  //DEBUG
        console.log(approval_group.check_type)  //DEBUG
        console.log(approval_group.min_approvals)  //DEBUG
        console.log(approval_group.users)  //DEBUG
        console.log(approval_group.teams)  //DEBUG
        const condition: RegExp = new RegExp(approval_group.condition, "gm")
        console.log(`cond_from_yml: ${condition}`) //DEBUG
        if (checkCondition(approval_group.check_type, condition, pr_diff_body, pr_files)) {
          CUSTOM_REVIEW_REQUIRED = true
          // Combine users and team members in `approvers` list, excluding pr_owner
          console.log("Combine users and team members in `approvers` list, excluding pr_owner") //DEBUG
          const full_approvers_list: Set<string> = new Set()
          if (approval_group.users) {
            for (const user of approval_group.users) {
              if (pr_owner != user) {
                console.log(`user: ${user}`) //DEBUG
                full_approvers_list.add(user)
              }
            }
          }
          if (approval_group.teams) {
            for (const team of approval_group.teams) {
              console.log(team) //DEBUG
              const team_users_list = await octokit.rest.teams.listMembersInOrg({
                ...context.repo,
                org: organization,
                team_slug: team
              });

              for (const member of team_users_list.data) {
                if (pr_owner != member!.login) {
                  console.log(`team_member: ${member!.login!}`) //DEBUG
                  full_approvers_list.add(member!.login)
                }
              }
            }
          }

          final_approval_groups.push({
            name: approval_group.name,
            min_approvals: approval_group.min_approvals,
            users: approval_group.users,
            teams: approval_group.teams,
            approvers: Array.from(full_approvers_list)
          })
          console.log(final_approval_groups) //DEBUG
          pr_status_messages.push(`${approval_group.name} review required`)
        }
      }
    } else {
      console.log(`No config file provided. Continue with built in approval group`)
    }

    // No breaking changes - no cry. Set status OK and exit.
    if (!CUSTOM_REVIEW_REQUIRED) {
      console.log(`Special approval of this PR is not required.`) //DEBUG
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

    // Refine data for review request
    const reviewer_users_set: Set<string> = new Set()
    const reviewer_teams_set: Set<string> = new Set()

    for (const reviewers of final_approval_groups) {
      if (reviewers.users) {
        for (var entry of reviewers.users) {
          if (entry != pr_owner) {
            reviewer_users_set.add(entry)
          }
        }
      }
      if (reviewers.teams) {
        for (var entry of reviewers.teams) {
          reviewer_teams_set.add(entry)
        }
      }
    }

    console.log(`users set: ${Array.from(reviewer_users_set)}`) //DEBUG
    console.log(`teams set: ${Array.from(reviewer_teams_set)}`) //DEBUG

    if (context.eventName == 'pull_request') {
      console.log(`I'm going to request someones approval!!!`) //DEBUG
      assignReviewers(octokit, Array.from(reviewer_users_set), Array.from(reviewer_teams_set), pr_number)
      console.log(`STATUS MESSAGES: ${pr_status_messages.join()}`) //DEBUG

      octokit.rest.repos.createCommitStatus({
        ...context.repo,
        sha,
        state: 'failure',
        context: workflow_name,
        target_url: workflow_url,
        description: pr_status_messages.join('\n')
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
            console.log(`team_member: ${member!.login!}`) //DEBUG
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

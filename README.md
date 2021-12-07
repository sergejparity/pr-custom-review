# PR Custom Review

This is an action created for for complex pull request approval cases that are not currently supported by the [protected branches](https://docs.github.com/en/github/administering-a-repository/defining-the-mergeability-of-pull-requests/about-protected-branches#about-branch-protection-settings) feature in GitHub.

## How this action works

This action is intended to be executed every time some change is made to the pull request (see [workflow example](#Workflow-config])). When this action is executed, it checks whether the review and approval status of the triggered pull request meets the policy described in the [action's config](#Action-config), and sets the result to a commit status named "PR Custom Review Status".


You can enforce the review policy described in action config by setting this "PR Custom Review Status" as required in the protected branch settings.

## Configuration

### Action config

The action is configured via the `custom_approvers_config.yml` file located in the `.github` subdirectory. Default config file can be overriden in workflow inputs.
The general format is as follows.

```yaml
approvals:
  # check will fail if there is no approval
  minimum: 1     # optional - the same as repo protected branch settings
  groups:
    - name: reviewers_group1
      minimum: 1 # number of needed approvals
      from:
        person: # list of individual users to request and check approvals. Works with default GITHUB_TOKEN
          - user1
          - user2
    - name: reviewers_group2
      minimum: 2
      from:
        person:
          - user3
          - user4
```

### Workflow config

Once the `custom_approvers_config.yml` file is in place, add the action to execute on every PR and then set it as a required action to start enforcing your new approval policy!

```yaml
name: 'PR Gatekeeper'

on:
  pull_request:
    types:
      [
        assigned,
        unassigned,
        opened,
        reopened,
        synchronize,
        review_requested,
        review_request_removed
      ]
  pull_request_review:

jobs:
  pr-gatekeeper:
    name: PR Gatekeeper
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: sergejparity/pr-special-review@master
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          # OPTIONAL config-file: './.github/approve_config.yml'
```
TODO
Dismiss stale pull request approvals when new commits are pushed STATUS
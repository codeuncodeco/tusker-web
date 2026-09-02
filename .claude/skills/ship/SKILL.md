---
name: ship
description: "Push a branch, sync it with main, resolve conflicts, and raise a PR."
disable-model-invocation: true
---

1. Confirm the work is committed, and the branch is not `main`.

2. Sync with main. Fetch `origin`, then merge `origin/main` into the branch.
   This repo uses worktrees — merge in the current worktree. Do not switch branches.

3. If the merge conflicts, use /resolving-merge-conflicts.

4. Run `pnpm typecheck` and `pnpm test`. Fix what the merge broke.

5. Push the branch.

6. Raise the PR with `gh pr create`, base `main`. Use a heredoc for the body.
   Put `Closes #<n>` in the body for the issue it closes.
   Say what changed and why. Do not list every file.

7. Report the PR URL.

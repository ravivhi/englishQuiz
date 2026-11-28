# englishQuiz

## After every push: watch the GitHub checks

Every time you push to this repo, watch the GitHub Actions run for that commit. Do not skip this.

1. Find the run: `gh run list --repo ravivhi/englishQuiz --commit $(git rev-parse HEAD)`. If none is listed yet, wait a few seconds and retry.
2. Watch it in the background: `gh run watch <id> --exit-status`.
3. When it finishes, tell the user whether it passed or failed.
4. If it failed:
   - Read `gh run view <id> --log-failed`.
   - Fix the problem and run the tests locally.
   - Commit, push, and watch the new run too.
5. If no workflow ran for that commit, say so. The "Slow tests" workflow only runs when `index.html`, `sw.js`, `wordbank/**`, `tests/**` or the workflow file change.

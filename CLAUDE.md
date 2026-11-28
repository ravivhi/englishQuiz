# englishQuiz

A Hebrew English-practice app that is one page, `index.html`. It is live at ravivh.com/englishQuiz and served by GitHub Pages from `main`.

## Rules

- **Bump the cache version in `sw.js` on every change to the app** (`englishquiz-vNNN`, +1). Without this, phones keep showing the old version.
- **Never rename localStorage keys** (`englishquiz-*`). Renaming one wipes players' saved progress.
- **Never write to, sign in to, or query the real Firebase project** (ravivh-apps) without asking. The tests use a fake Firebase.
- **Editing `index.html`:** it mixes CRLF and LF line endings. Change only the lines you need, and never convert the whole file.
- **Testing:** before pushing, run `node ocr-test.mjs` in `tests/` for the fast tests. Run `slow`, `all` or a single test's name to choose others. The slow tests also run on GitHub. Don't edit files while a test run is in progress.
- **Flaky tests:** `header` (off by 1–2px) and `ice` (times out under load). Rerun them before blaming a change.
- **Auto-push:** every time you finish a request, run the tests that cover the change. If they pass, commit and push right away, without asking. If they fail, fix the problem first; never push red tests. Ask first only for something risky, like deleting data or a big rewrite.
- **Other sessions' commits:** if one has a problem, fix it in a new commit on top; never rewrite it.

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

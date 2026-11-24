# English Quiz

English vocabulary practice for kids (PWA): https://ravivh.com/englishQuiz/

| Path | What |
|------|------|
| repo root | the web app (`index.html`, `sw.js`, `wordbank/`, ...) |
| `tests/` | Playwright tests: `cd tests && node ocr-test.mjs [name]` (photo fixtures are local only, not in git) |
| `android/` | Bubblewrap TWA (com.raviv.englishQuiz) that loads the website; keys in `C:\Users\Raviv.Hilleli\signing-keys\englishQuiz` |

Moved out of ravivhi/guessingGame on 2026-11-24 with its full history.

**Publishing:** every push to `main` that changes the web app goes live (`.github/workflows/pages.yml`, this repo's
own GitHub Pages; ravivh.com is the custom domain of ravivhi/ravivhi.github.io). `tests/` and `android/` are not
published. Bump `CACHE` in `sw.js` with every web change, or installed copies won't update.

**Try locally:** run `python -m http.server 8000` in the folder that contains this repo (e.g. `raviv-games`) and open
http://localhost:8000/englishQuiz/.

Android: never run `bubblewrap update` (reverts targetSdk 36); `android/twa-manifest.json` must stay LF (its sha1 is
in `android/manifest-checksum.txt`).

// End-to-end OCR test for englishQuiz: loads the real page in headless Chrome, uploads photos from
// tests/fixtures/ and checks the rows the page produces. Covers both kinds of photos:
//   - "pairs": English words with their Hebrew next to them        (new-words-*.jpg)
//   - "list":  English-only word list, meanings come from translation (word-list-*.jpg)
// The translation service (MyMemory) is stubbed, so the test is fast, repeatable and doesn't hit the real API.
//
// Setup (once):   cd tests && npm install
// Run:            cd tests && npm run ocr              (everything)   |   node ocr-test.mjs wordbank|random|layout|back|tabs|streak|pairs|list|translation|practice|chooser|header|persist|learn|shop|box|phoneback|avatar   (pairs/list take a file-name part too: node ocr-test.mjs list quarter)
// Chrome:         set CHROME_PATH if Chrome/Edge isn't in a default location.
//
// The photos in tests/fixtures/ are git-ignored on purpose (copyrighted workbook pages).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');   // the englishQuiz folder (what the test server serves at /)

const FIXTURES = {
  pairs: [{
    file: 'new-words-page29.jpg',
    // Hebrew is taken verbatim from the photo, commas included.
    pairs: {
      sweet: 'מתוק', July: 'יולי', candy: 'ממתק', everyone: 'כולם', then: 'אז', date: 'תאריך',
      flour: 'קמח', outside: 'בחוץ, החוצה', throw: 'לזרוק', do: 'לעשות, פועל עזר בהווה',
      give: 'לתת', ready: 'מוכן',
    },
  }, {
    file: 'new-words-card.jpg',          // sideways photo, Hebrew + Arabic under each word, a finger over the corner
    pairs: {
      card: 'כרטיס ברכה', for: 'ל-, עבור, למשך', market: 'שוק', sell: 'למכור',
      end: 'סוף', hear: 'לשמוע', present: 'מתנה', thing: 'דבר',
      flower: 'פרח', "I'm sorry": 'אני מצטער', pretty: 'יפה', village: 'כפר',
    },
  }, {
    file: 'new-words-always.jpg',        // same kind of card
    pairs: {
      always: 'תמיד', find: 'למצוא', paint: 'לצייר, לצבוע', safe: 'בטוח, מוגן',
      choose: 'לבחור', fix: 'לתקן', practice: 'להתאמן', 'table tennis': 'טניס שולחן',
      club: 'מועדון, חוג', or: 'או', problem: 'בעיה', use: 'להשתמש',
    },
  }, {
    file: 'new-words-country.jpg',       // same kind of card
    pairs: {
      country: 'מדינה', hour: 'שעה', many: 'הרבה', 'Olympic Games': 'משחקים אולימפיים',
      first: 'ראשון', how: 'איך', medal: 'מדליה', prepare: 'להתכונן',
      hard: 'קשה', later: 'מאוחר יותר, אחר כך', need: 'צריך', was: 'היה',
    },
  }, {
    file: 'new-words-again.jpg',         // same kind of card; "(be) called" keeps its bracketed word
    pairs: {
      again: 'שוב', 'be called': 'נקרא', move: 'לזוז, להזיז', race: 'מירוץ',
      artist: 'צייר', easy: 'קל', place: 'מקום', them: 'אותם, אותן',
      because: 'כי', interesting: 'מעניין', plate: 'צלחת', tomorrow: 'מחר',
    },
  }, {
    file: 'new-words-adult.jpg',
    pairs: {
      adult: 'מבוגר', get: 'לקבל', road: 'רחוב, כביש', think: 'לחשוב',
      ago: 'לפני', player: 'שחקן', some: 'כמה, קצת', true: 'נכון, אמת',
      build: 'לבנות', right: 'נכון', something: 'משהו', way: 'דרך',
    },
  }, {
    file: 'new-words-cry.jpg',
    pairs: {
      cry: 'לבכות', hurt: 'נפצע, כואב', keep: 'לשמור', of: 'של, ב-',
      excited: 'נרגש, מתרגש', ice: 'קרח', lie: 'לשכב', son: 'בן',
      'get up': 'לקום', important: 'חשוב', noise: 'רעש', winner: 'מנצח',
    },
  }, {
    file: 'new-words-anyone.jpg',
    pairs: {
      anyone: 'כל אחד, מישהו', heart: 'לב', point: 'להצביע', these: 'אלה',
      'come from': 'מ-, לבוא מ-', light: 'קל', rich: 'עשיר', top: 'צמרת, פיסגה, למעלה',
      finger: 'אצבע', list: 'רשימה', tent: 'אוהל', travel: 'לנסוע',
    },
  }, {
    file: 'new-words-anyone-title.jpg',  // the same card with its "New Words 1" title in the photo: text outside the box is ignored
    pairs: {
      anyone: 'כל אחד, מישהו', heart: 'לב', point: 'להצביע', these: 'אלה',
      'come from': 'מ-, לבוא מ-', light: 'קל', rich: 'עשיר', top: 'צמרת, פיסגה, למעלה',
      finger: 'אצבע', list: 'רשימה', tent: 'אוהל', travel: 'לנסוע',
    },
  }],
  list: [{
    file: 'word-list-vocab.jpg',
    words: "a hundred|a lot of|about|age|also|April|August|bathroom|building|candy|card|classroom|date|December|dining room|do|eighteen|eighty|end|every|everyone|far|fifteen|February|fifty|flat|flour|flower|for|forty|fourteen|give|goal|guitar|hear|her|hobby|I'm sorry|Israel|January|July|June|kick|like|March|market|May|month|nineteen|ninety|November|October|other|outside|piano|play|present|pretty|ready|same|sell|September|seventeen|seventy|sixteen|sixty|sofa|song|soon|special|student|study|subject|sweet|teach|their|then|thing|thirteen|thirty|throw|toilet|trip|twenty|village|wait|year".split('|'),
    maxMissing: 3,                       // OCR is not perfect (currently misses "other")
    marginJunk: ['תרגמו', 'נכונים'],     // Hebrew labels printed in the page margin - must never become a meaning
  }, {
    file: 'word-list-afternoon.jpg',     // "(v)" is a part-of-speech note and is dropped; "look (for)" keeps its word: "look for"
    words: "afternoon|all|another|any|anything|as usual|ask for|before|blouse|body|bookshop|breakfast|butter|call|camera|cook|corner|cream|cucumber|cup|customer|different|don't worry|enjoy|evening|everything|friendly|garlic|Good afternoon|Have a good day|jam|knee|less|long|look for|mix|mug|neck|next|night|note|oil|once|onion|only|out|pass|pepper|put|quick|raincoat|recipe|restaurant|rice|salt|save|sometimes|spoon|steak|sugar|supper|take care of|tea|that|toy|understand|vegetable|waiter|waitress|watermelon|website|weekend|Well done|which|wrong|Yes please|yogurt".split('|'),
    maxMissing: 0,
    marginJunk: [],
  }, {
    file: 'word-list-quarter.jpg',
    words: "a quarter past|a quarter to|adult|after|again|ago|always|artist|aunt|because|build|be called|choose|clock|club|country|cry|easy|excited|find|first|fix|get|get up|hard|hour|how|hurt|ice|important|interesting|keep|later|lie|many|medal|minute|money|more|move|need|neighbor|noise|of|Olympic Games|or|our|paint|parent|place|plate|player|poor|practice|prepare|prize|problem|race|right|road|safe|second|sick|sign|some|something|son|table tennis|them|think|time|tomorrow|true|us|use|was|way|winner".split('|'),
    maxMissing: 0,
    marginJunk: [],
  }, {
    file: 'word-list-anywhere.jpg',      // "Do you know ... ?" / "not very ..." lose their dots; "watch (n)" loses its note
    words: "anywhere|as|ate|begin|beginning|catch|center|cool|dancer|daughter|difficult|Do you know|doll|drive|dry|early|farmer|floor|good luck|grandchildren|granddaughter|grandparents|grandson|group|half|have a nice time|heavy|him|hold|holiday|How about|husband|inside|internet|jacket|jeans|just|language|last night|late|laugh|leather|lie down|make plans|maybe|movie|never|nobody|not very|often|painter|part|price|program|push|radio|real|runner|Say it again please|seat|See you later|singer|someone|speak|spend|storm|strong|taxi|than|the moon|there|those|ticket|tonight|turn on|uncle|until|watch|well|wife|writer|yesterday|young".split('|'),
    maxMissing: 0,
    marginJunk: [],
  }],
};

// which tests: none = the fast ones (run on the computer before a push); "slow" = the slow ones (GitHub runs them after
// every push, .github/workflows/tests.yml); "all" = every test; or one test's name
const only = process.argv[2];
const SLOW = new Set(['list', 'pairs', 'learn', 'keep']);   // OCR of photos, the whole learning path, app updates (each 45s-2.5min)
const wanted = name => !only ? !SLOW.has(name) : only === 'slow' ? SLOW.has(name) : only === 'all' || only === name;
const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && fs.existsSync(p));
if (!chromePath) { console.error('Chrome/Edge not found. Set CHROME_PATH.'); process.exit(2); }

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

const cdnCache = path.join(here, 'node_modules', '.cdn-cache');   // git-ignored with node_modules
const failures = [];
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures.push(msg); };

const browser = await puppeteer.launch({ executablePath: chromePath, headless: 'new', args: ['--no-sandbox'], protocolTimeout: 600000 });

// Opens the page with both translation services stubbed (Google first, MyMemory as fallback).
// mode(n, service) decides per request: 'ok' | 'fail'   (n counts all translation requests, service = 'google' | 'mm').
// marks the device as having used the app before, so the first-run "pick a name" box doesn't open (firstRun: let it)
async function newTestPage(ctx, firstRun = false) {
  const page = await ctx.newPage();
  if (!firstRun) await page.evaluateOnNewDocument(() => { try { if (/^http/.test(location.protocol)) localStorage.setItem('englishquiz-test', '1'); } catch (e) {} });
  return page;
}

async function openPage(mode = () => 'ok', { fresh = false } = {}) {
  const ctx = await browser.createBrowserContext();       // fresh storage per test (the page saves the word list)
  const page = await newTestPage(ctx);
  const closePage = page.close.bind(page);
  page.close = async () => { await closePage(); await ctx.close(); };
  await page.setViewport({ width: 360, height: 800 });   // small phone
  page.pageErrors = []; page.tr = { total: 0, failed: 0, google: 0, mm: 0, bank: 0 };
  page.on('pageerror', e => page.pageErrors.push(e.message));
  await page.setBypassServiceWorker(true);   // so every request below is seen (and can be stubbed) by the page
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = req.url();
    // the built-in word bank files: counted, and can be made to fail with mode(0, 'bank', url)
    if (u.includes('/wordbank/')) { page.tr.bank++; return mode(0, 'bank', u) === 'fail' ? req.abort('failed') : req.continue(); }
    // ☁️ never reach the real Firebase from the tests (it would take test names like "נועה" in the real players list):
    // the cloud script then doesn't load, and the game works as it does without a network
    if (/gstatic\.com\/firebasejs|firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/.test(u)) return req.abort('failed');
    // the OCR library and its language files come from a CDN; keep a local copy so a slow CDN can't stall the tests
    if (/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//.test(u)) {
      const f = path.join(cdnCache, encodeURIComponent(u));
      if (fs.existsSync(f)) return req.respond({ status: 200, contentType: u.endsWith('.js') ? 'text/javascript' : 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f) });
      return req.continue();
    }
    const service = u.includes('translate.googleapis.com') ? 'google' : u.includes('api.mymemory.translated.net') ? 'mm' : null;
    if (!service) return req.continue();
    const n = ++page.tr.total; page.tr[service]++;
    if (mode(n, service, u) === 'fail') { page.tr.failed++; return req.abort('failed'); }
    // Google answers with vowel marks (niqqud); the page must strip them -> 'תרגום'.
    // With dt=bd it also returns dictionary entries (other meanings, grouped by part of speech).
    const body = service === 'google'
      ? (u.includes('dt=bd')
        ? [[['בחוץ', 'outside']], [['adverb', ['בָּחוּץ', 'הַחוּצָה'], [['בחוץ', ['outside'], 0.5], ['החוצה', ['outside'], 0.2]], 'outside'], ['noun', ['חוּץ'], [['חוץ', ['outside'], 0.1]], 'outside']]]
        : [[['תַּרְגּוּם', 'x', null, null, 2]], null, 'en'])
      : { responseData: { translatedText: 'תרגום' }, responseStatus: 200, matches: [] };
    req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  page.on('response', async res => {
    const u = res.url(), f = path.join(cdnCache, encodeURIComponent(u));
    if (!/^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//.test(u) || !res.ok() || fs.existsSync(f)) return;
    try { const body = await res.buffer(); fs.mkdirSync(cdnCache, { recursive: true }); fs.writeFileSync(f, body); } catch (e) {}
  });
  // New users start on the learning tab; most tests are about the word list, so they start on the random tab
  // (as a returning user who picked it). { fresh: true } opens the page as a brand-new user.
  if (!fresh) await page.evaluateOnNewDocument(() => { try { if (!localStorage.getItem('englishquiz-mode')) localStorage.setItem('englishquiz-mode', 'random'); } catch (e) {} });
  // the random +50 box bonus would make point checks flaky: it never comes unless a test asks for it (the boxextra test)
  await page.evaluateOnNewDocument(() => { try { if (!localStorage.getItem('englishquiz-box-extra')) localStorage.setItem('englishquiz-box-extra', JSON.stringify({ n: 0, at: 1e9 })); } catch (e) {} });
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

async function uploadAndRead(page, file) {
  // In headless Chrome the OCR engine now and then never finishes starting ("טוען OCR"), before any reading.
  // That is retried once on a reloaded page; a stall anywhere else is reported with the step it stopped at.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.evaluate(() => setMode('picture'));   // photos belong to the picture tab (random words is the default tab)
    await (await page.$('#photo-input')).uploadFile(path.resolve(here, 'fixtures', file));
    const done = await page.waitForFunction(() => /מוכן|שגיאה/.test(document.getElementById('photo-status').innerText), { timeout: 90000 }).then(() => true, () => false);
    if (done) break;
    const at = await page.$eval('#photo-status', e => e.innerText);
    console.log(`  (reading ${file} stalled at: ${at}${attempt === 1 && /טוען OCR/.test(at) ? ' - retrying' : ''})`);
    if (attempt === 2 || !/טוען OCR/.test(at)) break;
    await page.reload({ waitUntil: 'load' });
    page.tr = { total: 0, failed: 0, google: 0, mm: 0, bank: 0 };
  }
  const status = await page.$eval('#photo-status', e => e.innerText);
  const rows = await page.$$eval('#words-table tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('input')].map(i => i.value.trim())));
  return { status, rows };
}

const overflowOf = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function testPairs(fx) {
  console.log(`\n[pairs] English + Hebrew in the photo (${fx.file})`);
  const page = await openPage();
  const { status, rows } = await uploadAndRead(page, fx.file);
  const exp = fx.pairs, got = Object.fromEntries(rows.map(r => [r[0], r[1]]));
  check(/מוכן/.test(status), `OCR finished (${status})`);
  check(rows.length === Object.keys(exp).length, `row count is ${Object.keys(exp).length} (got ${rows.length})`);
  for (const [en, he] of Object.entries(exp)) check(got[en] === he, `${en} -> ${he}${got[en] === he ? '' : `   (got: ${got[en] ?? 'missing'})`}`);
  check(page.tr.total === 0, `no translation requests needed (made ${page.tr.total})`);

  const parsed = await page.evaluate(() => parseWords(document.getElementById('words-input').value));
  check(!parsed.error && parsed.words.length === Object.keys(exp).length, `parseWords OK (${parsed.error || parsed.words?.length + ' words'})`);
  for (const w of parsed.words || []) if (exp[w.word]) check(w.correct === exp[w.word], `game correct answer for "${w.word}" is the full meaning`);
  const outside = (parsed.words || []).find(w => w.word === 'outside');
  if (exp.outside) check(outside && !outside.dynamics.includes('החוצה'), 'part of a meaning is not reused as a wrong answer');

  const ov = await overflowOf(page);
  check(ov <= 0, `no horizontal overflow at 360px (overflow: ${ov}px)`);
  await page.click('#start-btn');
  await new Promise(r => setTimeout(r, 500));
  const q = await page.$eval('#question-word', e => e.innerText.trim());
  check(Object.hasOwn(exp, q), `game starts with a word from the photo ("${q}")`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

async function testList(fx) {
  console.log(`\n[list] English-only list, meanings from translation (${fx.file})`);
  const page = await openPage();
  const { status, rows } = await uploadAndRead(page, fx.file);
  const got = rows.map(r => r[0]), gotLc = got.map(w => w.toLowerCase());
  const missing = fx.words.filter(w => !gotLc.includes(w.toLowerCase()));
  const extra = got.filter(w => !fx.words.map(x => x.toLowerCase()).includes(w.toLowerCase()));
  check(/מוכן/.test(status), `OCR finished (${status})`);
  check(missing.length <= fx.maxMissing, `found ${fx.words.length - missing.length}/${fx.words.length} words (missing: ${missing.join(', ') || '-'})`);
  check(extra.length === 0, `no wrong/garbled words (extra: ${extra.join(', ') || '-'})`);
  const notTranslated = rows.filter(r => r[1] !== 'תרגום');
  check(notTranslated.length === 0, `every word got its (stubbed) translation, none blank or paired with page text${notTranslated.length ? ' (got: ' + notTranslated.map(r => `${r[0]}=${JSON.stringify(r[1])}`).join(', ') + ')' : ''}`);
  check(page.tr.google >= rows.length && page.tr.mm === 0, `translated through Google only, no MyMemory calls (google: ${page.tr.google}, mymemory: ${page.tr.mm})`);
  const junk = rows.filter(r => fx.marginJunk.includes(r[1]));
  check(junk.length === 0, `Hebrew from the page margin is not used as a meaning${junk.length ? ' (' + junk.map(r => r[0]).join(', ') + ')' : ''}`);
  const ov = await overflowOf(page);
  check(ov <= 0, `no horizontal overflow at 360px (overflow: ${ov}px)`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// Rate limiting / flaky network: retries recover; a service that never answers leaves a blank, not the English word.
async function testTranslationRetry() {
  console.log('\n[translation] Google first, MyMemory fallback, retries, cache');
  const tr = (page, w) => page.evaluate(x => translateWithRetry(x), w);

  let page = await openPage();
  const t0 = await tr(page, 'apple');
  check(t0 === 'תרגום', `Google answer is used, vowel marks stripped (got ${JSON.stringify(t0)})`);
  check(page.tr.google === 1 && page.tr.mm === 0, `only Google was asked (google ${page.tr.google}, mymemory ${page.tr.mm})`);
  await tr(page, 'apple');
  check(page.tr.total === 1, `a translated word is cached - no new request (total ${page.tr.total})`);
  await page.close();

  page = await openPage((n, service) => (service === 'google' ? 'fail' : 'ok'));
  const t1 = await tr(page, 'apple');
  check(t1 === 'תרגום' && page.tr.google === 1 && page.tr.mm === 1, `falls back to MyMemory when Google is unreachable (got ${JSON.stringify(t1)}; google ${page.tr.google}, mymemory ${page.tr.mm})`);
  await page.close();

  page = await openPage(n => (n <= 4 ? 'fail' : 'ok'));
  const t2 = await tr(page, 'apple');
  check(t2 === 'תרגום' && page.tr.total === 5, `retries after both services failed twice (got ${JSON.stringify(t2)}, ${page.tr.total} requests)`);
  await page.close();

  page = await openPage(() => 'fail');
  const t3 = await tr(page, 'banana');
  check(t3 === null, `returns null when no service ever answers (got ${JSON.stringify(t3)}, ${page.tr.total} requests)`);
  await page.close();
}

// "Practise the words I missed": the summary offers the missed words, a clean round clears them, "all words" goes back.
async function testPractice() {
  console.log('\n[practice] practise missed words');
  const page = await openPage();
  await page.evaluate(() => { document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב\ncat\tחתול\nsun\tשמש'; renderWords(); });
  await page.click('#start-btn');

  // Plays the round on screen. Words in `miss` are answered wrong first (like a student), then right.
  const playRound = async (miss = []) => {
    for (let guard = 0; guard < 20; guard++) {
      const st = await page.evaluate(() => ({ summary: getComputedStyle(document.getElementById('summary-screen')).display !== 'none', word: wordsData[currentIndex]?.word, correct: wordsData[currentIndex]?.correct }));
      if (st.summary) return;
      await page.evaluate((miss, st) => {
        const btns = [...document.querySelectorAll('#answers-container button')];
        if (miss.includes(st.word)) btns.find(b => b.innerText !== st.correct).click();
        btns.find(b => b.innerText === st.correct).click();
      }, miss, st);
      await new Promise(r => setTimeout(r, 650));
    }
  };
  const vis = sel => page.$eval(sel, e => getComputedStyle(e).display !== 'none');
  const text = sel => page.$eval(sel, e => e.innerText.trim());

  await playRound(['dog', 'sun']);
  check(await vis('#practice-missed-btn') && /\(2\)/.test(await text('#practice-missed-btn')), `summary offers to practise the 2 missed words ("${await text('#practice-missed-btn')}")`);
  check(!(await vis('#all-words-btn')), '"all words" button is hidden in a normal round');

  await page.click('#practice-missed-btn');
  const words = await page.evaluate(() => wordsData.map(w => w.word).sort());
  check(JSON.stringify(words) === JSON.stringify(['dog', 'sun']), `practice round has only the missed words (${words.join(', ')})`);
  check(await text('#total-progress') === '2', `progress shows 2 questions (${await text('#total-progress')})`);

  await playRound([]);   // clean round
  check(!(await vis('#practice-missed-btn')), 'no missed words left -> practice button is hidden');
  check(await vis('#all-words-btn'), '"all words" button is shown after practising');

  await page.click('#all-words-btn');
  check(await text('#total-progress') === '4', `"all words" returns to the full list (${await text('#total-progress')} questions)`);

  await playRound(['cat']);                       // missed words are tracked fresh each round
  check(/\(1\)/.test(await text('#practice-missed-btn')), `a new round starts counting from zero ("${await text('#practice-missed-btn')}")`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// The ▾ button: other meanings from the dictionary, light-yellow auto-translated cells, remembered choice.
async function testChooser() {
  console.log('\n[chooser] pick another meaning');
  let page = await openPage();
  await page.evaluate(async () => {
    const he = await translateWithRetry('outside');            // automatic translation -> counts as unconfirmed
    document.getElementById('words-input').value = 'outside\t' + he;
    renderWords();
  });
  const cell = () => page.$eval('#words-table tbody tr td:nth-child(2) input', e => ({ bg: getComputedStyle(e).backgroundColor, value: e.value }));
  const hint = () => page.$eval('#words-hint', e => (getComputedStyle(e).display === 'none' ? '' : e.innerText));
  check((await cell()).bg === 'rgb(255, 251, 234)', `auto-translated cell is light yellow (${(await cell()).bg})`);
  check((await hint()).includes('▾'), `a hint explains the colour and the ▾ button ("${await hint()}")`);

  await page.click('#words-table tbody tr button[aria-label="פירושים נוספים"]');
  await page.waitForSelector('[data-role=alternatives] button');
  const opts = await page.$$eval('[data-role=alternatives] button', bs => bs.map(b => b.innerText));
  const labels = await page.$eval('[data-role=alternatives]', e => e.innerText);
  check(['בחוץ', 'החוצה', 'חוץ'].every(o => opts.includes(o)), `chooser lists the dictionary meanings, vowel marks stripped (${opts.join(', ')})`);
  check(labels.includes('תואר פועל') && labels.includes('שם עצם'), 'meanings are grouped by part of speech');

  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText === 'ביטול').click());
  check((await cell()).value === 'תרגום' && !(await page.$('[data-role=alternatives]')), 'cancel closes the chooser and changes nothing');

  await page.click('#words-table tbody tr button[aria-label="פירושים נוספים"]');
  await page.waitForSelector('[data-role=alternatives] button');
  await page.evaluate(() => [...document.querySelectorAll('[data-role=alternatives] button')].find(b => b.innerText === 'החוצה').click());
  const after = await cell();
  const stored = await page.$eval('#words-input', e => e.value);
  check(after.value === 'החוצה' && stored === 'outside\tהחוצה', `the picked meaning is written to the cell and the list (${JSON.stringify(stored)})`);
  check(after.bg !== 'rgb(255, 251, 234)' && (await hint()) === '', 'a confirmed meaning is no longer yellow, hint disappears');
  const again = await page.evaluate(() => translateWithRetry('outside'));
  check(again === 'החוצה', `the choice is remembered for the next photo (got ${JSON.stringify(again)})`);
  const reqs = page.tr.total;
  await page.reload({ waitUntil: 'load' });   // the list is saved on every change, no game needed
  check((await cell()).bg !== 'rgb(255, 251, 234)', 'after a reload the confirmed cell is still not yellow');
  check(page.tr.total === reqs, 'no extra translation requests were needed');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();

  // offline / blocked dictionary request -> a friendly message, nothing breaks
  page = await openPage((n, service, u) => (u.includes('dt=bd') ? 'fail' : 'ok'));
  await page.evaluate(() => { document.getElementById('words-input').value = 'outside\tבחוץ'; renderWords(); });
  await page.click('#words-table tbody tr button[aria-label="פירושים נוספים"]');
  await page.waitForFunction(() => /בדקו את החיבור/.test(document.querySelector('[data-role=alternatives]')?.innerText || ''), { timeout: 10000 });
  check(true, 'when the dictionary can not be reached the chooser says so (check the connection)');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText === 'ביטול').click());
  check((await page.$eval('#words-input', e => e.value)) === 'outside\tבחוץ', 'the list is unchanged after a failed lookup');
  await page.close();
}

// The "English | עברית" header must stay in place while a long list scrolls, with the rows going UNDER it.
async function testHeader() {
  console.log('\n[header] sticky table header');
  const page = await openPage();
  await page.evaluate(() => {
    document.getElementById('words-input').value = Array.from({ length: 40 }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n');
    renderWords();
  });
  const probe = () => page.evaluate(() => {
    const wrap = document.getElementById('words-table').parentElement;
    const ths = [...document.querySelectorAll('#words-table th')];
    const covered = ths.filter(th => th.textContent).map(th => {
      const r = th.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === th || th.contains(top);
    });
    return { scroll: Math.round(wrap.scrollTop), headerTop: Math.round(ths[0].getBoundingClientRect().top), headerOnTop: covered.every(Boolean) };
  });
  const before = await probe();
  await page.evaluate(() => { document.getElementById('words-table').parentElement.scrollTop = 600; });
  const after = await probe();
  check(after.scroll >= 500, `the list scrolled (${after.scroll}px)`);
  check(after.headerTop === before.headerTop, `header stays in place while scrolling (top ${before.headerTop}px -> ${after.headerTop}px)`);
  check(after.headerOnTop, 'rows slide under the header and never cover its text');
  await page.close();
}

// Corrections must survive a refresh (and any other reload) without starting a game.
async function testPersist() {
  console.log('\n[persist] edits survive a refresh');
  const page = await openPage();
  await page.evaluate(async () => {
    const lines = [];
    for (const w of ['apple', 'dog', 'cat']) lines.push(w + '\t' + await translateWithRetry(w));   // automatic translations
    document.getElementById('words-input').value = lines.join('\n');
    renderWords();
  });
  const cells = () => page.$$eval('#words-table tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('input')].map(i => i.value)));

  // 1) type a correction into a Hebrew cell, leave the cell
  const heInputs = await page.$$('#words-table tbody tr td:nth-child(2) input');
  await heInputs[0].click({ clickCount: 3 });
  await heInputs[0].type('תפוח עץ');
  await page.keyboard.press('Tab');
  // 2) delete the 'dog' row, add a new word by hand
  await page.click('#words-table tbody tr:nth-child(2) button[aria-label="מחיקת השורה"]');
  await page.evaluate(() => addWordRow());
  const enInputs = await page.$$('#words-table tbody tr td:nth-child(1) input');
  await enInputs[enInputs.length - 1].type('sun');
  const heInputs2 = await page.$$('#words-table tbody tr td:nth-child(2) input');
  await heInputs2[heInputs2.length - 1].type('שמש');
  await page.keyboard.press('Tab');

  await page.reload({ waitUntil: 'load' });   // like pull-to-refresh / F5 - no game was started
  const after = await cells();
  check(JSON.stringify(after) === JSON.stringify([['apple', 'תפוח עץ'], ['cat', 'תרגום'], ['sun', 'שמש']]), `the table after a reload keeps the corrections, the deleted row and the new row (${JSON.stringify(after)})`);
  const yellow = await page.$$eval('#words-table tbody tr td:nth-child(2) input', is => is.map(i => getComputedStyle(i).backgroundColor === 'rgb(255, 251, 234)'));
  check(JSON.stringify(yellow) === JSON.stringify([false, true, false]), `only the untouched automatic translation is still yellow (${JSON.stringify(yellow)})`);
  const again = await page.evaluate(() => translateWithRetry('apple'));
  check(again === 'תפוח עץ', `reading the same word again keeps the typed correction (got ${JSON.stringify(again)})`);

  await page.click('button[onclick="clearWords()"]');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText === 'מחיקה').click());
  await page.reload({ waitUntil: 'load' });
  check((await cells()).length === 0, 'after "clear the list" and a reload the list stays empty');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// The built-in word bank files themselves: format, size, no duplicates, clean Hebrew.
async function testWordbank() {
  console.log('\n[wordbank] built-in word bank files');
  const bank = {}, allEn = new Map();
  for (let lv = 1; lv <= 9; lv++) {
    const f = path.join(root, 'wordbank', `level-${lv}.txt`);
    if (!fs.existsSync(f)) { check(false, `level-${lv}.txt exists`); continue; }
    bank[lv] = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|'));   // '# category' header lines (in Hebrew) group the words of every level
  }
  check(Object.keys(bank).length === 9, 'there are 9 level files');
  const total = Object.values(bank).flat().length;
  check(Object.values(bank).every(a => a.length >= 100), `every level has at least 100 words (${Object.entries(bank).map(([l, a]) => `L${l}:${a.length}`).join(' ')}; ${total} in total)`);
  const badFormat = [], badEn = [], badHe = [], longHe = [], dupEn = [], badPic = [];
  for (const [lv, arr] of Object.entries(bank)) for (const p of arr) {
    const [en, he, pic] = p;
    if (p.length < 2 || p.length > 3 || !en.trim() || !he.trim()) { badFormat.push(`L${lv} ${p.join('|')}`); continue; }
    if (p.length === 3 && !/^[0-9]\uFE0F\u20E3$/.test(pic) && !/^\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?|\p{Emoji_Modifier})*$/u.test(pic)) badPic.push(`L${lv} ${en}=${pic}`);
    if (!/^[A-Za-z][A-Za-z' -]*$/.test(en)) badEn.push(`L${lv} ${en}`);
    if (!/^[֐-׿][֐-׿ '"\-\/,]*$/.test(he) || /[֑-ׇ]/.test(he)) badHe.push(`L${lv} ${en}=${he}`);
    if (he.split(/\s+/).length > 3) longHe.push(`L${lv} ${en}=${he}`);
    const k = en.toLowerCase(); if (allEn.has(k)) dupEn.push(`${en} (L${allEn.get(k)} and L${lv})`); else allEn.set(k, lv);
  }
  check(!badFormat.length, `every line is "english|hebrew" or "english|hebrew|emoji" (${badFormat.slice(0, 3).join('; ') || 'ok'})`);
  check(!badPic.length, `a picture is a single emoji (${badPic.slice(0, 5).join(', ') || 'ok'})`);
  check(!badEn.length, `English words use plain letters only (${badEn.slice(0, 5).join(', ') || 'ok'})`);
  check(!badHe.length, `Hebrew uses Hebrew letters only, no vowel marks (${badHe.slice(0, 5).join(', ') || 'ok'})`);
  check(!longHe.length, `no Hebrew meaning is longer than 3 words (${longHe.slice(0, 5).join(', ') || 'ok'})`);
  check(!dupEn.length, `no English word appears twice in the bank (${dupEn.slice(0, 5).join(', ') || 'ok'})`);
}

// The 🎲 button: 20 random words of the chosen level go into the table.
async function testRandom() {
  console.log('\n[random] 20 random words by level');
  const bankOf = lv => fs.readFileSync(path.join(root, 'wordbank', `level-${lv}.txt`), 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('|'));
  let page = await openPage();
  const table = () => page.$$eval('#words-table tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('input')].map(i => i.value)));
  const selectLevel = lv => page.select('#level-select', String(lv));

  await selectLevel(5);
  await page.click('#random-btn');
  await page.waitForFunction(() => document.querySelectorAll('#words-table tbody tr').length === 20, { timeout: 10000 });
  const first = await table();
  const level5 = Object.fromEntries(bankOf(5));
  check(first.length === 20 && new Set(first.map(r => r[0])).size === 20, 'the table has 20 different words');
  check(first.every(r => level5[r[0]] === r[1]), 'every word and meaning comes from level 5 of the bank');
  check((await page.$eval('#random-status', e => e.innerText)).includes('רמה 5'), `a message says which level was used ("${await page.$eval('#random-status', e => e.innerText)}")`);

  // another click on a non-empty list asks first; cancel keeps the list
  await page.click('#random-btn');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.innerText === 'ביטול'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText === 'ביטול').click());
  check(JSON.stringify(await table()) === JSON.stringify(first), 'cancelling the question keeps the current list');
  // confirm replaces it with a new random set
  await page.click('#random-btn');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.innerText === 'החלפה'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.innerText === 'החלפה').click());
  await page.waitForFunction(first => JSON.stringify([...document.querySelectorAll('#words-table tbody tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value))) !== first, { timeout: 10000 }, JSON.stringify(first));
  const second = await table();
  check(second.length === 20 && JSON.stringify(second) !== JSON.stringify(first), 'confirming replaces the list with a different random set');

  // level + list survive a reload
  await page.reload({ waitUntil: 'load' });
  check(JSON.stringify(await table()) === JSON.stringify(second), 'the list is still there after a reload');
  check(await page.$eval('#level-select', e => e.value) === '5', 'the chosen level is remembered');

  // a meaning picked by hand earlier wins over the bank's default; and the game starts with the 20 words
  await page.evaluate(() => { chosen['hello'] = 'שלום רב'; shuffle = a => a; });   // no shuffling: the first 20 words of the level
  await page.evaluate(() => { document.getElementById('words-input').value = ''; renderWords(); });
  await selectLevel(1);
  await page.click('#random-btn');
  await page.waitForFunction(() => document.querySelectorAll('#words-table tbody tr').length === 20);
  const l1 = await table();
  check(l1[0][0] === 'hello' && l1[0][1] === 'שלום רב', `a hand-picked meaning wins over the bank (${l1[0].join(' = ')})`);
  await page.click('#start-btn');
  await new Promise(r => setTimeout(r, 400));
  check(await page.$eval('#total-progress', e => e.innerText) === '20', 'the game starts with 20 questions');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();

  // the bank can't be loaded (offline / blocked): friendly message, the list is untouched
  page = await openPage((n, service, u) => (service === 'bank' && u.includes('level-3') ? 'fail' : 'ok'));
  await page.evaluate(() => { document.getElementById('words-input').value = 'apple\tתפוח'; renderWords(); });
  await selectLevel(3);
  await page.click('#random-btn');
  await page.waitForFunction(() => /מאגר המילים/.test(document.getElementById('random-status').innerText), { timeout: 10000 });
  check(JSON.stringify(await table()) === JSON.stringify([['apple', 'תפוח']]), 'when the level cannot be loaded the list is not touched');
  check((await page.$eval('#random-status', e => e.innerText)).includes('בדקו את החיבור'), 'and a message asks to check the connection');
  await page.close();
}

// The app view never scrolls (any screen, any common portrait phone size); only the words box does.
async function testLayout() {
  console.log('\n[layout] no page scrolling, only the words box scrolls');
  const page = await openPage();
  const wordsText = n => Array.from({ length: n }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n');
  const setWords = n => page.evaluate(t => { document.getElementById('words-input').value = t; renderWords(); }, wordsText(n));
  const pageOverflow = () => page.evaluate(() => ({ y: document.documentElement.scrollHeight - innerHeight, x: document.documentElement.scrollWidth - innerWidth }));

  for (const [w, h] of [[320, 568], [360, 640], [360, 740], [390, 844], [412, 915]]) {
    const tag = `${w}x${h}`;
    await page.setViewport({ width: w, height: h });
    await page.evaluate(() => showStart());
    for (const n of [20, 40]) {
      await setWords(n);
      const o = await pageOverflow();
      const s = await page.evaluate(() => {
        const box = document.querySelector('.words-box'), b = document.getElementById('start-btn').getBoundingClientRect();
        return { boxScrolls: box.scrollHeight > box.clientHeight, btnInView: b.top >= 0 && b.bottom <= innerHeight };
      });
      check(o.y <= 0 && o.x <= 0, `${tag}, ${n} words: the page does not scroll (vertical ${o.y}px, horizontal ${o.x}px)`);
      check(s.boxScrolls && s.btnInView, `${tag}, ${n} words: the words box scrolls and the start button stays in view`);
    }
    // random-words button and level picker share one line, inside the card
    const line = await page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect(), b = r('random-btn'), s = r('level-select'), c = document.querySelector('.game-container').getBoundingClientRect();
      return { sameLine: Math.abs((b.top + b.bottom) / 2 - (s.top + s.bottom) / 2) <= 4, inside: Math.min(b.left, s.left) >= c.left && Math.max(b.right, s.right) <= c.right };
    });
    check(line.sameLine && line.inside, `${tag}: "20 random words" and the level picker are on one line, inside the card`);
    // game screen and the busiest result screen (all 4 buttons)
    await setWords(6);
    await page.evaluate(() => startFromInput());
    const g = await pageOverflow();
    check(g.y <= 0 && g.x <= 0, `${tag}, game screen: the page does not scroll (${g.y}px)`);
    // with the streak emoji showing at the top there is less room: it must still fit
    await page.evaluate(() => { streak = 75; shownStage = 0; updateStreakEmoji(); });
    const geNow = () => page.evaluate(() => ({ y: document.documentElement.scrollHeight - innerHeight, x: document.documentElement.scrollWidth - innerWidth, h: document.getElementById('streak-emoji').offsetHeight }));
    await new Promise(r => setTimeout(r, 300));
    const mid = await geNow();     // while the emoji is still popping in
    await new Promise(r => setTimeout(r, 700));
    const ge = await geNow();      // after the animation
    check(Math.max(mid.y, ge.y, mid.x, ge.x) <= 0 && ge.h >= 40, `${tag}, game screen with the streak emoji on top (${ge.h}px high): the page does not scroll, not even while it pops in (vertical ${ge.y}px, horizontal ${Math.max(mid.x, ge.x)}px)`);
    await page.evaluate(() => { missed = wordsData.slice(0, 2); wordsData = wordsData.slice(0, 3); showSummary(); });
    const r = await pageOverflow();
    check(r.y <= 0 && r.x <= 0, `${tag}, result screen with 4 buttons: the page does not scroll (${r.y}px)`);
  }
  // the picture tab must fit too
  await page.evaluate(() => setMode('picture'));
  for (const [w, h] of [[320, 568], [360, 640], [412, 915]]) {
    await page.setViewport({ width: w, height: h });
    for (const n of [0, 20, 40]) {
      await setWords(n);
      const o = await pageOverflow();
      const s = await page.evaluate(() => ({ btnInView: document.getElementById('start-btn').getBoundingClientRect().bottom <= innerHeight, photoInView: document.getElementById('photo-btn').getBoundingClientRect().bottom <= innerHeight }));
      check(o.y <= 0 && o.x <= 0 && s.btnInView && s.photoInView, `${w}x${h}, picture tab, ${n} words: no page scrolling, photo and start buttons in view`);
    }
  }
  // the four grey action buttons look the same, and the photo one is a real button that opens the file chooser
  await page.setViewport({ width: 360, height: 740 });
  await page.evaluate(() => showStart());
  const looks = await page.$$eval('#start-screen .action-btn', bs => bs.map(b => { const s = getComputedStyle(b); return { id: b.id || b.textContent.trim().slice(0, 12), tag: b.tagName, look: [s.backgroundColor, s.borderTopWidth, s.borderTopColor, s.borderRadius, s.fontSize, s.color, s.boxShadow].join('|') }; }));
  check(looks.length === 4 && looks.every(l => l.tag === 'BUTTON'), `there are 4 action buttons and all are real buttons (${looks.map(l => l.id).join(', ')})`);
  check(new Set(looks.map(l => l.look)).size === 1, 'the add, clear, random-words and photo buttons share the same look');
  const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }).catch(() => null), page.click('#photo-btn')]);
  check(!!chooser, 'the photo button opens the file chooser');
  if (chooser) await chooser.cancel();
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// "→ תפריט" in the middle of a quiz: asks first, cancelling carries on, confirming goes to the main menu.
async function testBack() {
  console.log('\n[back] back to the main menu from a quiz');
  const page = await openPage();
  await page.evaluate(() => { document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב\ncat\tחתול\nsun\tשמש'; renderWords(); });
  const vis = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const txt = id => page.$eval('#' + id, e => e.innerText.trim());
  const total = () => page.evaluate(() => localStorage.getItem('englishquiz-total-points'));
  const dialogOpen = text => page.waitForFunction(t => [...document.querySelectorAll('button')].some(b => b.innerText.trim() === t), { timeout: 5000 }, text);
  const clickText = t => page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === t).click(), t);
  const clickCorrect = () => page.evaluate(() => { const c = wordsData[currentIndex].correct; [...document.querySelectorAll('#answers-container button')].find(b => b.innerText === c).click(); });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await page.click('#start-btn');
  check(await vis('game-screen') && await vis('back-btn'), 'the quiz screen has a back-to-menu button');

  await page.click('#back-btn'); await dialogOpen('חזרה לתפריט');
  check(true, 'tapping it asks before leaving');
  await clickText('ביטול');
  check(await vis('game-screen') && !(await vis('start-screen')) && await txt('current-progress') === '1', 'cancel stays in the quiz, on the same question');
  await clickCorrect();
  await page.click('#back-btn'); await dialogOpen('חזרה לתפריט'); await clickText('ביטול');
  await page.waitForFunction(() => document.getElementById('current-progress').innerText === '2', { timeout: 5000 });
  check(true, 'cancelling right after a right answer still moves on to the next word');

  const before = await total();
  await page.click('#back-btn'); await dialogOpen('חזרה לתפריט'); await clickText('חזרה לתפריט');
  check(await vis('start-screen') && !(await vis('game-screen')) && !(await vis('summary-screen')), 'confirming goes back to the main menu');
  check((await total()) === before, `the points of the abandoned round are not added to the total (${before} -> ${await total()})`);
  check((await page.$$eval('#words-table tbody tr', r => r.length)) === 4, 'the word list is still there');

  await page.click('#start-btn');
  check(await txt('current-progress') === '1' && await txt('total-progress') === '4' && await txt('score') === '0', 'a new quiz starts from the beginning (question 1 of 4, 0 points)');

  // leaving at the very moment the LAST answer is right: the pending "next question" must not pop the result screen up
  for (let i = 0; i < 3; i++) { await clickCorrect(); await wait(700); }
  const before2 = await total();
  await clickCorrect();
  await page.click('#back-btn'); await dialogOpen('חזרה לתפריט'); await clickText('חזרה לתפריט');
  await wait(900);
  check(await vis('start-screen') && !(await vis('summary-screen')) && !(await vis('game-screen')), 'leaving right after the last right answer stays on the main menu (no result screen pops up)');
  check((await total()) === before2, 'and no points were added');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// Two tabs: random words (default) and picture. Each keeps its own list.
async function testTabs() {
  console.log('\n[tabs] random words / picture tabs, one list each');
  let page = await openPage();
  const vis = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const selected = id => page.$eval('#' + id, e => e.getAttribute('aria-selected'));
  const table = () => page.$$eval('#words-table tbody tr', trs => trs.map(tr => [...tr.querySelectorAll('input')].map(i => i.value)));
  const setText = t => page.evaluate(t => { document.getElementById('words-input').value = t; renderWords(); saveRows(); }, t);

  check(await selected('tab-random') === 'true' && await selected('tab-picture') === 'false', 'the random-words tab is the default');
  check(await vis('panel-random') && !(await vis('panel-picture')), 'the default tab shows the level picker and the dice button, not the photo button');
  check((await page.$eval('#words-count', e => e.innerText)).includes('🎲'), 'an empty random list says to press the dice');

  await setText('apple\tתפוח\ndog\tכלב');
  await page.click('#tab-picture');
  check(await selected('tab-picture') === 'true' && await vis('panel-picture') && !(await vis('panel-random')), 'the picture tab shows the photo button instead');
  check((await table()).length === 0, 'the picture tab starts with its own, empty list');
  await setText('cat\tחתול\nsun\tשמש\nmoon\tירח\nstar\tכוכב');
  await page.click('#tab-random');
  check(JSON.stringify(await table()) === JSON.stringify([['apple', 'תפוח'], ['dog', 'כלב']]), 'going back to the random tab brings back its own list');

  // both lists and the last tab survive a reload
  await page.click('#tab-picture');
  await page.reload({ waitUntil: 'load' });
  check(await selected('tab-picture') === 'true', 'the last open tab is remembered');
  check((await table()).length === 4, 'the picture list is still there');
  await page.click('#tab-random');
  check((await table()).length === 2, 'and so is the random list');

  // the quiz plays the list of the tab that is open
  await page.click('#tab-picture');
  await page.click('#start-btn');
  check(await page.$eval('#total-progress', e => e.innerText) === '4', 'start plays the list of the open tab (picture: 4 words)');
  await page.evaluate(() => showStart());
  await page.click('#tab-random');
  await page.evaluate(() => { document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב\ncat\tחתול\nsun\tשמש\nmoon\tירח\nstar\tכוכב'; renderWords(); saveRows(); });
  await page.click('#start-btn');
  check(await page.$eval('#total-progress', e => e.innerText) === '6', 'and in the random tab it plays the random list (6 words)');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();

  // an older single list (saved before the tabs existed) shows up in the picture tab; the random tab starts empty
  page = await openPage();
  await page.evaluate(() => { localStorage.setItem('englishquiz-words', 'old\tישן\nnew\tחדש'); localStorage.removeItem('englishquiz-mode'); localStorage.removeItem('englishquiz-words-random'); });
  await page.reload({ waitUntil: 'load' });
  check((await table()).length === 0, 'after an update the random tab starts empty');
  await page.click('#tab-picture');
  check(JSON.stringify(await table()) === JSON.stringify([['old', 'ישן'], ['new', 'חדש']]), 'a list saved by an older version appears in the picture tab');
  await page.close();
}

// A big emoji after every 5 / 10 (half and half) first-try answers in a row, up to 225: 30 different emojis, a mistake lowers the streak by 1, the streak carries over.
async function testStreak() {
  console.log('\n[streak] emoji after every 5 right answers in a row');
  const page = await openPage();
  await page.evaluate(() => { document.getElementById('words-input').value = Array.from({ length: 24 }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n'); renderWords(); });
  const emoji = () => page.$eval('#streak-emoji', e => ({ text: e.textContent, on: e.classList.contains('on') }));
  const answer = (right, firstWrong = false) => page.evaluate((firstWrong) => {
    const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container button')];
    if (firstWrong) bs.find(b => b.innerText !== c).click();
    bs.find(b => b.innerText === c).click();
  }, firstWrong);
  const next = ms => new Promise(r => setTimeout(r, ms));
  const emojis = await page.evaluate(() => STREAK_EMOJIS);
  check(emojis.length === 30 && new Set(emojis).size === 30, `there are 30 different emojis, one per 5 / 10 in a row up to 225 (${emojis.join(' ')})`);
  // near-twins that people can not tell apart on a phone: at most one face from each family may be used
  const FAMILIES = [['😀', '😃', '😄', '😁'], ['😂', '🤣', '😹'], ['🙂', '🙃'], ['😊', '☺️'], ['🌟', '⭐'], ['😜', '😝', '😛'], ['😸', '😺', '😃']];
  const clash = FAMILIES.filter(f => f.filter(x => emojis.includes(x)).length > 1).map(f => f.filter(x => emojis.includes(x)).join(' + '));
  check(clash.length === 0, `no two emojis that look alike (${clash.join('; ') || 'ok'})`);

  await page.click('#start-btn');
  for (let i = 0; i < 4; i++) { await answer(true); await next(560); }
  check(!(await emoji()).on, 'no emoji after 4 right answers');
  await answer(true); await next(560);
  let e = await emoji();
  check(e.on && e.text === emojis[0], `the 1st emoji appears after 5 in a row (${e.text})`);
  for (let i = 0; i < 4; i++) { await answer(true); await next(560); }
  check((await emoji()).text === emojis[0], 'it stays the same until the next 5 (9 in a row)');
  await answer(true); await next(560);
  e = await emoji();
  check(e.on && e.text === emojis[1], `a happier one after 10 in a row (${e.text})`);
  await answer(true, true); await next(560);   // a mistake first, then the right answer
  check(await page.evaluate(() => streak) === 9 && (await emoji()).on && (await emoji()).text === emojis[0], 'one wrong first try at 10 in a row lowers the streak to 9: back to the 1st emoji');
  await page.evaluate(() => { streak = 5; shownStage = 0; updateStreakEmoji(); });
  await answer(true, true); await next(560);   // 5 -> 4
  check(await page.evaluate(() => streak) === 4 && !(await emoji()).on, 'a wrong first try at 5 lowers it to 4: the emoji fades away');
  await answer(true); await next(560);
  check((await emoji()).on && (await emoji()).text === emojis[0], 'and 1 more right answer (4 -> 5) brings the 1st emoji back');
  await page.evaluate(() => { streak = 85; shownStage = 0; updateStreakEmoji(); });
  await answer(true, true); await next(560);   // 85 -> 84
  check(await page.evaluate(() => streak) === 84 && (await emoji()).text === emojis[14], 'a wrong first try at 85 lowers it to 84 and the emoji drops to the 15th');

  // the streak carries on into the next round and through the menu; only a wrong first try lowers it
  await page.evaluate(() => { streak = 14; shownStage = 0; updateStreakEmoji(); });   // 14 in a row: 2nd emoji
  const before = (await emoji()).text;
  await page.evaluate(() => restartGame());
  check((await emoji()).on && (await emoji()).text === before, 'a new round keeps the emoji of the streak');
  await answer(true, true); await next(560);   // a wrong first try at 0 points
  check(await page.evaluate(() => totalScore) === 0 && await page.$eval('#score', e => e.textContent) === '0', 'a wrong first try at 0 points keeps the points at 0 (never below)');
  // steps, half and half: emojis 1-15 every 5 (5..75), 16-30 every 10 (85..225)
  const stageAt = async s => { await page.evaluate(s => { streak = s; shownStage = 0; updateStreakEmoji(); }, s); return (await emoji()).text; };
  check(await stageAt(70) === emojis[13], '70 in a row shows the 14th emoji');
  check(await stageAt(75) === emojis[14], '75 in a row shows the 15th emoji');
  check(await stageAt(84) === emojis[14], '84 in a row still shows the 15th (the step is now 10)');
  check(await stageAt(85) === emojis[15], '85 in a row shows the 16th emoji');
  check(await stageAt(125) === emojis[19] && emojis[19] === '💯', `125 in a row shows the 20th emoji (${(await emoji()).text})`);
  check(await stageAt(224) === emojis[28], `224 in a row shows the 29th emoji (${(await emoji()).text})`);
  await answer(true); await next(560);
  check((await emoji()).text === emojis[29], `225 in a row shows the 30th, top emoji (${(await emoji()).text})`);
  await page.evaluate(() => { streak = 400; updateStreakEmoji(); });
  check((await emoji()).text === emojis[29], 'and it stays at the 30th beyond that');
  await page.evaluate(() => showStart());
  check((await emoji()).on && (await emoji()).text === emojis[29], 'back at the menu the streak is kept');
  await page.evaluate(() => { streak = 7; shownStage = 0; updateStreakEmoji(); });
  await page.evaluate(() => showStart());
  check((await emoji()).text === emojis[0], 'going to the menu does not reset the streak');
  // the streak survives a reload
  await page.evaluate(() => { streak = 23; shownStage = 0; updateStreakEmoji(); });
  await page.reload();
  check(await page.evaluate(() => streak) === 23 && (await emoji()).on && (await emoji()).text === emojis[3], 'after a reload the streak (23) and its emoji are restored');
  await page.evaluate(() => { streak = 3; updateStreakEmoji(); });
  await page.reload();
  check(await page.evaluate(() => streak) === 3 && !(await emoji()).on, 'a small streak is restored too, with no emoji yet');
  // the main screen shows a small copy of the emoji
  const menu = () => page.$eval('#menu-streak', e => ({ text: e.textContent, visible: e.getBoundingClientRect().height > 0 && e.offsetParent !== null }));
  check((await menu()).text === '' , 'main screen: no small emoji below 5 in a row');
  await page.evaluate(() => { streak = 23; updateStreakEmoji(); });
  check((await menu()).text === emojis[3] && (await menu()).visible, 'main screen: the small emoji of the current streak is visible');
  await page.evaluate(() => { streak = 11; updateStreakEmoji(); });
  check((await menu()).text === emojis[1], 'main screen: it follows the streak (11 -> 2nd emoji)');
  const nextText = () => page.$eval('#streak-next', e => e.textContent);
  await page.evaluate(() => { streak = 0; updateStreakEmoji(); });
  check(await nextText() === 'עוד 5', `game: 0 in a row -> 5 more to the 1st emoji (${await nextText()})`);
  await page.evaluate(() => { streak = 11; updateStreakEmoji(); });
  check(await nextText() === 'עוד 4', `game: 11 in a row -> 4 more to the 3rd emoji (${await nextText()})`);
  await page.evaluate(() => { streak = 80; updateStreakEmoji(); });
  check(await nextText() === 'עוד 5', `game: 80 in a row -> 5 more to the 16th emoji (${await nextText()})`);
  await page.evaluate(() => { streak = 215; updateStreakEmoji(); });
  check(await nextText() === '🎁 עוד 10', `game: before the last emoji it counts down to it and the mystery box (${await nextText()})`);
  await page.evaluate(() => { streak = 11; updateStreakEmoji(); });
  check(!(await page.$('#menu-streak-count')), 'main screen: the small emoji has no stage number next to it');
  await page.evaluate(() => { streak = 11; updateStreakEmoji(); });
  await page.reload();
  check((await menu()).text === emojis[1] && (await menu()).visible, 'main screen: still there after a reload');
  // the points total and the small emoji share one line
  await page.evaluate(() => { localStorage.setItem('x', '1'); document.getElementById('grand-total').innerText = '⭐ סה״כ נקודות: 12'; });
  const sameLine = await page.evaluate(() => { const a = document.getElementById('grand-total').getBoundingClientRect(), b = document.getElementById('menu-streak').getBoundingClientRect(); return { dy: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2), ah: a.height, bh: b.height }; });
  check(sameLine.dy < Math.max(sameLine.ah, sameLine.bh) / 2, `main screen: the points and the small emoji are on the same line (vertical centres ${Math.round(sameLine.dy)}px apart)`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// Runs a photo test on every fixture of its kind; a third argument on the command line picks one file (substring).
async function eachFixture(kind, run) {
  for (const fx of FIXTURES[kind]) {
    if (process.argv[3] && !fx.file.includes(process.argv[3])) continue;
    if (!fs.existsSync(path.resolve(here, 'fixtures', fx.file))) { console.log(`\n[${kind}] SKIPPED - tests/fixtures/${fx.file} not found (photos are git-ignored)`); continue; }
    await run(fx);
  }
}

// The 📚 learning tab: each level's categories as a path of steps (big categories split into parts of up to 15).
// Only the first unfinished step is open. A step = cards with the English word and the Hebrew together, then a short
// quiz on those words; only a quiz with no mistakes opens the next step.
async function testLearn() {
  console.log('\n[learn] learning path by category: a learn and a quiz button for every part, green when its quiz is passed');
  const newbie = await openPage(undefined, { fresh: true });
  await newbie.waitForFunction(() => document.querySelectorAll('#cat-list .cat-step').length > 0, { timeout: 10000 });
  check(await newbie.$eval('#tab-category', e => e.getAttribute('aria-selected')) === 'true' && await newbie.$eval('#panel-category', e => getComputedStyle(e).display !== 'none'), 'a new user starts on the learning tab, with the path shown');
  await newbie.close();
  const page = await openPage();
  const bankSteps = lv => {   // the steps the page should build from the level file
    const cats = [];
    for (const l of fs.readFileSync(path.join(root, 'wordbank', `level-${lv}.txt`), 'utf8').split(/\r?\n/)) {
      if (l.startsWith('#')) cats.push({ name: l.slice(1).trim(), n: 0, words: [] }); else if (l.includes('|')) { cats[cats.length - 1].n++; cats[cats.length - 1].words.push(l.split('|')); }
    }
    return cats.flatMap(c => { const parts = Math.ceil(c.n / 15), size = Math.ceil(c.n / parts); return Array.from({ length: parts }, (_, p) => ({ name: c.name, n: Math.min(size, c.n - p * size), catWords: c.words })); });
  };
  const steps = () => page.$$eval('#cat-list .cat-row', rows => rows.map(r => {
    const c = r.querySelector('.cat-step');
    return { done: c.classList.contains('done'), name: c.querySelector('.cat-name').textContent, meta: c.querySelector('.cat-meta').textContent, state: c.querySelector('.cat-state').textContent,
      learn: !!r.querySelector('.cat-learn:not([disabled])'), quiz: !!r.querySelector('.cat-quiz:not([disabled])') };
  }));
  const row = i => `#cat-list .cat-row:nth-child(${i + 1})`;
  const vis = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const text = id => page.$eval('#' + id, e => e.textContent);
  const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem('englishquiz-learn-progress')));
  const fireworks = () => page.evaluate(() => { const f = !!document.getElementById('fireworks'); document.querySelectorAll('#fireworks').forEach(c => c.remove()); return f; });
  const finishCards = () => page.evaluate(() => { for (let i = 0; i < learn.step.words.length; i++) learnStep(1); });
  // plays the open quiz to the end; the first `wrong` questions get a wrong answer first
  const playQuiz = (wrong = 0) => page.evaluate(wrong => {
    for (let k = 0; currentIndex < wordsData.length; k++) {
      const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container button')];
      if (k < wrong) bs.find(b => b.innerText !== c).click();
      bs.find(b => b.innerText === c).click();
      clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion();
    }
  }, wrong);
  const doStep = async (wrong = 0) => { await finishCards(); await page.click('#learn-quiz-btn'); await playQuiz(wrong); };
  const quizReady = () => page.waitForFunction(() => document.getElementById('game-screen').style.display !== 'none' && wordsData.length > 0, { timeout: 10000 });

  await page.evaluate(() => { window.unlockSounds = 0; playUnlockSound = () => window.unlockSounds++; });   // count the jingle instead of playing it
  const sounds = () => page.evaluate(() => window.unlockSounds);
  await page.select('#level-select', '1');
  await page.click('#tab-category');
  await page.waitForFunction(() => document.querySelectorAll('#cat-list .cat-step').length > 0, { timeout: 10000 });
  const want = bankSteps(1);
  let st = await steps();
  check(st.length === want.length && st.every((s, i) => s.name === `${i + 1}. ${want[i].name}` && s.meta.endsWith(`${want[i].n} מילים`)), `level 1 shows one part per category (big ones split): ${st.length} parts, every Hebrew category name in order`);
  check(want.every(w => w.n >= 4 && w.n <= 15), 'every part has 4-15 words');
  check(st.every(s => s.learn && s.quiz && !s.done && s.state === ''), 'nothing is locked: every part has a 📖 learn and a 📝 quiz button, none is green yet');
  check(!(await page.$$eval('#cat-list .cat-row', rs => rs.some(r => r.textContent.includes('🔒')))), 'no topic is locked (only the 🎁 prize box at the end)');
  check((await text('path-progress')) === `✅ 0/${want.length}`, 'the path counts 0 passed parts');
  check(!(await vis('words-count')) && !(await page.$eval('#start-btn', e => e.getBoundingClientRect().width > 0)) && !(await page.$eval('#learn-list-btn', e => e.getBoundingClientRect().width > 0)), 'the word list and its learn / quiz buttons are hidden in the learning tab');
  check((await page.$eval('#cat-level-select', e => e.value)) === '1', 'the learning tab uses the chosen level');

  // the cards of part 1
  await page.click(`${row(0)} .cat-learn`);
  check(await vis('learn-screen') && !(await vis('start-screen')), 'the 📖 button shows the learning cards');
  const first = await page.evaluate(() => ({ en: document.getElementById('learn-word').textContent, he: document.getElementById('learn-meaning').textContent, n: learn.step.words.length, words: learn.step.words.map(w => w.en) }));
  const l1 = Object.fromEntries(fs.readFileSync(path.join(root, 'wordbank', 'level-1.txt'), 'utf8').split(/\r?\n/).filter(l => l.includes('|')).map(l => l.split('|')));
  const both = await page.evaluate(() => { const v = id => { const r = document.getElementById(id).getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }; return v('learn-word') && v('learn-meaning'); });
  check(first.n === want[0].n && l1[first.en] === first.he && both, `the card shows a word of the part and its Hebrew meaning together, both in view (${first.en} = ${first.he})`);
  check(!(await page.$eval('#learn-next', e => e.disabled)) && await page.$eval('#learn-prev', e => e.disabled), '"next" works right away (and there is no previous card)');
  await page.click('#learn-next');
  check((await text('learn-count')) === `2/${first.n}`, 'next shows the 2nd card');
  await page.click('#learn-prev');
  check((await text('learn-count')) === `1/${first.n}`, 'previous goes back');
  for (let i = 0; i < first.n; i++) {
    if (i === first.n - 1) check((await text('learn-next')).includes('סיום'), 'on the last card the button says finish');
    await page.click('#learn-next');
  }
  check(await vis('learn-done-screen') && (await text('learn-unlock')).includes('בוחן'), 'after the last card: well done, now a short quiz');
  check(!(await progress()), 'learning the cards alone does not mark the part as passed');

  // the quiz of part 1
  await page.click('#learn-quiz-btn');
  check(await vis('game-screen'), 'the quiz starts');
  const quiz = await page.evaluate(() => wordsData.map(w => ({ word: w.word, correct: w.correct, dynamics: w.dynamics })));
  const catHe = new Set(want[0].catWords.map(w => w[1]));
  check(quiz.length === first.n && quiz.every(q => first.words.includes(q.word) && l1[q.word] === q.correct), `the quiz asks exactly the ${first.n} words of the part`);
  check(quiz.every(q => q.dynamics.length === 3 && new Set([q.correct, ...q.dynamics]).size === 4 && q.dynamics.every(d => catHe.has(d))), 'every question has 4 different answers, the wrong ones from the same category');
  await playQuiz(1);   // one mistake
  check(await vis('summary-screen') && (await text('step-result')).includes('בירוק') && (await text('step-result')).includes('בלי טעויות'), `one mistake: the summary says the part turns green only with no mistakes (${await text('step-result')})`);
  check(!(await progress()) && await sounds() === 0 && !(await fireworks()), 'not passed: nothing saved, no sound, no fireworks');
  const onlyBack = () => page.evaluate(() => [...document.querySelectorAll('#summary-screen .btn-restart')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.id || b.textContent.trim()));
  check(JSON.stringify(await onlyBack()) === '["change-words-btn"]' && (await text('change-words-btn')).includes('מסלול'),
        `the summary of a learning quiz has only the button back to the path (no try again / practice / next topic): ${JSON.stringify(await onlyBack())}`);
  await page.click('#change-words-btn');
  await page.waitForSelector('#cat-list .cat-quiz');
  await page.click(`${row(0)} .cat-quiz`);
  await quizReady();
  await playQuiz(0);
  check((await text('step-result')).includes('בירוק') && JSON.stringify(await onlyBack()) === '["change-words-btn"]', `taking the part's quiz again from the path and passing it: the part is green now (${await text('step-result')}), still only the back button`);
  check(JSON.stringify((await progress())[1]) === '[0]', 'the passed part is saved on the device');
  check(await sounds() === 1, 'the happy sound plays once');
  check(await fireworks(), '🎆 fireworks when the quiz of the part is passed');
  await page.click('#change-words-btn');
  await page.waitForSelector('#cat-list .cat-step.done');
  st = await steps();
  check(st[0].done && st[0].state === '✅' && !st[1].done && st.slice(1).every(s => s.learn && s.quiz), 'back on the path: part 1 is green with ✅, the others stay white and open');

  // any part, in any order: the 📝 button of part 4 goes straight to its quiz
  const step4 = want[3];
  await page.click(`${row(3)} .cat-quiz`);
  await quizReady();
  const quiz4 = await page.evaluate(() => wordsData.map(w => w.word)), words4 = step4.catWords.map(w => w[0]);
  check(await vis('game-screen') && !(await vis('start-screen')) && !(await vis('learn-screen')) && quiz4.length === step4.n && quiz4.every(w => words4.includes(w)), `the 📝 button of part 4 starts its quiz right away, without the cards (${quiz4.length} words)`);
  await playQuiz(0);
  check(JSON.stringify((await progress())[1]) === '[0,3]' && await fireworks() && await sounds() === 2, 'passing it marks part 4 (parts 2-3 not needed first), with fireworks');
  await page.click('#change-words-btn');
  await page.waitForFunction(() => document.querySelectorAll('#cat-list .cat-step.done').length === 2, { timeout: 10000 });
  st = await steps();
  check(st[0].done && !st[1].done && !st[2].done && st[3].done && (await text('path-progress')) === `✅ 2/${want.length}`, 'the path: parts 1 and 4 green, 2 and 3 white, ✅ 2');

  // a passed part can be learned and quizzed again: passing it a second time turns it purple (💜, with the sound); a third time adds nothing
  await page.click(`${row(0)} .cat-learn`);
  check(await vis('learn-screen'), 'a passed part can be learned again');
  await doStep(0);
  check((await text('step-result')).includes('סגול') && JSON.stringify((await progress())[1]) === '[0,3]' && (await page.evaluate(() => [...purpleSet(1)].join())) === '0' && await sounds() === 3 && await fireworks(), 'passing its quiz a second time: it turns purple, fireworks, the sound');
  await doStep(0);
  check((await text('step-result')) === '✅ עברתם את הבוחן!' && (await page.evaluate(() => [...purpleSet(1)].join())) === '0' && await sounds() === 3, 'a third time: "passed", no sound, nothing new');
  await page.click('#change-words-btn');
  check(await vis('start-screen') && await page.$eval('#tab-category', e => e.getAttribute('aria-selected')) === 'true', '"back to the path" from the summary shows the path');

  // progress saved by the older version (a count of parts passed in order) still shows
  await page.evaluate(() => { learnProgress = { 1: 2 }; localStorage.setItem('englishquiz-learn-progress', JSON.stringify(learnProgress)); renderPath(); });
  await page.waitForFunction(() => document.querySelectorAll('#cat-list .cat-step.done').length === 2, { timeout: 10000 });
  st = await steps();
  check(st[0].done && st[1].done && !st[2].done, 'older saved progress (2 parts in order) shows parts 1-2 green');

  // survives a reload; levels are separate; the last part of a level offers the next level
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#cat-list .cat-step').length > 0, { timeout: 10000 });
  st = await steps();
  check(await page.$eval('#tab-category', e => e.getAttribute('aria-selected')) === 'true' && st[0].done && st[1].done && !st[2].done, 'after a reload the learning tab and the progress are back');
  const n5 = bankSteps(5).length;
  await page.select('#cat-level-select', '5');
  await page.waitForFunction(n => document.querySelectorAll('#cat-list .cat-step').length === n, { timeout: 10000 }, n5);
  st = await steps();
  check(st.every(s => !s.done && s.learn && s.quiz), `level 5 has its own path (${n5} parts), nothing passed yet`);
  check((await page.$eval('#level-select', e => e.value)) === '5', 'changing the level here changes it in the random tab too');
  await page.evaluate(n => { learnProgress = { 1: [0, 1], 5: Array.from({ length: n - 1 }, (_, i) => i) }; localStorage.setItem('englishquiz-learn-progress', JSON.stringify(learnProgress)); renderPath(); }, n5);
  await page.waitForFunction(n => document.querySelectorAll('#cat-list .cat-step.done').length === n - 1, { timeout: 10000 }, n5);
  const pts = () => page.evaluate(() => [grandTotal, +localStorage.getItem('englishquiz-total-points'), JSON.parse(localStorage.getItem('englishquiz-level-bonus') || '[]')]);
  const prize = () => page.$eval('#cat-list .cat-prize', b => ({ cls: b.className, name: b.querySelector('.cat-name').textContent, last: b.nextElementSibling === b.parentNode.lastElementChild && b.nextElementSibling.classList.contains('tier2') }));
  let pz = await prize();
  check(pz.cls.includes('locked') && pz.name.includes('1000') && pz.last, `after the last topic there is a locked box that says "${pz.name}" (and the second box under it)`);
  const before = await pts();
  await page.click('#cat-list .cat-prize');
  check((await pts())[0] === before[0] && !(await page.$('#level-bonus')) && (await text('cat-status')).includes('🔒'), 'tapping it while locked gives nothing and says how to open it');
  await page.click(`${row(n5 - 1)} .cat-learn`);
  await doStep(0);
  check((await text('step-result')).includes('ברמה 5') && (await text('step-result')).includes('1000') && !(await vis('next-step-btn')), 'passing the last part of level 5 says all its topics are passed and the 1000 box opened');
  let after = await pts();
  check(after[0] === before[0] && !(await page.$('#level-bonus')), 'the bonus is not given by itself: it waits in the box');
  await page.click('#change-words-btn');
  await page.waitForFunction(() => document.querySelector('#cat-list .cat-prize.open'), { timeout: 10000 });
  // 🏆 tapping the open box starts the level's big quiz: 100 different words of the level; 70 right on the first try give 1000 points, once
  const playExam = n => page.evaluate(n => {   // the first n words right on the first try, the rest after a wrong answer
    for (let k = 0; currentIndex < wordsData.length; k++) {
      const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container .btn-answer')];
      if (k >= n) bs.find(x => x.innerText !== c).click();
      bs.find(x => x.innerText === c).click();
      clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion();
    }
  }, n);
  const openExam = async () => {
    await page.click('#cat-list .cat-prize');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('game-screen')).display !== 'none' && stepQuiz && stepQuiz.exam, { timeout: 5000 });
  };
  const money = () => page.evaluate(() => grandTotal + pendingCoins);   // (a quiz's own points wait in its box)
  await openExam();
  const ex = await page.evaluate(() => ({ n: wordsData.length, uniq: new Set(wordsData.map(w => w.word.toLowerCase())).size, opts: wordsData.every(w => w.dynamics.length === 3 && !w.dynamics.includes(w.correct)) }));
  check(ex.n === 100 && ex.uniq === 100 && ex.opts, `tapping the open box starts a quiz of 100 different words of the level, each with 3 wrong answers (${ex.n}, ${ex.uniq} different)`);
  let base = await money();
  await playExam(69);
  await new Promise(r => setTimeout(r, 1500));
  after = await pts();
  check(!after[2].includes(5) && !(await page.$('#level-bonus')) && (await text('step-result')).includes('69') && (await text('step-result')).includes('70'), `69 right: no prize, and it says 70 are needed ("${await text('step-result')}")`);
  check(!(await vis('restart-btn')) && !(await vis('practice-missed-btn')) && !(await vis('next-step-btn')) && (await text('change-words-btn')).includes('מסלול'), 'its result screen leads back to the path only');
  await page.click('#change-words-btn');
  await page.waitForFunction(() => document.querySelector('#cat-list .cat-prize.open'), { timeout: 10000 });
  check(true, 'the box stays open to try again');
  await openExam();
  base = await money();
  await playExam(70);
  after = await pts();
  const got = (await money()) - base - (await page.evaluate(() => pendingCoins));
  check(got === 1000 && after[1] === after[0] && after[2].includes(5) && (await text('step-result')).includes('1000'), `70 right: 1000 points right away, saved (+${got}, levels ${JSON.stringify(after[2])}, "${await text('step-result')}")`);
  await page.waitForSelector('#level-bonus', { timeout: 4000 });
  await new Promise(r => setTimeout(r, 2300));
  const lb = await page.evaluate(() => { const p = document.getElementById('level-bonus'), c = p.querySelector('.lb-card').getBoundingClientRect();
    return { n: p.querySelector('.lb-n').textContent, title: p.querySelector('.lb-title').textContent, rain: p.querySelectorAll('.lb-rain span').length, fw: !!document.getElementById('fireworks'),
      fits: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight }; });
  check(lb.n === '1000' && lb.title.includes('5') && lb.rain > 10 && lb.fw && lb.fits, `a golden pop-up: the points count up to +${lb.n}, coins rain (${lb.rain}), fireworks, and it fits the screen ("${lb.title}")`);
  await page.click('#level-bonus');
  check(!(await page.$('#level-bonus')), 'a tap closes it');
  await page.click('#change-words-btn');
  await page.waitForFunction(() => document.querySelector('#cat-list .cat-prize.taken'), { timeout: 10000 });
  pz = await prize();
  check(pz.cls.includes('taken'), 'the box now shows the prize was taken');
  const t1 = await money();
  await page.click('#cat-list .cat-prize');
  await new Promise(r => setTimeout(r, 300));
  check((await money()) === t1 && !(await page.$('#level-bonus')) && !(await vis('game-screen')), 'the bonus is given only once per level (a taken box starts no quiz)');
  await page.evaluate(() => { levelBonus(4, 0); });
  await page.waitForSelector('#level-bonus', { timeout: 4000 });
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => !document.getElementById('level-bonus'), { timeout: 4000 });
  check((await money()) === t1 + 1000, 'the phone back button closes it too (another level: another 1000)');
  // 🔥 10 days in a row: the box says 2000 and its quiz gives 2000
  await page.evaluate(() => { daily = { last: dayStr(), days: 10 }; levelBonusGiven = levelBonusGiven.filter(l => l !== 5); renderPath(); });
  await page.waitForFunction(() => document.querySelector('#cat-list .cat-prize.open'), { timeout: 10000 });
  pz = await prize();
  check(pz.name.includes('2000') && pz.name.includes('🔥'), `on a 🔥 streak the box says "${pz.name}"`);
  await openExam();
  base = await money();
  await playExam(100);
  const got2 = (await money()) - base - (await page.evaluate(() => pendingCoins));
  await page.waitForSelector('#level-bonus', { timeout: 4000 });
  await new Promise(r => setTimeout(r, 2300));
  const fireLb = await page.$eval('#level-bonus', p => [p.querySelector('.lb-n').textContent, p.querySelector('.lb-sub').textContent]);
  check(got2 === 2000 && fireLb[0] === '2000' && fireLb[1].includes('🔥'), `and gives 2000 (+${got2}; the pop-up counts to +${fireLb[0]}, "${fireLb[1]}")`);
  await page.click('#level-bonus');
  await page.click('#change-words-btn');
  await page.evaluate(() => { daily = { last: '', days: 0 }; grandTotal -= 2000; });
  await page.evaluate(() => { levelBonusGiven = []; localStorage.removeItem('englishquiz-level-bonus'); grandTotal -= 2000; localStorage.setItem('englishquiz-total-points', String(grandTotal)); });
  await fireworks();   // clear them (the check below must not see these)
  // (already back on the path)
  await page.waitForFunction(() => document.querySelectorAll('#cat-list .cat-learn').length > 0, { timeout: 10000 });

  // a quiz from the random tab is not a part's quiz
  await page.click('#tab-random');
  await page.evaluate(() => { document.getElementById('words-input').value = 'cat\tחתול\ndog\tכלב\nsun\tשמש\nmoon\tירח'; renderWords(); startFromInput(); });
  await playQuiz(2);   // 50%: no fireworks from the score either (a perfect score has them anyway, see the celebrate test)
  check(!(await vis('step-result')) && !(await vis('next-step-btn')) && (await text('change-words-btn')) === 'החלפת מילים' && !(await fireworks()), 'a quiz from the random tab shows the usual summary (no topic fireworks)');
  await page.evaluate(() => showStart());
  await page.click('#tab-category');
  await page.waitForSelector('#cat-list .cat-learn');

  // every learning screen fits common phones without page scrolling
  for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    const over = () => page.evaluate(() => Math.max(document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth));
    await page.evaluate(() => showStart());
    await page.waitForSelector('#cat-list .cat-learn');
    const pathO = await over();
    const rowFits = await page.$eval('#cat-list .cat-row', r => r.scrollWidth <= r.clientWidth);
    await page.click(`${row(0)} .cat-learn`);
    const cardO = await over();
    await finishCards();
    const doneO = await over();
    await page.click('#learn-quiz-btn');
    const quizO = await over();
    await playQuiz(2);   // a summary with missed words
    const sumO = await over();
    await page.evaluate(() => restartGame());
    await playQuiz(0);   // a summary with the bonus badge, "passed" and "next topic"
    const sum2O = await over();
    await fireworks();
    check(rowFits && Math.max(pathO, cardO, doneO, quizO, sumO, sum2O) <= 0, `${w}x${h}: the path (a row with both buttons), the card, the well-done screen, the quiz and both summaries fit without page scrolling (${pathO}/${cardO}/${doneO}/${quizO}/${sumO}/${sum2O}px)`);
  }
  // a card shows only the word's own picture: a word without one shows none (never its category's, e.g. 🍕 on "fork")
  const pics = await page.evaluate(async () => {
    const steps = learnSteps(await loadLevel(1)), out = {};
    for (const [i, s] of steps.entries()) for (const [j, w] of s.words.entries()) {
      const key = w.pic ? 'with' : 'without';
      if (out[key]) continue;
      await startLearning(1, i); learn.i = j; showCard();
      const e = document.getElementById('learn-emoji');
      out[key] = { en: w.en, pic: w.pic, shown: e.textContent, visible: getComputedStyle(e).display !== 'none' };
    }
    return out;
  });
  check(pics.with.shown === pics.with.pic && pics.with.visible, `a word with a picture shows it (${pics.with.en} ${pics.with.shown})`);
  check(pics.without.shown === '' && !pics.without.visible, `a word without a picture shows no picture at all (${pics.without.en})`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// The 🛒 shop: the total points buy a character (shown next to the title) and a background. Buying takes two taps,
// bought items stay bought and switching between them is free.
async function testShop() {
  console.log('\n[shop] spending the points on a character and a background');
  const page = await openPage();
  const vis = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const text = id => page.$eval('#' + id, e => e.textContent);
  const item = (box, id) => `#${box} .shop-item[data-id="${id}"]`;
  const cls = (box, id) => page.$eval(item(box, id), e => e.className);
  const total = () => page.evaluate(() => +localStorage.getItem('englishquiz-total-points') || 0);
  // ✋ buying = holding the item (the one that asks "buy?") pressed for a second
  const hold = async (sel, ms = 1150) => {
    const el = await page.$(sel);
    await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
    const b = await el.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down(); await new Promise(r => setTimeout(r, ms)); await page.mouse.up();
    await new Promise(r => setTimeout(r, 50));
  };

  check(await vis('shop-btn'), 'the main screen has a shop button');
  await page.click('#shop-btn');
  check(await vis('shop-screen') && !(await vis('start-screen')), 'it opens the shop');
  check((await page.$$('#shop-avatars .shop-item')).length >= 10 && (await page.$$('#shop-themes .shop-item')).length >= 5, 'the shop has characters and backgrounds');
  check((await text('shop-balance')).includes('0') && (await cls('shop-avatars', 'dog')).includes('poor'), 'with 0 points everything costs more than you have');
  await page.click(item('shop-avatars', 'dog'));
  check((await text('shop-msg')).includes('חסרות') && (await total()) === 0, 'tapping an item you cannot afford says how many points are missing and buys nothing');
  check((await cls('shop-themes', 'purple')).includes('active'), 'the purple background is free and in use');

  // 55 points
  await page.evaluate(() => { localStorage.setItem('englishquiz-total-points', '55'); });
  await page.reload();
  check(await vis('shop-screen') && !(await vis('start-screen')), 'after a reload the app reopens in the shop, where it was');
  check((await text('shop-balance')).includes('55'), 'the shop shows the points (55)');
  await page.evaluate(() => { window.__sounds = 0; playUnlockSound = () => window.__sounds++; });
  await page.click(item('shop-avatars', 'dog'));
  check((await cls('shop-avatars', 'dog')).includes('confirm') && (await total()) === 55 && (await text('shop-msg')).includes('החזיקו'), 'the first tap asks "buy?" (hold to buy) and buys nothing yet');
  check((await page.$eval(item('shop-avatars', 'dog'), e => e.querySelector('.shop-price').textContent)).includes('✋') && !!(await page.$(item('shop-avatars', 'dog') + ' .hold-fill')), 'the item says to hold it, and has the bar that fills');
  await page.click(item('shop-avatars', 'dog'));
  check((await total()) === 55 && (await cls('shop-avatars', 'dog')).includes('confirm') && (await text('shop-msg')).includes('שנייה'), 'a quick second tap buys nothing: it says to hold for a second');
  await hold(item('shop-avatars', 'dog'), 400);
  check((await total()) === 55 && !(await cls('shop-avatars', 'dog')).includes('holding'), 'letting go after less than a second buys nothing (the bar empties)');
  await hold(item('shop-avatars', 'dog'));
  check((await total()) === 45 && (await cls('shop-avatars', 'dog')).includes('active') && (await text('shop-balance')).includes('45'), 'holding it for a second buys the dog: 45 points left, and the dog is in use (letting go does not take it off)');
  check((await page.evaluate(() => window.__sounds)) === 1 && (await text('shop-msg')).includes('קניתם'), 'buying plays the happy sound and says so');
  check((await text('menu-avatar')) === '🐶', 'the dog shows next to the title on the main screen');
  await page.click(item('shop-themes', 'ocean'));
  await hold(item('shop-themes', 'ocean'));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  check((await total()) === 20 && bg.includes('0, 82, 212'), `buying the sea background changes the page background (${bg.slice(0, 60)}...)`);
  await page.click(item('shop-avatars', 'cat'));
  await hold(item('shop-avatars', 'cat'));
  await page.click(item('shop-avatars', 'dog'));
  check((await total()) === 0 && (await text('menu-avatar')) === '🐶', 'switching back to a character you own is free');
  await page.click(item('shop-avatars', 'dog'));
  check((await text('menu-avatar')) === '', 'tapping the character in use takes it off');
  await page.click(item('shop-themes', 'purple'));
  check((await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).includes('74, 0, 224'), 'back to the purple background, for free');
  await page.click(item('shop-themes', 'ocean'));
  await page.click(item('shop-avatars', 'cat'));

  // saved on the device
  await page.reload();
  check((await text('menu-avatar')) === '🐱' && (await page.evaluate(() => getComputedStyle(document.body).backgroundImage)).includes('0, 82, 212'), 'after a reload the cat and the sea background are still there');
  // 👀 tapping a background not bought yet shows it right away, for a try (never saved)
  const bgNow = () => page.evaluate(() => getComputedStyle(document.body).backgroundImage);
  const savedTheme = () => page.evaluate(() => JSON.parse(localStorage.getItem('englishquiz-shop')).theme);
  await page.click(item('shop-themes', 'forest'));
  check((await bgNow()).includes('19, 78, 94') && (await cls('shop-themes', 'forest')).includes('preview') && (await text('shop-msg')).includes('👀') && (await text('shop-msg')).includes('חסרות'),
    'a background you cannot afford yet: the first tap shows how it looks, and says how many points are missing');
  check((await savedTheme()) === 'ocean' && (await cls('shop-themes', 'ocean')).includes('active') && (await total()) === 0, 'the try buys nothing and the sea is still the one in use');
  await page.click(item('shop-themes', 'purple'));
  check((await bgNow()).includes('74, 0, 224') && !(await cls('shop-themes', 'forest')).includes('preview'), 'tapping a background you own ends the try and uses it');
  await page.click(item('shop-themes', 'ocean'));
  await page.click(item('shop-themes', 'forest'));
  await page.reload();
  check((await bgNow()).includes('0, 82, 212') && (await savedTheme()) === 'ocean', 'a reload in the middle of a try is back to the sea');
  await page.click(item('shop-themes', 'forest'));
  await page.click('#shop-back');
  check((await bgNow()).includes('0, 82, 212'), 'leaving the shop in the middle of a try is back to the sea');
  await page.evaluate(() => { grandTotal = 80; localStorage.setItem('englishquiz-total-points', '80'); });
  await page.click('#shop-btn');
  await page.click(item('shop-themes', 'forest'));
  check((await bgNow()).includes('19, 78, 94') && (await cls('shop-themes', 'forest')).includes('confirm') && (await text('shop-msg')).includes('👀') && (await total()) === 80,
    'a background you can afford: the first tap shows it and asks "buy?"');
  await hold(item('shop-themes', 'forest'));
  check((await total()) === 5 && (await savedTheme()) === 'forest' && (await cls('shop-themes', 'forest')).includes('active') && !(await cls('shop-themes', 'forest')).includes('preview'), 'holding it buys it and it stays');
  await page.click(item('shop-themes', 'ocean'));
  await page.evaluate(() => { grandTotal = 0; localStorage.setItem('englishquiz-total-points', '0'); });
  // the character in the game: it asks the question and hops on a right answer
  await page.evaluate(() => { showStart(); document.getElementById('words-input').value = 'cat\tחתול\ndog\tכלב\nsun\tשמש\nmoon\tירח'; renderWords(); startFromInput(); });
  check(await vis('game-screen') && (await text('game-avatar')) === '🐱' && (await page.$eval('.instruction-text', e => e.textContent)).startsWith('🐱'), 'the cat shows in the game, before the question');
  await page.evaluate(() => [...document.querySelectorAll('#answers-container button')].find(b => b.innerText === wordsData[currentIndex].correct).click());
  check(await page.$eval('#game-avatar', e => e.classList.contains('hop')), 'and hops on a right answer');
  for (const [w, h] of [[320, 568], [360, 640]]) {
    await page.setViewport({ width: w, height: h });
    const o = await page.evaluate(() => Math.max(document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth));
    check(o <= 0, `${w}x${h}: the game with the character fits without page scrolling (${o}px)`);
  }
  await page.setViewport({ width: 360, height: 800 });
  await page.evaluate(() => { clearTimeout(nextQuestionTimer); showStart(); });
  await page.click('#shop-btn');
  check((await cls('shop-avatars', 'dog')).includes('owned') && (await cls('shop-themes', 'ocean')).includes('active'), 'and the bought items are still yours');
  await page.click('#shop-back');
  check(await vis('start-screen') && !(await vis('shop-screen')), 'the back button returns to the main screen');

  // fits common phones without page scrolling
  for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    const over = () => page.evaluate(() => Math.max(document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth));
    await page.evaluate(() => showStart());
    const mainO = await over();
    await page.click('#shop-btn');
    const shopO = await over();
    check(Math.max(mainO, shopO) <= 0, `${w}x${h}: the main screen and the shop fit without page scrolling (${mainO}/${shopO}px)`);
  }

  // 🏅 all the points ever earned: buying never takes from it
  const earned = () => page.evaluate(() => [earnedTotal, +localStorage.getItem('englishquiz-earned-points'), document.getElementById('shop-earned').textContent]);
  await page.evaluate(() => { localStorage.removeItem('englishquiz-earned-points'); localStorage.setItem('englishquiz-total-points', '7'); });
  await page.reload();
  const spent = await page.evaluate(() => [...SHOP_AVATARS, ...SHOP_THEMES].filter(it => shop.owned.includes(it.id)).reduce((s, it) => s + it.price, 0));
  let e = await earned();
  check(spent > 0 && e[0] === 7 + spent && e[1] === e[0] && e[2].includes(String(e[0])), `an older device starts it at its points + what its shop items cost (7 + ${spent} = ${e[0]}), shown in the shop: "${e[2]}"`);
  const start0 = e[0];
  await page.evaluate(() => { pendingCoins = 12; savePending(); collectCoins(); renderShop(); });
  e = await earned();
  check(e[0] === start0 + 12 && e[1] === e[0] && e[2].includes(String(e[0])), `the points of a quiz add to it (+12 = ${e[0]})`);
  await page.evaluate(() => { Math.random = () => 0.3; shop.boxes = 1; openBox(); });
  await new Promise(r => setTimeout(r, 900));   // the box redraws the shop when it opens (clicking an item meanwhile would hit a removed one)
  await page.evaluate(() => document.getElementById('box-reveal')?.remove());   // (its pop-up)
  e = await earned();
  check(e[0] === start0 + 62 && e[1] === e[0], `surprise-box coins add to it too (+50 = ${e[0]})`);
  const lion = await page.evaluate(() => SHOP_AVATARS.find(a => !shop.owned.includes(a.id) && a.price <= grandTotal)?.id);
  await page.click(item('shop-avatars', lion)); await hold(item('shop-avatars', lion));
  e = await earned();
  check((await page.evaluate(id => shop.owned.includes(id), lion)) && e[0] === start0 + 62 && e[1] === e[0] && e[2].includes(String(e[0])), `buying (${lion}) takes from the points but not from it (still ${e[0]})`);
  await page.reload();
  check((await earned())[0] === start0 + 62, 'it is kept after a reload');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 🎁 Mystery boxes: reaching the last streak emoji (a streak of 225) earns a box and the
// streak starts again from 0. The box is opened in the shop: a trophy or a medal for the collection.
async function testBox() {
  console.log('\n[box] a mystery box at the last emoji, then the streak starts over');
  const page = await openPage();
  const vis = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const text = id => page.$eval('#' + id, e => e.textContent);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('englishquiz-shop')) || {});
  const start = () => page.evaluate(() => { document.getElementById('words-input').value = 'cat\tחתול\ndog\tכלב\nsun\tשמש\nmoon\tירח\nbook\tספר\nmilk\tחלב'; renderWords(); startFromInput(); });
  const answer = right => page.evaluate(right => {
    const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container button')];
    if (!right) bs.find(b => b.innerText !== c).click();
    bs.find(b => b.innerText === c).click();
    clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; if (currentIndex < wordsData.length) loadQuestion();
  }, right);

  await page.click('#shop-btn');
  check((await text('box-count')).includes('אין') && await page.$eval('#box-open', e => e.disabled) && (await text('box-hint')).includes('כשאוספים את כל הפרצופים'), 'the shop has a mystery box section: no box yet, and it says how to get one');
  check(!(await page.$('#shop-awards')) && (await text('shop-wands')) === '🪄 × 0' && (await text('menu-wands')) === '', 'instead of the prizes the shop shows the magic wands (0); the main screen shows none while there are none');
  await page.evaluate(() => { shop.wands = 3; saveShop(); renderShop(); applyShop(); });
  check((await text('shop-wands')) === '🪄 × 3' && (await text('menu-wands')) === '🪄 3', 'with 3 wands: 🪄 × 3 in the shop, 🪄 3 on the main screen next to the points');
  await page.evaluate(() => { shop.wands = 0; saveShop(); renderShop(); applyShop(); });
  const faces = () => page.$$eval('#shop-faces .face', fs => fs.map(f => (f.classList.contains('current') ? '*' : '') + f.textContent));
  check((await faces()).length === 30 && (await faces()).every(f => f === '❓'), 'the faces: 30 hidden ❓ before the first one is reached');
  await page.evaluate(() => { streak = 25; updateStreakEmoji(); renderShop(); });
  let fc = await faces();
  check(fc.slice(0, 5).join('') === '🙂😊😄😆*😎' && fc.slice(5).every(f => f === '❓') && (await text('faces-count')) === '(5/30)', `a streak of 25: the first 5 faces, the 5th marked as the current one, the rest hidden (${fc.slice(0, 6).join(' ')})`);
  await page.evaluate(() => { streak = 225; updateStreakEmoji(); renderShop(); });
  fc = await faces();
  check(fc.filter(f => f !== '❓').length === 30 && fc[29] === '*👑', 'at the last emoji all 30 faces show');
  await page.evaluate(() => { streak = 0; updateStreakEmoji(); renderShop(); });
  await page.evaluate(() => showStart());

  await page.evaluate(() => { localStorage.setItem('englishQuizStreak', '223'); });
  await page.reload();
  await page.evaluate(() => { window.unlockSounds = 0; playUnlockSound = () => window.unlockSounds++; });
  await start();
  check((await text('streak-next')) === '🎁 עוד 2', `before the last emoji the game counts down to it and the box (${await text('streak-next')})`);
  await answer(false);   // 222
  await answer(true);    // 223
  await answer(true);    // 224
  check(((await saved()).boxes || 0) === 0 && (await text('streak-next')) === '🎁 עוד 1', '224: no box yet (a mistake took 1 off)');
  await answer(true);    // 225
  check((await saved()).boxes === 1 && await vis('box-toast') && (await text('box-toast')).includes('קופסת הפתעה') && (await page.evaluate(() => window.unlockSounds)) === 1, 'reaching the last emoji (225) earns a box right away: a note in the game and the happy sound');
  check((await page.evaluate(() => streak)) === 0 && (await page.evaluate(() => localStorage.getItem('englishQuizStreak'))) === '0' && (await text('streak-next')) === 'עוד 5', 'and the streak starts again from 0 (5 more to the first face)');
  check((await page.$eval('#streak-emoji', e => e.classList.contains('on') && e.textContent)) === '👑' && (await text('menu-streak')) === '', 'the last face (👑) shows with the box; the menu faces start over');
  await answer(true);    // 1
  check(!(await page.$eval('#streak-emoji', e => e.classList.contains('on'))) && (await page.evaluate(() => streak)) === 1 && ((await saved()).boxes) === 1, 'on the next answer the big emoji goes away (streak 1, still 1 box)');
  await page.evaluate(() => showStart());
  check((await page.$eval('#shop-btn', e => e.dataset.boxes)) === '1', 'the shop button shows a red 1');
  await page.click('#shop-btn');
  check((await page.$$('#shop-faces .face.missing')).length === 30, 'after the box the faces start over too (all hidden again)');
  await page.evaluate(() => showStart());

  // opening: 40% of the boxes hold 50 coins, 40% 100 coins, 20% an ice cube - never a magic wand
  const reveal = () => page.evaluate(() => { const p = document.getElementById('box-reveal'); if (!p) return null; const c = p.querySelector('.br-card').getBoundingClientRect();
    return { cls: p.className, pic: p.querySelector('.br-pic').textContent, big: p.querySelector('.br-big').textContent, sub: p.querySelector('.br-sub').textContent, fire: !!p.querySelector('.br-fire'),
      fits: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight }; });
  await page.click('#shop-btn');
  check((await text('box-count')).includes('1') && !(await page.$eval('#box-open', e => e.disabled)), 'the shop: 1 box to open');
  await page.evaluate(() => { Math.random = () => 0; });
  await page.click('#box-open');
  await new Promise(r => setTimeout(r, 900));
  check((await saved()).boxes === 0 && !((await saved()).wands > 0) && !Object.keys((await saved()).awards || {}).length, 'opening the box gives no magic wand (saved; no medal)');
  check((await text('box-pic')) === '💰' && (await page.evaluate(() => window.unlockSounds)) === 2, 'the box shows what was inside, with the happy sound');
  check((await text('shop-wands')) === '🪄 × 0' && (await text('menu-wands')) === '', 'the wand counts stay at 0');
  let rv = await reveal();
  check(rv && rv.cls === 'coins' && rv.pic === '💰' && rv.big === '+50 נקודות' && rv.fits, `a big pop-up says clearly what was inside: ${rv && rv.pic} "${rv && rv.big}" - ${rv && rv.sub}`);
  await new Promise(r => setTimeout(r, 600)); await page.click('#box-reveal');   // (taps in its first half second are ignored: a quick double tap doesn't close it unseen)
  check(!(await page.$('#box-reveal')), 'a tap closes it');
  check(await page.$eval('#box-open', e => e.disabled) && (await page.$eval('#shop-btn', e => e.dataset.boxes)) === undefined, 'no boxes left: the button is off and the red count is gone');
  await page.evaluate(() => { shop.boxes = 1; saveShop(); renderShop(); });
  await page.click('#box-open');
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => !document.getElementById('box-reveal'), { timeout: 3000 }).catch(() => {});
  check(!(await page.$('#box-reveal')), 'the phone back button closes it too');
  await page.evaluate(() => { shop.wands = 2; saveShop(); });
  await page.reload();
  check(await vis('shop-screen') && (await page.evaluate(() => shop.wands)) === 2, 'after a reload the app reopens in the shop and the wands are kept');
  for (const [r, coins] of [[0.3, 50], [0.7, 100]]) {
    const before = await page.evaluate(r => { Math.random = () => r; shop.boxes = 1; saveShop(); renderShop(); return { total: grandTotal, wands: shop.wands }; }, r);
    await page.click('#box-open');
    await new Promise(res => setTimeout(res, 900));
    const after = await page.evaluate(() => ({ total: grandTotal, saved: +localStorage.getItem(TOTAL_KEY), wands: shop.wands, boxes: shop.boxes }));
    check(after.total === before.total + coins && after.saved === after.total && after.wands === before.wands && after.boxes === 0, `a box can give ${coins} coins instead (saved: ${after.total})`);
    check((await text('box-pic')) === '💰' && (await text('shop-msg')).includes(`${coins} נקודות`) && (await text('shop-balance')).includes(String(after.total)), `it shows 💰 "${coins} נקודות" and the new balance`);
    rv = await reveal();
    check(rv && rv.cls === 'coins' && rv.big === `+${coins} נקודות` && rv.sub.includes(String(after.total)) && !rv.fire, `the pop-up: ${rv && rv.pic} "${rv && rv.big}" - ${rv && rv.sub}`);
    await new Promise(r => setTimeout(r, 600)); await page.click('#box-reveal');   // (taps in its first half second are ignored: a quick double tap doesn't close it unseen)
  }
  const odds = await page.evaluate(() => { const out = { wand: 0, 50: 0, 100: 0, ice: 0 }; const real = Math.random;
    for (let k = 0; k < 600; k++) { const r = k / 600; Math.random = () => r; shop.boxes = 1; const t = grandTotal, w = shop.wands, i = shop.ice || 0; openBox();
      if (grandTotal - t === 50) out[50]++; else if (grandTotal - t === 100) out[100]++; else if (shop.wands === w + 1) out.wand++; else if (shop.ice === i + 1) out.ice++; }
    Math.random = real; return out; });
  check(odds.wand === 0 && odds[50] === 240 && odds[100] === 240 && odds.ice === 120, `no box gives a wand: 40% 50 coins, 40% 100 coins, 20% an ice cube (${JSON.stringify(odds)})`);

  for (const [w, h] of [[320, 568], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    const o = await page.evaluate(() => Math.max(document.documentElement.scrollHeight - innerHeight, document.documentElement.scrollWidth - innerWidth));
    check(o <= 0, `${w}x${h}: the shop with the box and the collection fits without page scrolling (${o}px)`);
  }
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// The phone's back button (it fires popstate like history.back() does). The page keeps one extra history entry (the
// "trap", history.state.eq === 1) only while it is needed: off the start screen or with a pop-up open. It is added
// when the user taps into another screen (Chrome's back button skips entries added before any tap), and removed
// back on the start screen, so there back leaves the app at the first press. History must never pile up.
async function testPhoneBack() {
  console.log('\n[phoneback] the phone back button');
  const page = await openPage();
  const cdp = await page.createCDPSession();
  const hist = async () => { const h = await cdp.send('Page.getNavigationHistory'); return { index: h.currentIndex, length: h.entries.length, eq: await page.evaluate(() => history.state && history.state.eq) }; };
  const vis = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const settle = () => new Promise(r => setTimeout(r, 150));
  const back = async () => { await page.evaluate(() => history.back()); await settle(); };
  const dialog = () => page.$('[data-dialog]');
  const clickText = t => page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === t).click(), t);

  const base = await hist();
  check(base.eq === 0 && base.index === base.length - 1, `start screen: no trap, so back leaves the app (${JSON.stringify(base)})`);

  // a quiz: back asks before leaving; back again cancels that question; leaving goes to the start screen
  await page.evaluate(() => { document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב\ncat\tחתול\nsun\tשמש'; renderWords(); });
  await page.click('#start-btn'); await settle();
  check((await hist()).eq === 1, 'tapping into a quiz sets the trap');
  await back();
  check(await vis('game-screen') && !!(await dialog()) && (await hist()).eq === 1, 'back in a quiz asks before leaving, and the trap is set again');
  await back();
  check(await vis('game-screen') && !(await dialog()) && (await hist()).eq === 1, 'back again closes the question and stays in the quiz');
  await back();
  await clickText('חזרה לתפריט'); await settle();
  let h = await hist();
  check(await vis('start-screen') && h.eq === 0 && h.index === base.index, `confirming goes to the start screen and the trap is removed (${JSON.stringify(h)})`);

  // the shop, many times: back to the start screen, history does not pile up
  for (let i = 0; i < 3; i++) { await page.click('#shop-btn'); await settle(); await back(); }
  h = await hist();
  check(await vis('start-screen') && !(await vis('shop-screen')) && h.eq === 0 && h.index === base.index && h.length <= base.length + 1, `shop -> back -> start screen, 3 times, no history piling up (${JSON.stringify(h)})`);
  // the in-app back button of the shop removes the trap too
  await page.click('#shop-btn'); await settle(); await page.click('#shop-back'); await settle();
  h = await hist();
  check(h.eq === 0 && h.index === base.index, 'the shop\'s own back button removes the trap');

  // a pop-up on the start screen: back closes it and stays
  await page.evaluate(() => { clearWords(); }); await settle();
  check(!!(await dialog()) && (await hist()).eq === 1, 'a pop-up on the start screen sets the trap');
  await back();
  h = await hist();
  check(!(await dialog()) && await vis('start-screen') && h.eq === 0 && h.index === base.index && (await page.$$eval('#words-table tbody tr', r => r.length)) === 4, 'back closes it (nothing cleared), the trap is gone');

  // the summary and the learning screens go back to the start screen
  await page.click('#start-btn'); await settle();
  for (let k = 0; k < 4; k++) { await page.evaluate(() => { const c = wordsData[currentIndex].correct; [...document.querySelectorAll('#answers-container button')].find(b => b.innerText === c).click(); }); await new Promise(r => setTimeout(r, 650)); }
  check(await vis('summary-screen') && (await hist()).eq === 1, 'the summary keeps the trap');
  await back();
  check(await vis('start-screen') && (await hist()).eq === 0, 'back from the summary goes to the start screen');
  await page.evaluate(() => startLearning(1, 0)); await new Promise(r => setTimeout(r, 500));
  check(await vis('learn-screen') && (await hist()).eq === 1, 'the learning cards set the trap');
  await back();
  check(await vis('start-screen') && (await hist()).eq === 0, 'back from the learning cards goes to the start screen');

  // reopened on another screen (the app remembers where it was): the trap is set there too
  await page.click('#shop-btn'); await settle();
  await page.reload({ waitUntil: 'load' }); await settle();
  check(await vis('shop-screen') && (await hist()).eq === 1, 'reopened in the shop: the trap is set');
  await back();
  check(await vis('start-screen') && (await hist()).eq === 0, 'and back goes to the start screen');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 🐶 Tapping the character on the main screen: its own move, emojis and English phrase, then a word of the chosen
// level in a speech bubble (read aloud, tap the bubble to hear it again). 5 taps in a row make it dizzy. Not the shop.
async function testAvatar() {
  console.log('\n[avatar] tapping the character: one of its own 4 funny GIFs; the 5th tap in a row: dizzy, then a headache');
  const page = await openPage();
  const text = sel => page.$eval(sel, e => e.textContent);
  // record what is read aloud instead of speaking (each text "takes" 300 ms, then reports its end like a real voice)
  await page.evaluate(() => { window.spoken = []; speechSynthesis.speak = u => { window.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 300); }; speechSynthesis.cancel = () => {}; });
  const turnOver = () => page.waitForFunction(() => !document.getElementById('menu-avatar').disabled, { timeout: 15000 });
  const spoken = () => page.evaluate(() => { const s = window.spoken.slice(); window.spoken.length = 0; return s; });
  const setAvatar = id => page.evaluate(id => { if (!shop.owned.includes(id)) shop.owned.push(id); shop.avatar = id; saveShop(); applyShop(); }, id);
  const gif = () => page.evaluate(() => { const p = document.getElementById('gif-pop'); return p && { scene: p.dataset.scene, say: p.querySelector('.gp-say').textContent, he: p.querySelector('.gp-he').textContent,
    stage: [...p.querySelectorAll('.gp-stage .gp-e')].map(e => e.textContent), imgs: p.querySelectorAll('.gp-stage img').length, moving: p.getAnimations({ subtree: true }).length,
    fits: (r => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight)(p.querySelector('.gp-card').getBoundingClientRect()) }; });

  check(await page.evaluate(() => SHOP_AVATARS.every(a => AVATAR_FX[a.id] && AVATAR_MOVES[AVATAR_FX[a.id].move] && AVATAR_FX[a.id].fx.length && AVATAR_FX[a.id].say)), 'every character in the shop has its own move, emojis and phrase');
  const bad = await page.evaluate(() => SHOP_AVATARS.filter(a => { const g = AVATAR_GIFS[a.id]; return !g || g.length !== 4 || new Set(g).size !== 4 || !g.every(n => GIF_SCENES[n] && n !== 'headache'); }).map(a => a.id));
  check(bad.length === 0, `every character has its own 4 different GIFs${bad.length ? ' (missing: ' + bad.join(', ') + ')' : ''}`);
  // every scene draws and moves, for an emoji character and for the drawn capybara
  const scenes = await page.evaluate(() => { const out = []; for (const id of ['dog', 'capybara']) for (const n of Object.keys(GIF_SCENES)) {
    openGif(SHOP_AVATARS.find(a => a.id === id), n, 'hi', 60000); const p = document.getElementById('gif-pop');
    if (p.querySelectorAll('.gp-stage .gp-e').length < 2 || (n !== 'headache' && ![...p.querySelectorAll('.gp-stage .gp-e')].some(e => AVATAR_FX[id].fx.includes(e.textContent))) || !p.getAnimations({ subtree: true }).length || (id === 'capybara' && !p.querySelector('.gp-stage img'))) out.push(id + ':' + n); closeGif(); } return out; });
  check(scenes.length === 0, `all ${await page.evaluate(() => Object.keys(GIF_SCENES).length)} cartoons draw and move, each with the character's own things (emoji and drawn characters)${scenes.length ? ': ' + scenes.join(', ') : ''}`);

  await setAvatar('dog');
  await page.click('#menu-avatar');
  await page.waitForSelector('#gif-pop', { timeout: 5000 });
  let g = await gif();
  const dogGifs = await page.evaluate(() => AVATAR_GIFS.dog);
  const sceneSay = await page.evaluate(n => GIF_SCENES[n].say, g.scene);
  const sceneHe = await page.evaluate(n => GIF_SCENES[n].he, g.scene);
  check(dogGifs.includes(g.scene) && g.say.includes('Woof woof! ' + sceneSay) && g.he === 'הב הב! ' + sceneHe && g.stage.includes('🐶') && g.stage.some(t => ['🦴', '🐾'].includes(t)) && g.moving > 0,
        `tapping the dog opens one of its GIFs (${g.scene}): the dog with its bones / paws, moving, its own "Woof woof!" and the cartoon's own line (${sceneSay}) and a Hebrew line (${g.he})`);
  check(g.fits && await page.$eval('#gif-pop .gp-badge', e => e.textContent === 'GIF'), 'the GIF pop-up is fully on the screen');
  check(!(await page.$eval('#avatar-bubble', e => e.classList.contains('on'))) && !(await page.evaluate(() => typeof avatarWord !== 'undefined')), 'no word to learn any more');
  check(await page.$eval('#menu-avatar', e => e.disabled), 'while the GIF is open the character\'s button is off');
  await new Promise(r => setTimeout(r, 300));
  check(JSON.stringify(await spoken()) === JSON.stringify(['Woof woof!', sceneSay]), `it says "Woof woof!" and "${sceneSay}" aloud`);
  await page.waitForFunction(() => !document.getElementById('gif-pop'), { timeout: 8000 });
  await turnOver();
  check(true, 'the GIF closes by itself after a few seconds, and the button is on again');
  // the next taps: its other GIFs, in turn; a tap on the pop-up closes it at once
  const seen = [g.scene];
  for (let k = 0; k < 3; k++) {
    await new Promise(r => setTimeout(r, 200));
    await page.click('#menu-avatar');
    await page.waitForSelector('#gif-pop', { timeout: 5000 });
    const gk = await gif(); seen.push(gk.scene); seen.says = [...(seen.says || [g.say]), gk.say];
    await page.click('#gif-pop');
    check(!(await page.$('#gif-pop')), `tap ${k + 2}: a tap on the GIF closes it`);
    await turnOver();
  }
  check(new Set(seen).size === 4 && seen.every(n => dogGifs.includes(n)), `4 taps show the dog's 4 different GIFs (${seen.join(', ')})`);
  check(new Set(seen.says).size === 4, `each GIF says something different (${seen.says.join(' / ')})`);
  check(await page.evaluate(() => { const s = Object.values(GIF_SCENES).map(x => x.say); return s.every(Boolean) && new Set(s).size === s.length; }), 'every cartoon has its own English line');
  check(await page.evaluate(() => SHOP_AVATARS.every(a => AVATAR_SAY_HE[a.id]) && Object.values(GIF_SCENES).every(x => x.he)), 'every character phrase and every cartoon line has its Hebrew too');

  // the 5th tap in a row (slow taps too): dizzy, then the headache GIF
  await spoken();
  await page.click('#menu-avatar');
  await page.waitForFunction(() => document.getElementById('avatar-bubble').classList.contains('on'), { timeout: 5000 });
  check((await text('#avatar-bubble .ab-say')).includes('dizzy') && !(await page.$('#gif-pop')), 'the 5th tap in a row: first the character spins, dizzy');
  await page.waitForSelector('#gif-pop', { timeout: 5000 });
  g = await gif();
  check(g.scene === 'headache' && g.stage.includes('🧊') && g.say.includes('headache') && g.he.includes('כואב לי הראש'), 'then a headache: an ice pack on its head, "Ouch, now I have a headache!" / "אוי, כואב לי הראש!"');
  await page.click('#gif-pop');
  await turnOver();
  const sp = await spoken();
  check(sp.includes("Whoa, I'm dizzy!") && sp.includes('Ouch, now I have a headache!'), 'it says both aloud');
  await page.click('#menu-avatar');
  await page.waitForSelector('#gif-pop', { timeout: 5000 });
  check((await gif()).scene !== 'headache', 'after the headache the count starts over (the next tap is a GIF again)');
  await page.click('#gif-pop'); await turnOver();
  // a pause of more than 6 seconds starts the count over
  await page.evaluate(() => { avatarTaps = 4; avatarLastTap = Date.now() - 6500; });
  await page.click('#menu-avatar');
  await page.waitForSelector('#gif-pop', { timeout: 5000 });
  check((await gif()).scene !== 'headache', 'after a 6-second pause, the next tap is not the 5th in a row');
  await page.click('#gif-pop'); await turnOver();

  // the capybara (a drawn character) has its GIFs too
  await setAvatar('capybara');
  await page.click('#menu-avatar');
  await page.waitForSelector('#gif-pop', { timeout: 5000 });
  g = await gif();
  check(g.imgs > 0 && (await page.evaluate(() => AVATAR_GIFS.capybara)).includes(g.scene) && g.say.includes("I'm so chill! " + await page.evaluate(n => GIF_SCENES[n].say, g.scene)), `the drawn capybara stars in its own GIF (${g.scene})`);
  await page.setViewport({ width: 320, height: 568 });
  check((await gif()).fits, '320x568: the GIF fits on a small phone');
  await page.click('#gif-pop'); await turnOver();

  // 🐾 the chosen character wanders on the background, one of it (over the card on phones, faint, taps go through),
  // and not during a quiz or a learning card
  const sky = () => page.evaluate(() => { const s = document.getElementById('avatar-sky'), els = [...s.children];
    return { n: els.length, pics: els.map(e => e.textContent), imgs: s.querySelectorAll('img').length, moving: els.every(e => e.getAnimations().length > 0),
      z: getComputedStyle(s).zIndex, taps: getComputedStyle(s).pointerEvents, op: els.length ? +getComputedStyle(els[0]).opacity : 0, shown: getComputedStyle(s).display !== 'none' }; });
  let k = await sky();
  check(k.n === 1 && k.imgs === 1 && k.moving && k.shown, `the drawn capybara wanders on the main screen, one of it (${k.n})`);
  await setAvatar('fox');
  k = await sky();
  check(k.n === 1 && k.pics[0] === '🦊' && k.moving, `choosing another character: it wanders instead (${k.pics.join('')})`);
  await page.evaluate(() => { document.getElementById('words-input').value = 'cat\tחתול\ndog\tכלב\nsun\tשמש\nmoon\tירח'; renderWords(); startFromInput(); });
  check(!(await sky()).shown, 'not during a quiz');
  await page.evaluate(() => { clearTimeout(nextQuestionTimer); showStart(); });
  check((await sky()).shown, 'back on the main screen it wanders again');
  await page.evaluate(() => startLearning(1, 0)); await new Promise(r => setTimeout(r, 500));
  const learning = await page.evaluate(() => getComputedStyle(document.getElementById('learn-screen')).display !== 'none');
  check(learning && !(await sky()).shown, `not during learning (learn screen shown: ${learning})`);
  await page.evaluate(() => showStart());
  k = await sky();
  check(k.z === '2' && k.taps === 'none' && k.op < 0.5, `phone: they wander over the card, faint (${k.op}), and taps go through (z ${k.z}, ${k.taps})`);
  await page.setViewport({ width: 1280, height: 800 });
  k = await sky();
  check(k.z === '0', `wide screen: they stay behind the card (z ${k.z})`);
  await page.setViewport({ width: 320, height: 568 });

  // no character chosen: no badge to tap, and nobody on the background
  await page.evaluate(() => { shop.avatar = null; applyShop(); });
  check(!(await page.$eval('#menu-avatar', e => e.getBoundingClientRect().width > 0)), 'without a character there is nothing to tap');
  check((await sky()).n === 0, 'without a character the background has none');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 👫 friends: the top row of buttons, a search box with names from the cloud, who is playing now
async function testFriends() {
  console.log('\n[friends] the 👫 page: add friends from a list of names, see who is playing now');
  const page = await openPage();
  const shown = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const rect = id => page.$eval('#' + id, e => e.getBoundingClientRect().toJSON());
  // the top row: 🏪 🎮 ... 👫 🏆 🙂 (the shop and the character in the corners); no title; the name under the row, bigger
  await page.evaluate(() => { shop.owned.push('dog'); shop.avatar = 'dog'; applyShop(); setPlayerName('נועה'); });
  const [sh, gm, fr, tp, av, nm] = await Promise.all(['shop-btn', 'games-btn', 'friends-btn', 'top-btn', 'menu-avatar', 'player-name'].map(rect));
  check([gm, fr, tp, av].every(x => Math.abs(x.top - sh.top) < 4) && sh.left < gm.left && fr.right <= tp.left + 1 && tp.right <= av.left + 1 && tp.left - fr.right < 2 && av.left - tp.right < 2 && gm.left - sh.right < 2,
    'one row at the top: shop and 🎮 on the left, 👫 🏆 and the character on the right');
  check(!(await page.$('#app-title')) && nm.top >= sh.bottom - 2 && nm.right <= 360, 'no title; the name is in its own line under the row');
  check(parseFloat(await page.$eval('#player-name', e => getComputedStyle(e).fontSize)) >= 18, 'the name is bigger');
  await page.evaluate(() => { shop.avatar = ''; applyShop(); });
  const [tp2, fr2] = await Promise.all(['top-btn', 'friends-btn'].map(rect));
  check(tp2.right > tp.right + 20 && fr2.right > fr.right + 20, 'no character: the 🏆 and 👫 move into the corner');
  // the cloud is a stand-in: names of all the players, and the friends' entries
  await page.evaluate(() => {
    window.searched = [];
    const all = ['נועה', 'נוי', 'נגה', 'Noam', 'דני', 'דנה'];
    window.cloud = { sync() {}, claim: async () => 'ok', top: async () => [],
      search: async t => { searched.push(t); const k = t.trim().toLowerCase(); return all.filter(n => n.toLowerCase().startsWith(k)).slice(0, 10); },
      friends: async names => names.filter(n => n !== 'רון').map(n => ({ name: n, online: n === 'נגה', points: n.length * 10, avatar: n === 'נגה' ? 'dog' : '' })) };
  });
  await page.click('#friends-btn');
  check((await shown('friends-screen')) && !(await shown('start-screen')), 'the 👫 button opens the friends page');
  check((await page.$eval('#fr-msg', e => e.textContent)).includes('עדיין אין חברים'), 'no friends yet: it says how to add one');
  await page.click('#fr-search');
  await page.waitForSelector('#fr-drop.on li', { timeout: 3000 });
  let drop = await page.$$eval('#fr-drop li', ls => ls.map(l => l.textContent));
  check(drop.length === 5 && !drop.some(t => t.includes('נועה')), `a tap on the box lists all the names, without this player (${drop.join(', ')})`);
  await page.type('#fr-search', 'נ');
  await page.waitForFunction(() => document.querySelectorAll('#fr-drop li').length === 2, { timeout: 3000 });
  drop = await page.$$eval('#fr-drop li', ls => ls.map(l => l.textContent));
  check(drop.join() === '➕ נוי,➕ נגה', `typing shows the names that start with it (${drop.join(', ')})`);
  await page.evaluate(() => [...document.querySelectorAll('#fr-drop li')].find(l => l.textContent.includes('נגה')).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForSelector('#fr-body .fr-list li', { timeout: 3000 });
  check(JSON.parse(await page.evaluate(() => localStorage.getItem('englishquiz-friends'))).join() === 'נגה' && (await page.$eval('#fr-search', i => i.value)) === '' && !(await page.$('#fr-drop.on')),
    'picking a name adds the friend (saved on the device), and the box is cleared');
  await page.type('#fr-search', 'נ');
  await page.waitForFunction(() => document.querySelectorAll('#fr-drop li').length === 1, { timeout: 3000 });
  check((await page.$eval('#fr-drop li', l => l.textContent)) === '➕ נוי', 'a friend already on the list is not offered again');
  await page.evaluate(() => [...document.querySelectorAll('#fr-drop li')][0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => document.querySelectorAll('#fr-body .fr-list li').length === 2, { timeout: 3000 });
  await page.type('#fr-search', 'xyz');
  await page.waitForFunction(() => document.querySelector('#fr-drop li')?.textContent === 'לא נמצאו שמות', { timeout: 3000 });
  check(true, 'no match: the list says no names were found');
  const rows = await page.$$eval('#fr-body .fr-list li', ls => ls.map(l => ({ text: l.textContent, on: l.classList.contains('on'), img: l.querySelector('.t-av').textContent, dot: getComputedStyle(l.querySelector('.fr-dot'), '::before').backgroundColor, label: l.querySelector('.fr-dot').getAttribute('aria-label') })));
  check(rows[0].dot === 'rgb(56, 161, 105)' && rows[0].label === 'משחק עכשיו' && rows[0].text.includes('נגה') && !rows[0].text.includes('משחק עכשיו') && rows[0].on && rows[0].img,
    `a friend playing now is first, with a green circle (no words) and their character (${rows[0].dot})`);
  check(rows[1].dot === 'rgb(160, 174, 192)' && rows[1].label === 'לא מחובר' && rows[1].text.includes('נוי') && !rows[1].text.includes('לא מחובר') && rows[1].text.includes('⭐ 30'), `one not playing: a gray circle, with the points (${rows[1].dot})`);
  // a name that is no longer in the cloud
  await page.evaluate(() => { friends.push('רון'); saveFriends(); renderFriends(); });
  await page.waitForFunction(() => document.querySelectorAll('#fr-body .fr-list li').length === 3, { timeout: 3000 });
  check((await page.$$eval('#fr-body .fr-list li', ls => ls.map(l => l.textContent))).some(t => t.includes('רון') && t.includes('השם לא נמצא')), 'a name that is gone from the cloud says so');
  // remove one (asks first)
  await page.evaluate(() => [...document.querySelectorAll('#fr-body .fr-list li')].find(l => l.textContent.includes('נוי')).querySelector('.fr-del').click());
  await page.waitForSelector('[data-dialog]', { timeout: 3000 });
  await page.evaluate(() => [...document.querySelectorAll('[data-dialog] button')].find(b => b.textContent.includes('הסרה')).click());
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('englishquiz-friends')).includes('נוי'), { timeout: 3000 });
  check(true, 'the ✕ removes a friend after asking');
  // the app reopens on this page; back goes to the main screen
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('friends-screen')).display !== 'none', { timeout: 5000 }).catch(() => {});
  check(await shown('friends-screen'), 'reopening the app comes back to the friends page');
  await page.click('#friends-back');
  check((await shown('start-screen')) && !(await shown('friends-screen')), 'the back button goes to the main screen');
  // without the cloud
  await page.evaluate(() => { window.cloud = undefined; });
  await page.click('#friends-btn');
  await page.waitForFunction(() => document.getElementById('fr-msg')?.textContent.includes('אין חיבור'), { timeout: 3000 });
  check(true, 'without a network it says there is no connection');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 🔄 a new version while the app is open: it reloads itself on the main menu only (never in a quiz, a game or a pop-up)
async function testUpdate() {
  console.log('\n[update] a new version reloads the app on the main menu, never in the middle of something');
  const ctx = await browser.createBrowserContext();
  const page = await newTestPage(ctx);
  page.pageErrors = [];
  page.on('pageerror', e => page.pageErrors.push(e.message));
  await page.goto(url, { waitUntil: 'load' });
  // the very first install (no older version yet): the new service worker takes over, no reload
  await page.evaluate(() => { window.mark = 1; });
  await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 10000 });
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await new Promise(r => setTimeout(r, 2500));
  check(await page.evaluate(() => window.mark === 1), 'the first install never reloads the page');
  // an app with a version: open the shop, then a new version takes over
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 500));
  const reloaded = () => page.evaluate(() => window.mark !== 1);
  await page.evaluate(() => { window.mark = 1; openShop(); navigator.serviceWorker.dispatchEvent(new Event('controllerchange')); });
  await new Promise(r => setTimeout(r, 3500));
  check(!(await reloaded()), 'a new version while in the shop: no reload yet');
  // back on the main menu, but a pop-up open: still waits
  await page.evaluate(() => { showStart(); const d = document.createElement('div'); d.dataset.dialog = '1'; d.id = 'test-dialog'; document.body.appendChild(d); });
  await new Promise(r => setTimeout(r, 3500));
  check(!(await reloaded()), 'on the main menu with a pop-up open: no reload yet');
  // the pop-up closed: it reloads, and the progress is still there
  await page.evaluate(() => { grandTotal = 77; localStorage.setItem(TOTAL_KEY, '77'); document.getElementById('test-dialog').remove(); });
  await page.waitForFunction(() => window.mark !== 1, { timeout: 6000 }).catch(() => {});
  check(await reloaded(), 'once on the main menu with nothing open, the app reloads itself to the new version');
  await page.waitForFunction(() => typeof grandTotal !== 'undefined', { timeout: 6000 });
  check(await page.evaluate(() => grandTotal === 77), 'after the reload the points are all still there');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close(); await ctx.close();
}

async function testKeep() {
  console.log('\n[keep] progress survives app updates');
  const ctx = await browser.createBrowserContext();
  const page = await newTestPage(ctx);
  page.pageErrors = [];
  page.on('pageerror', e => page.pageErrors.push(e.message));
  // count the requests for "persistent storage" (Chrome answers on its own; the mock says no, so it asks every load)
  await page.evaluateOnNewDocument(() => { window.persistAsked = 0; if (navigator.storage) { navigator.storage.persisted = async () => false; navigator.storage.persist = async () => { window.persistAsked++; return true; }; } });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 10000 }).catch(() => page.reload({ waitUntil: 'load' }));
  check((await page.evaluate(() => window.persistAsked)) === 1, 'the app asks the browser to keep its data (never cleared when space runs low)');
  // some progress: points, a character, a passed topic, a streak
  const keys = ['englishquiz-total-points', 'englishquiz-shop', 'englishquiz-learn-progress', 'englishQuizStreak'];
  await page.evaluate(() => { grandTotal = 321; localStorage.setItem(TOTAL_KEY, '321'); shop.owned.push('dog'); shop.avatar = 'dog'; saveShop();
    localStorage.setItem(LEARN_KEY, JSON.stringify({ 1: [0, 2] })); localStorage.setItem(STREAK_KEY, localStorage.getItem(STREAK_KEY) || '0'); });
  const before = await page.evaluate(k => k.map(x => localStorage.getItem(x)), keys);
  // an app update = a new service worker: the old file cache is thrown away and the files are loaded again
  await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); });
  await page.reload({ waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  const after = await page.evaluate(k => k.map(x => localStorage.getItem(x)), keys);
  check(JSON.stringify(after) === JSON.stringify(before) && before.every(v => v !== null), 'after an update (all files reloaded) the points, shop, learning path and streak are all still there');
  check((await page.$eval('#grand-total', e => e.textContent)).includes('321') && (await page.$eval('#menu-avatar', e => e.textContent)) === '🐶', 'and the app shows them (321 points, the dog)');
  // old data: the unicorn background shared the id "unicorn" with the unicorn character
  await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ owned: ['purple', 'unicorn'], avatar: 'unicorn', theme: 'unicorn', boxes: 0, awards: {} })), 'englishquiz-shop');
  await page.reload({ waitUntil: 'load' });
  const uni = await page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('englishquiz-shop')), ids: [...SHOP_AVATARS, ...SHOP_THEMES].map(i => i.id) }));
  check(new Set(uni.ids).size === uni.ids.length, 'every character and background has its own id');
  check(uni.s.owned.includes('unicorn') && uni.s.owned.includes('unicornland') && uni.s.avatar === 'unicorn' && uni.s.theme === 'unicornland' && uni.s.uniFix === 1,
    'old "unicorn" data keeps both the unicorn character and the unicorn background (still in use)');
  await page.evaluate(() => { shop.owned = shop.owned.filter(i => i !== 'unicornland'); saveShop(); });
  await page.reload({ waitUntil: 'load' });
  check(!(await page.evaluate(() => shop.owned.includes('unicornland'))), 'the fix runs only once (buying the character later does not give the background)');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await ctx.close();
}

async function testPictures() {
  console.log('\n[pictures] picture backgrounds and the capybara');
  const page = await openPage();
  const info = await page.evaluate(() => ({
    pics: SHOP_THEMES.filter(t => t.scene).map(t => t.id),
    uniqueThemePrices: new Set(SHOP_THEMES.map(t => t.price)).size === SHOP_THEMES.length,
    uniqueAvatarPrices: new Set(SHOP_AVATARS.map(a => a.price)).size === SHOP_AVATARS.length,
    avatars: SHOP_AVATARS.length,
  }));
  check(info.pics.length >= 12 && info.pics.includes('unicornland') && info.pics.includes('capyspa'), `${info.pics.length} picture backgrounds, with a unicorn one and a capybara one`);
  check(info.avatars >= 60 && info.uniqueThemePrices && info.uniqueAvatarPrices, `${info.avatars} characters; every item still has its own price`);
  // every picture background is drawn and used (a picture, not just colors); the card becomes see-through
  const bad = [];
  for (const id of info.pics) {
    await page.evaluate(id => { if (!shop.owned.includes(id)) shop.owned.push(id); shop.theme = id; saveShop(); applyShop(); }, id);
    const ok = await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--bg').includes('blob:'), { timeout: 5000 }).then(() => true, () => false);
    if (!ok) bad.push(id);
  }
  check(!bad.length, `every picture background is drawn as a picture${bad.length ? ' (not: ' + bad.join(', ') + ')' : ''}`);
  check(await page.evaluate(() => document.body.classList.contains('pic-theme') && getComputedStyle(document.querySelector('.game-container')).backgroundColor.startsWith('rgba')), 'with a picture background the card is see-through');
  // the picture follows the screen size: a new picture after a big resize
  const before = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg'));
  await page.setViewport({ width: 800, height: 600 });
  const resized = await page.waitForFunction(b => getComputedStyle(document.body).getPropertyValue('--bg') !== b, { timeout: 5000 }, before).then(() => true, () => false);
  await page.setViewport({ width: 360, height: 800 });
  check(resized, 'turning the screen draws the picture again for the new size');
  // back to a plain background: no picture, the card is white again
  await page.evaluate(() => { shop.theme = 'purple'; saveShop(); applyShop(); });
  check(await page.evaluate(() => !document.body.classList.contains('pic-theme') && !getComputedStyle(document.body).getPropertyValue('--bg').includes('blob:')), 'a color background has no picture and a white card');
  // ⚽ Messi: a drawn character, and a background with him next to a goat in Argentina's shirt
  const m = await page.evaluate(async () => {
    const drawn = await Promise.all(Object.entries(SCENE_IMGS).map(([n, f]) => { const i = new Image(); i.src = f(); return i.decode().then(() => i.naturalWidth > 0 ? '' : n, () => n); }));
    const t = SHOP_THEMES.find(x => x.id === 'messigoat'), a = SHOP_AVATARS.find(x => x.id === 'messi');
    shop.owned.push('messi', 'messigoat'); shop.avatar = 'messi'; shop.theme = 'messigoat'; saveShop(); applyShop(); openShop();
    return { bad: drawn.filter(Boolean), names: t && t.scene.big.map(b => b[0]), img: !!(a && a.img), says: AVATAR_FX.messi.says.length,
      shop: !!document.querySelector('#shop-avatars [data-id="messi"] img.pic-img'), swatch: !!document.querySelector('#shop-themes [data-id="messigoat"] img.pic-img'),
      bothIds: SHOP_AVATARS.some(x => x.id === 'messigoat') || SHOP_THEMES.some(x => x.id === 'messi') };
  });
  check(!m.bad.length && m.img && m.names && m.names.includes('messi') && m.names.includes('goat') && m.names.includes('⚽') && m.shop && m.swatch && !m.bothIds,
    `Messi: a drawn character, and a background with Messi, a goat in Argentina's shirt and a ball (${JSON.stringify(m)})`);
  check(await page.waitForFunction(() => getComputedStyle(document.body).getPropertyValue('--bg').includes('blob:'), { timeout: 5000 }).then(() => true, () => false), 'the Messi background is drawn as a picture');
  await page.evaluate(() => { showStart(); speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 50); });
  const lines = new Set();
  for (let k = 0; k < 3; k++) {
    await page.waitForFunction(() => !document.getElementById('menu-avatar').disabled, { timeout: 15000 });
    await page.evaluate(() => { avatarLastTap = 0; });
    await page.click('#menu-avatar');
    await page.waitForSelector('#gif-pop', { timeout: 5000 });
    const g = await page.evaluate(() => { const p = document.getElementById('gif-pop'); return { scene: p.dataset.scene, say: p.querySelector('.gp-say').textContent, he: p.querySelector('.gp-he').textContent, img: !!p.querySelector('.gp-stage img') }; });
    const ok = await page.evaluate(g => AVATAR_GIFS.messi.includes(g.scene) && AVATAR_FX.messi.says.some(([en, he]) => g.say.endsWith(en) && g.he === he), g);
    check(ok && g.img, `tapping Messi: a football GIF (${g.scene}) and one of his lines: "${g.say}" / "${g.he}"`);
    lines.add(g.say);
    await page.click('#gif-pop');
  }
  check(lines.size >= 2, `a different line each time (${lines.size} different in 3 taps)`);
  await page.waitForFunction(() => !document.getElementById('menu-avatar').disabled, { timeout: 15000 });
  await page.evaluate(() => { avatarLastTap = 0; shop.theme = 'purple'; shop.avatar = null; saveShop(); applyShop(); });
  // the capybara: a drawing (no emoji exists) everywhere a character shows
  await page.evaluate(() => { shop.owned.push('capybara'); shop.avatar = 'capybara'; saveShop(); applyShop(); openShop(); });
  const capy = await page.evaluate(() => ({
    menu: !!document.querySelector('#menu-avatar img.pic-img'), game: !!document.querySelector('#game-avatar img.pic-img'),
    shop: !!document.querySelector('#shop-avatars [data-id="capybara"] img.pic-img'), swatch: !!document.querySelector('#shop-themes [data-id="capyspa"] img.pic-img'),
    loaded: [...document.querySelectorAll('img.pic-img')].every(i => i.complete && i.naturalWidth > 0),
  }));
  check(capy.menu && capy.game && capy.shop && capy.swatch && capy.loaded, `the capybara drawing shows on the main screen, in the quiz, in the shop and on its background's swatch (${JSON.stringify(capy)})`);
  await page.evaluate(() => { showStart(); speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 50); });
  await page.click('#menu-avatar');
  await page.waitForSelector('#gif-pop', { timeout: 10000 });
  check((await page.$eval('#gif-pop', e => e.querySelector('.gp-say').textContent === "I'm so chill! " + GIF_SCENES[e.dataset.scene].say)) && !!(await page.$('#gif-pop .gp-stage img.pic-img')), "tapping the capybara: its drawing in a GIF, with its own phrase and that cartoon's line");
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

async function testWand() {
  console.log('\n[wand] a magic wand takes away a wrong answer in a quiz (an ordinary end-of-quiz box gives none)');
  const page = await openPage();
  await page.evaluate(() => {
    speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 50); speechSynthesis.cancel = () => {}; window.coinSound = () => {};
    document.getElementById('words-input').value = Array.from({ length: 6 }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n');
    renderWords();
  });
  const wands = () => page.evaluate(() => [shop.wands || 0, (JSON.parse(localStorage.getItem(SHOP_KEY)) || {}).wands || 0].join());
  const finishQuiz = () => page.evaluate(() => {
    showStart(); startFromInput();
    while (currentIndex < wordsData.length) { const c = wordsData[currentIndex].correct; [...document.querySelectorAll('#answers-container button')].find(b => b.innerText === c).click(); clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion(); }
  });
  const shown = sel => page.$eval(sel, e => getComputedStyle(e).display !== 'none');

  await page.evaluate(() => { showStart(); startFromInput(); });
  check(await shown('#wand-btn') && await page.$eval('#wand-btn', e => e.disabled) && (await page.$eval('#wand-count', e => e.textContent)) === '0', 'without a wand the wand button shows 0 and is disabled');
  await finishQuiz();
  await page.click('#coin-box');
  await new Promise(r => setTimeout(r, 1500));
  check((await wands()) === '0,0' && !(await page.$eval('#box-toast', e => e.classList.contains('on') && e.textContent.includes('שרביט'))), 'the box at the end of a quiz gives no magic wand');
  await page.evaluate(() => { shop.wands = 1; saveShop(); showWands(); });
  check((await page.$eval('#menu-wands', e => e.textContent)) === '🪄 1' && (await page.$eval('#shop-wands', e => e.textContent)) === '🪄 × 1', 'with a wand (from the shop box) the main screen and the shop count it (🪄 1)');

  // using it
  await page.evaluate(() => { showStart(); startFromInput(); });
  const before = await page.evaluate(() => ({ score: totalScore, streak }));
  check(await shown('#wand-btn') && (await page.$eval('#wand-count', e => e.textContent)) === '1' && !(await page.$eval('#wand-btn', e => e.disabled)), 'in the quiz the wand button shows how many wands there are (1)');
  const side = await page.evaluate(() => { const b = document.getElementById('wand-btn').getBoundingClientRect(), r = document.getElementById('answers-container').getBoundingClientRect(); return { b: b.right, r: r.right, l: r.left }; });
  check(Math.abs(side.b - side.r) < 4, `the wand button is on the right side (its right edge ${Math.round(side.b)}, the answers' ${Math.round(side.r)})`);
  // it asks first: "cancel" keeps the wand
  await page.click('#wand-btn');
  await page.waitForSelector('[data-dialog] [data-ok]', { timeout: 3000 });
  check((await page.$eval('[data-dialog] [data-text]', e => e.textContent)).includes('שרביט'), 'tapping the wand first asks "are you sure?"');
  await page.click('[data-dialog] [data-cancel]');
  check((await wands()) === '1,1' && !(await page.$('#answers-container .faded')) && !(await page.$eval('#wand-btn', e => e.disabled)), 'cancel: the wand is kept and nothing is taken away');
  await page.click('#wand-btn');
  await page.waitForSelector('[data-dialog] [data-ok]', { timeout: 3000 });
  await page.click('[data-dialog] [data-ok]');
  const st = await page.evaluate(() => { const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container .btn-answer')];
    return { faded: bs.filter(b => b.classList.contains('faded')).map(b => ({ t: b.innerText, off: b.disabled })), c, n: bs.length, magic: bs.some(b => b.classList.contains('magic')), rightOn: !bs.find(b => b.innerText === c).disabled }; });
  check(st.faded.length === 1 && st.faded[0].t !== st.c && st.faded[0].off && !st.magic && st.rightOn && st.n === 4, `tapping the wand takes away one wrong answer (it fades and cannot be tapped), the right one is not shown (${JSON.stringify(st.faded)})`);
  check((await wands()) === '0,0' && await page.$eval('#wand-btn', e => e.disabled), 'the wand is used up (saved), once per question');
  check((await page.$eval('#menu-wands', e => e.textContent)) === '' && (await page.$eval('#shop-wands', e => e.textContent)) === '🪄 × 0', 'the counts go down too (none left: nothing on the main screen, 0 in the shop)');
  // reopening the app in the middle of that question: still shown, the wand is not given back
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('game-screen')).display !== 'none', { timeout: 10000 });
  check((await page.$$eval('#answers-container .faded', b => b.map(x => x.innerText))).join() === st.faded[0].t && (await wands()) === '0,0', 'after reopening the app the same wrong answer is still taken away (the wand is not given back)');
  await page.evaluate(() => { speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 50); window.coinSound = () => {}; });
  await page.evaluate(() => { const c = wordsData[currentIndex].correct; [...document.querySelectorAll('#answers-container .btn-answer')].find(b => b.innerText === c).click(); });
  const after = await page.evaluate(() => ({ score: totalScore, streak, missed: missed.length }));
  check(after.score === before.score && after.streak === before.streak && after.missed === 1, 'the word answered with the wand gives no point, takes none, keeps the streak and goes to the practice list');
  await page.evaluate(() => { clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion(); });
  check(await shown('#wand-btn') && await page.$eval('#wand-btn', e => e.disabled) && (await page.$eval('#wand-count', e => e.textContent)) === '0', 'with no wands left the button stays disabled (0) on the next question');

  // ordinary end-of-quiz boxes never add a wand, opened or not (the lucky one is tested in [boxextra])
  await finishQuiz(); await page.evaluate(() => showStart());   // left closed
  await finishQuiz(); await page.click('#coin-box');
  await finishQuiz(); await page.evaluate(() => restartGame());
  check((await wands()) === '0,0', `ordinary end-of-quiz boxes add no wands, opened or not (${await wands()})`);
  // the wand takes away only wrong answers that are still there; none left: it is not used
  await page.evaluate(() => { showStart(); startFromInput(); shop.wands = 1; saveShop(); updateWandBtn(); const c = wordsData[currentIndex].correct;
    [...document.querySelectorAll('#answers-container .btn-answer')].filter(b => b.innerText !== c).slice(0, 2).forEach(b => b.click()); });
  await page.click('#wand-btn'); await page.waitForSelector('[data-dialog] [data-ok]', { timeout: 3000 }); await page.click('[data-dialog] [data-ok]');
  const st2 = await page.evaluate(() => { const bs = [...document.querySelectorAll('#answers-container .btn-answer')]; return { wrong: bs.filter(b => b.classList.contains('wrong')).length, faded: bs.filter(b => b.classList.contains('faded') && !b.classList.contains('wrong')).length }; });
  check(st2.wrong === 2 && st2.faded === 1 && (await wands()) === '0,0', `after 2 wrong taps the wand takes away the last wrong answer (${JSON.stringify(st2)})`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

async function testBoxExtra() {
  console.log('\n[boxextra] in every 10 quizzes with more than half right, one random box has 50 more coins or a magic wand');
  const page = await openPage();
  await page.evaluate(() => { window.coinSound = () => {}; playUnlockSound = () => {};
    document.getElementById('words-input').value = Array.from({ length: 10 }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n'); renderWords(); });
  const play = wrong => page.evaluate(wrong => {   // a whole quiz of the 10 words; the first `wrong` ones get a wrong answer first
    collectCoins(); showStart(); startFromInput();
    for (let k = 0; currentIndex < wordsData.length; k++) {
      const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container button')];
      if (k < wrong) bs.find(b => b.innerText !== c).click();
      bs.find(b => b.innerText === c).click();
      clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion();
    }
    return { points: totalScore, pending: pendingCoins, total: grandTotal, extra: JSON.parse(localStorage.getItem('englishquiz-box-extra')) };
  }, wrong);
  const setRound = (n, at, wand = false) => page.evaluate((n, at, wand) => { boxExtra = { n, at, wand }; localStorage.setItem('englishquiz-box-extra', JSON.stringify(boxExtra)); }, n, at, wand);

  // every 10 good quizzes: exactly one bonus, in a random place
  const odds = await page.evaluate(() => { const out = []; boxExtra = newExtraRound(); for (let k = 0; k < 200; k++) { const c = boxExtraFor(80); out.push(c === 50 ? 'c' : boxWand ? 'w' : c === 0 ? '-' : '?'); } return out; });
  const per10 = Array.from({ length: 20 }, (_, b) => odds.slice(b * 10, b * 10 + 10).filter(x => x !== '-').length);
  const places = new Set(Array.from({ length: 20 }, (_, b) => odds.slice(b * 10, b * 10 + 10).findIndex(x => x !== '-')));
  const kinds = odds.filter(x => x !== '-');
  check(per10.every(n => n === 1) && !odds.includes('?'), `in each 10 good quizzes exactly one gives a bonus (${per10.join(',')})`);
  check(places.size > 1, `in a random place each time (places: ${[...places].join(',')})`);
  check(kinds.includes('c') && kinds.includes('w'), `the bonus is sometimes +50 and sometimes a magic wand (${kinds.join('')})`);
  check(await page.evaluate(() => boxExtraFor(50) === 0 && boxExtraFor(30) === 0), 'exactly half right, or less, does not count');

  await setRound(2, 3);
  let r = await play(6);   // 40%: does not count
  check(r.pending === r.points && r.extra.n === 2, `a quiz with less than half right: no bonus, not counted (${r.extra.n})`);
  r = await play(0);       // the 3rd good quiz: the lucky one
  check(r.pending === r.points + 50 && r.extra.n === 3, `the lucky quiz: its box holds the quiz's points + 50 (${r.points} + 50 = ${r.pending})`);
  check((await page.$eval('#summary-final-score', e => e.innerText)).includes(`נקודות בבוחן: ${r.points} ·`), 'a surprise: the result screen does not tell before the box is opened');
  await page.click('#coin-box');
  await page.waitForFunction(t => getComputedStyle(document.getElementById('coin-box')).display === 'none' && document.getElementById('summary-final-score').innerText.endsWith('סה״כ: ' + t), { timeout: 8000 }, r.total + r.points + 50).catch(() => {});
  const toast = await page.$eval('#box-toast', e => e.textContent), sc = await page.$eval('#summary-final-score', e => e.innerText);
  const total = await page.evaluate(() => +localStorage.getItem('englishquiz-total-points'));
  check(toast.includes('50') && sc.includes('🎁 50 בונוס') && sc.includes(`סה״כ: ${r.total + r.points + 50}`) && total === r.total + r.points + 50,
    `opening it: "${toast}", and the 50 goes into the total ("${sc}")`);
  r = await play(0);
  check(r.pending === r.points, 'the next good quiz: a normal box');
  await setRound(9, 4);
  r = await play(0);
  check(r.pending === r.points && r.extra.n === 0 && r.extra.at >= 1 && r.extra.at <= 10, `after 10 good quizzes a new round of 10 starts, with a new lucky one (${r.extra.at})`);
  await page.reload();
  check(await page.evaluate(() => boxExtra.n === 0 && boxExtra.at >= 1 && boxExtra.at <= 10), 'the count is saved on the device');
  // 🔥 from 10 days in a row: the quiz's points are doubled, and so is the box bonus (+100)
  await page.evaluate(() => { daily = { last: dayStr(), days: 10 }; localStorage.setItem(DAILY_KEY, JSON.stringify(daily)); window.coinSound = () => {}; playUnlockSound = () => {}; });
  const plain = await play(0);
  await setRound(0, 1);
  r = await play(0);
  check(plain.points === 20 && r.points === 20 && r.pending === r.points + 100, `🔥 days in a row: the quiz's points are doubled (10 → ${r.points}) and the box bonus too (+100: ${r.pending})`);
  // 🪄 a wand round: the lucky quiz's box holds a magic wand (🔥 two), given at once; no extra coins
  await page.evaluate(() => { shop.wands = 0; saveShop(); daily = { last: dayStr(), days: 1 }; localStorage.setItem(DAILY_KEY, JSON.stringify(daily)); });
  await setRound(0, 1, true);
  r = await play(0);
  const w1 = await page.evaluate(() => [shop.wands, JSON.parse(localStorage.getItem(SHOP_KEY)).wands].join());
  check(r.pending === r.points && w1 === '1,1' && await page.$eval('#coin-box', e => getComputedStyle(e).display !== 'none'), `a wand round: the lucky quiz gives a magic wand (saved: ${w1}), no extra coins`);
  await page.click('#coin-box');
  await page.waitForFunction(() => document.getElementById('box-toast').textContent.includes('שרביט'), { timeout: 5000 }).catch(() => {});
  const wt = await page.$eval('#box-toast', e => e.textContent);
  check(wt.includes('שרביט') && wt.includes('1'), `opening its box tells about the wand: "${wt}"`);
  r = await play(0);
  check(r.pending === r.points && (await page.evaluate(() => shop.wands)) === 1, 'the next good quiz: no wand');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

async function testCelebrate() {
  console.log('\n[celebrate] the end of a test: a celebration as big as the score');
  const page = await openPage();
  await page.evaluate(() => {
    window.spoken = []; speechSynthesis.speak = u => { window.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 300); }; speechSynthesis.cancel = () => {};
    window.coins = 0; window.coinSound = () => window.coins++;
    if (!shop.owned.includes('dog')) shop.owned.push('dog'); shop.avatar = 'dog'; saveShop(); applyShop();
    document.getElementById('words-input').value = Array.from({ length: 10 }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n');
    renderWords();
  });
  const canvas = id => page.evaluate(id => !!document.getElementById(id), id);
  const clearFx = () => page.evaluate(() => { document.querySelectorAll('#fireworks, #confetti').forEach(c => c.remove()); document.getElementById('avatar-fx').innerHTML = ''; window.spoken.length = 0; window.coins = 0; });
  const score = () => page.$eval('#summary-final-score', e => e.innerText);
  // plays a whole quiz of the 10 words; the first `wrong` questions get a wrong answer first
  const play = wrong => page.evaluate(wrong => {
    showStart(); startFromInput();
    for (let k = 0; currentIndex < wordsData.length; k++) {
      const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container button')];
      if (k < wrong) bs.find(b => b.innerText !== c).click();
      bs.find(b => b.innerText === c).click();
      clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion();
    }
    return { points: totalScore, total: grandTotal };
  }, wrong);
  const sayOn = () => page.waitForFunction(() => document.getElementById('summary-say').classList.contains('on'), { timeout: 5000 }).then(() => page.$eval('#summary-say', e => e.textContent), () => '');

  // no mistakes: fireworks, the dog cheers "You're a champion!", the points count up
  await clearFx();
  let r = await play(0);
  const final = `נקודות בבוחן: ${r.points} · סה״כ: ${r.total + r.points}`;
  const shown = sel => page.$eval(sel, e => getComputedStyle(e).display !== 'none');
  const money = () => page.evaluate(() => [grandTotal, pendingCoins, +localStorage.getItem(TOTAL_KEY), +localStorage.getItem(PENDING_KEY)].join());
  check(r.points > 0 && await shown('#coin-box') && await shown('#summary-final-score') && (await score()) === `נקודות בבוחן: ${r.points} · סה״כ: ${r.total}`,
        `after the quiz a surprise box 🎁 waits on the result screen, under the quiz's points and the total from before (${await score()})`);
  check((await money()) === [r.total, r.points, r.total, r.points].join(), 'its points are saved as waiting, not in the total yet');
  check(await canvas('fireworks') && !(await canvas('confetti')), '100%: fireworks');
  check(await page.$eval('#summary-emoji', e => e.getAnimations().length > 0), 'the trophy pops in');
  check((await page.$eval('#summary-avatar', e => e.textContent)) === '🐶' && await page.$eval('#summary-avatar', e => e.getAnimations().length > 0), 'the dog jumps onto the result screen');
  check((await sayOn()).includes("You're a champion!"), 'the dog says "You\'re a champion!"');
  check(!(await page.evaluate(() => window.spoken)).includes("You're a champion!"), 'written only: it is not said aloud');
  check((await page.$$eval('#avatar-fx span', s => s.map(x => x.textContent))).some(t => ['🦴', '🐾'].includes(t)), 'its bones and paw prints burst out');
  check(await page.$eval('#summary-say', b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0; }), 'its bubble is on the screen');
  // 💃 all right on the first try: after the cheer, the dog does a dance party
  const danced = await page.waitForFunction(() => document.querySelector('#summary-say .ss-en')?.textContent.includes('Dance party!'), { timeout: 6000 }).then(() => true, () => false);
  check(danced && (await page.$eval('#summary-say .ss-he', e => e.textContent)) === 'מושלם! מסיבת ריקודים!' && await page.$eval('#summary-avatar', e => e.getAnimations().length > 0)
        && (await page.$$eval('#avatar-fx span', s => s.map(x => x.textContent))).some(t => ['💃', '🕺', '🎵', '🎶'].includes(t)), '100%: then it dances ("Perfect! Dance party!", 💃🎵 burst out)');
  check(await page.evaluate(() => summaryBusy), 'a tap on it waits until the dance is over');
  // open the box
  await page.evaluate(() => { document.getElementById('avatar-fx').innerHTML = ''; window.coins = 0; });
  await page.click('#coin-box');
  check((await money()) === [r.total + r.points, 0, r.total + r.points, 0].join(), 'tapping the box collects its points into the total at once (saved)');
  await page.click('#coin-box').catch(() => {});   // a second tap while it opens: nothing more
  await page.waitForFunction(() => document.querySelector('#coin-box .cb-pic').textContent === '💰', { timeout: 3000 }).catch(() => {});
  check((await page.$$eval('#avatar-fx span', s => s.map(x => x.textContent))).includes('💰'), 'it shakes, pops open into 💰 and coins burst out');
  const ticks = [];
  for (let k = 0; k < 150 && ticks[ticks.length - 1] !== r.total + r.points; k++) {
    const t = await page.evaluate(() => { const e = document.querySelector('#summary-final-score .total-up'); return e ? { n: +e.textContent, pop: e.getAnimations().length > 0 } : null; });
    if (t && ticks[ticks.length - 1] !== t.n) { ticks.push(t.n); if (t.pop) ticks.pops = (ticks.pops || 0) + 1; }
    await new Promise(res => setTimeout(res, 40));
  }
  check(ticks.length >= Math.min(r.points, 25) - 3 && ticks.every((n, i) => !i || n > ticks[i - 1]) && ticks[ticks.length - 1] === r.total + r.points && ticks.pops >= 3,
        `the total counts up step by step to its new value, popping as it goes (${ticks[0]} … ${ticks[ticks.length - 1]}, ${ticks.length} steps)`);
  await page.waitForFunction(t => getComputedStyle(document.getElementById('coin-box')).display === 'none' && document.getElementById('summary-final-score').innerText === t, { timeout: 8000 }, final).catch(() => {});
  check(!(await shown('#coin-box')) && (await score()) === final && (await page.evaluate(() => window.coins)) === 1, `then the points tick up into the total, with one short ka-ching (${await score()}; sounds: ${await page.evaluate(() => window.coins)})`);
  check((await money()) === [r.total + r.points, 0, r.total + r.points, 0].join(), 'a second tap did not add them twice');

  // tapping the character: a funny gag (English + Hebrew in the bubble, said aloud), one at a time, never the same twice in a row
  await page.waitForFunction(() => !summaryBusy, { timeout: 8000 });
  const gags = await page.evaluate(() => SUMMARY_GAGS.map(g => g.say));
  await page.evaluate(() => { window.spoken.length = 0; document.getElementById('avatar-fx').innerHTML = ''; });
  await page.click('#summary-avatar');
  const g1 = await page.$eval('#summary-say .ss-en', e => e.textContent.replace('🐶 ', ''));
  check(gags.includes(g1) && (await page.$eval('#summary-say', e => e.classList.contains('on') && e.querySelector('.ss-he').textContent.length > 0)), `tapping the dog does a funny gag, in English and Hebrew ("${g1}")`);
  check(await page.$eval('#summary-avatar', e => e.getAnimations().length > 0) && (await page.$$('#avatar-fx span')).length > 0, 'it moves and emojis burst out');
  await page.click('#summary-avatar');
  check((await page.$eval('#summary-say .ss-en', e => e.textContent.replace('🐶 ', ''))) === g1, 'a tap during the gag does nothing');
  await page.waitForFunction(() => !summaryBusy, { timeout: 8000 });
  check((await page.evaluate(() => window.spoken)).length === 1 && (await page.evaluate(() => window.spoken[0])).length > 0, 'the gag is said aloud once');
  await page.click('#summary-avatar');
  const g2 = await page.$eval('#summary-say .ss-en', e => e.textContent.replace('🐶 ', ''));
  check(gags.includes(g2) && g2 !== g1, `the next tap is a different gag ("${g2}")`);
  await page.waitForFunction(() => !summaryBusy, { timeout: 8000 });
  await page.waitForFunction(() => !document.getElementById('summary-say').classList.contains('on'), { timeout: 5000 }).catch(() => {});
  check(!(await page.$eval('#summary-say', e => e.classList.contains('on'))), 'the bubble closes a few seconds after the gag');

  // after a reload the result screen comes back with the final numbers and no new party
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => { window.coins = 0; window.coinSound = () => window.coins++; });
  await new Promise(res => setTimeout(res, 800));
  check((await score()) === final && !(await canvas('fireworks')) && (await page.evaluate(() => window.coins)) === 0, 'reopening on the result screen shows the final numbers, without celebrating again');
  await page.evaluate(() => { window.spoken = []; speechSynthesis.speak = u => { window.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 300); }; speechSynthesis.cancel = () => {}; window.coinSound = () => window.coins++; });
  await page.click('#summary-avatar');
  check(await page.$eval('#summary-say', e => e.classList.contains('on')), 'after reopening, the character still does its gags');
  await page.waitForFunction(() => !summaryBusy, { timeout: 8000 });

  // 2 of 10 wrong (80%): confetti and "Great job!"
  await clearFx();
  r = await play(2);
  check(await canvas('confetti') && !(await canvas('fireworks')), '80%: confetti (no fireworks)');
  check((await sayOn()).includes('Great job!') && !(await page.evaluate(() => window.spoken)).includes('Great job!'), 'the dog shows "Great job!" (not said aloud)');
  await page.waitForFunction(() => !summaryBusy, { timeout: 8000 }).catch(() => {});
  check(!(await page.$$eval('#avatar-fx span', s => s.map(x => x.textContent))).some(t => ['💃', '🕺'].includes(t)), '80%: no dance (only for all right)');

  // 5 of 10 wrong (50%): a small cheer and "Nice try! Keep going!"
  await clearFx();
  r = await play(5);
  check(!(await canvas('confetti')) && !(await canvas('fireworks')) && (await page.$$eval('#avatar-fx span', s => s.map(x => x.textContent))).includes('👏'), '50%: a small cheer of 👏💪⭐, no fireworks or confetti');
  check((await sayOn()).includes('Nice try! Keep going!') && !(await page.evaluate(() => window.spoken)).includes('Nice try! Keep going!'), 'the dog shows "Nice try! Keep going!" (not said aloud)');

  // the box is never lost: reopening the app on the result screen keeps it closed and waiting
  check(await shown('#coin-box') && (await money()) === [r.total, r.points, r.total, r.points].join(), 'a box not opened yet keeps its points waiting');
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => { window.coinSound = () => {}; });
  await new Promise(res => setTimeout(res, 500));
  check(await shown('#coin-box') && !(await page.$eval('#coin-box', e => e.disabled)) && (await money()) === [r.total, r.points, r.total, r.points].join(), 'after reopening the app the box is still there, closed');
  await page.click('#coin-box');
  check((await money()) === [r.total + r.points, 0, r.total + r.points, 0].join(), 'and opening it then collects the points');
  await page.evaluate(() => { window.spoken = []; speechSynthesis.speak = u => { window.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 300); }; speechSynthesis.cancel = () => {}; });
  // leaving the result screen without opening it: the points are added anyway
  r = await play(0);
  await page.evaluate(() => showStart());
  check((await money()) === [r.total + r.points, 0, r.total + r.points, 0].join() && (await page.$eval('#grand-total', e => e.textContent)).includes(String(r.total + r.points)), 'leaving without opening the box still adds its points');
  r = await play(0);
  await page.evaluate(() => restartGame());
  check((await money()) === [r.total + r.points, 0, r.total + r.points, 0].join(), 'so does "try again"');
  // closing the app on the result screen and opening it somewhere else: collected on start
  r = await play(0);
  await page.evaluate(() => saveSession('start'));
  await page.reload({ waitUntil: 'load' });
  await new Promise(res => setTimeout(res, 300));
  check((await money()) === [r.total + r.points, 0, r.total + r.points, 0].join(), 'reopening the app on another screen collects a closed box too');
  await page.evaluate(() => { window.spoken = []; speechSynthesis.speak = u => { window.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 300); }; speechSynthesis.cancel = () => {}; window.coinSound = () => window.coins++; });

  // leaving in the middle of the count stops it (the numbers are final when you come back)
  await clearFx();
  r = await play(0);
  await page.click('#coin-box');
  await new Promise(res => setTimeout(res, 1500));
  await page.evaluate(() => showStart());
  await new Promise(res => setTimeout(res, 900));
  check((await score()) === `נקודות בבוחן: ${r.points} · סה״כ: ${r.total + r.points}` && (await money()) === [r.total + r.points, 0, r.total + r.points, 0].join(), 'leaving during the count stops it at the final numbers');

  // a quiz with 0 points: no box, just the numbers
  r = await play(10);
  check(r.points === 0 && !(await shown('#coin-box')) && await shown('#summary-final-score'), 'a quiz with 0 points shows no box');

  // without a character: the party, but no character
  await page.evaluate(() => { shop.avatar = null; saveShop(); applyShop(); });
  await clearFx();
  await play(0);
  check(await canvas('fireworks') && (await page.$eval('#summary-avatar', e => e.textContent)) === '' && !(await sayOn()), 'without a character: fireworks, no character and nothing said');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

async function testFire() {
  console.log('\n[fire] 🔥 days in a row: every day a quiz is finished adds one; from 10 days all the points are doubled');
  const page = await openPage();
  await page.evaluate(() => {
    speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 50); speechSynthesis.cancel = () => {}; window.coinSound = () => {};
    document.getElementById('words-input').value = Array.from({ length: 6 }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n');
    renderWords();
  });
  // the day the app thinks it is: shift the clock by whole days
  const setDay = n => page.evaluate(n => { const R = window.__RealDate || (window.__RealDate = Date), off = n * 864e5;
    window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }; }, n);
  const finishQuiz = () => page.evaluate(() => {
    showStart(); startFromInput();
    while (currentIndex < wordsData.length) { const c = wordsData[currentIndex].correct; [...document.querySelectorAll('#answers-container button')].find(b => b.innerText === c).click(); clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion(); }
    return { points: totalScore, badges: [...document.querySelectorAll('#bonus-container .fire-badge')].map(b => b.innerText) };
  });
  const fire = () => page.evaluate(() => { showStart(); return document.getElementById('menu-fire').textContent; });
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('englishquiz-daily-streak')));

  check((await fire()) === '🔥 1' && (await page.evaluate(() => { openShop(); const t = document.getElementById('shop-fire').textContent; showStart(); return t; })) === '🔥 × 1', 'before playing the first day already shows 🔥 1 (main screen and shop)');
  let r = await finishQuiz();
  check(r.points === 6 && r.badges.length === 1 && r.badges[0].includes('יום ראשון') && (await fire()) === '🔥 1', `the first quiz of the day: 🔥 1 (${r.badges.join(' | ')})`);
  r = await finishQuiz();
  check(r.badges.length === 0 && (await fire()) === '🔥 1' && (await saved()).days === 1, 'another quiz the same day adds nothing');
  for (let d = 1; d <= 8; d++) { await setDay(d); r = await finishQuiz(); }
  const shopRow = () => page.evaluate(() => { openShop(); const o = { n: document.getElementById('shop-fire').textContent, info: document.getElementById('fire-info').textContent }; showStart(); return o; });
  let sr = await shopRow();
  check(sr.n === '🔥 × 9' && sr.info.includes('עוד 1 '), `the shop has a 🔥 row like the wands: 🔥 × 9, one more day to double points (${sr.info})`);
  check((await fire()) === '🔥 9' && r.points === 6, `9 days in a row: 🔥 9, points not doubled yet (${r.points})`);
  await setDay(9); r = await finishQuiz();
  check((await fire()) === '🔥 10 ×2' && r.points === 12 && r.badges.some(b => b.includes('כפולות')), `the 10th day: 🔥 10 ×2 and the quiz's points are doubled (6 → ${r.points}; ${r.badges.join(' | ')})`);
  await page.evaluate(() => openCoinBox()); await new Promise(res => setTimeout(res, 300));
  sr = await shopRow();
  check(sr.n === '🔥 × 10' && sr.info.includes('כפולות') && sr.info.includes('כפול!'), `from 10 days the shop row says the points are doubled and so is the shop box (${sr.info})`);
  // the shop's surprise box: everything in it is doubled
  await page.evaluate(() => { shop.boxes = 1; saveShop(); Math.random = () => 0.3; });
  const t0 = await page.evaluate(() => grandTotal);
  await page.evaluate(() => openBox());
  check((await page.evaluate(() => grandTotal)) - t0 === 100, '🔥 the shop box coins are doubled (50 → 100)');
  await page.waitForSelector('#box-reveal', { timeout: 3000 }).catch(() => {});
  const fr = await page.evaluate(() => { const p = document.getElementById('box-reveal'); return p && { big: p.querySelector('.br-big').textContent, fire: (p.querySelector('.br-fire') || {}).textContent }; });
  check(fr && fr.big === '+100 נקודות' && (fr.fire || '').includes('כפול'), `the box pop-up says it was doubled thanks to the days in a row (${fr && fr.big}, ${fr && fr.fire})`);
  await page.evaluate(() => document.getElementById('box-reveal')?.remove());
  const odds = await page.evaluate(() => { const out = { wand: 0, ice: 0, 50: 0, 100: 0, 200: 0 };
    for (let k = 0; k < 600; k++) { const r = k / 600; Math.random = () => r; shop.boxes = 1; const t = grandTotal, w = shop.wands || 0, i = shop.ice || 0; openBox();
      if ((shop.wands || 0) === w + 2) out.wand++; else if ((shop.ice || 0) === i + 2) out.ice++; else out[grandTotal - t] = (out[grandTotal - t] || 0) + 1; }
    shop.ice = 0; saveShop();   // (no ice left: the missed day below must break the 🔥 days)
    return out; });
  check(odds.wand === 0 && odds.ice === 120 && odds[50] === 0 && odds[100] === 240 && odds[200] === 240, `🔥 in a streak everything in the shop box is doubled: 20% 2 ice cubes, 40% 100, 40% 200, never 50, no wands (${JSON.stringify(odds)})`);
  // a missed day: back to 0 on the main screen, and the next quiz starts again from 1, points no longer doubled
  await setDay(11);
  check((await fire()) === '🔥 1', 'a day missed: back to 🔥 1');
  r = await finishQuiz();
  check((await fire()) === '🔥 1' && r.points === 6, `playing again starts from 🔥 1, no double points (${r.points})`);
  await page.reload({ waitUntil: 'load' });
  check((await saved()).days === 1, 'the days in a row are saved on the device');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

async function testName() {
  console.log('\n[name] the child types their name once; the greeting and the praise use it');
  const page = await openPage();
  const btn = () => page.$eval('#player-name', b => ({ text: b.textContent, empty: b.classList.contains('empty'), r: b.getBoundingClientRect().toJSON() }));
  let b = await btn();
  check(b.empty && b.text.includes('איך קוראים לך') && b.r.width > 0 && b.r.right <= 360, `no name yet: the main screen asks for it ("${b.text}")`);
  await page.click('#player-name');
  await page.waitForSelector('#name-dialog input', { timeout: 3000 });
  check(await page.evaluate(() => document.activeElement === document.querySelector('#name-dialog input')), 'tapping it opens a box with the cursor in the name field');
  await page.type('#name-dialog input', '  נועה  ');
  await page.click('#name-dialog [type=submit]');
  b = await btn();
  check(!(await page.$('#name-dialog')) && !b.empty && b.text === '👋 שלום, נועה!', `saved: the greeting says "${b.text}"`);
  await page.reload({ waitUntil: 'load' });
  b = await btn();
  check(b.text === '👋 שלום, נועה!' && (await page.evaluate(() => localStorage.getItem('englishquiz-player-name'))) === 'נועה', 'the name is still there after a reload (saved on the device)');
  // the praise uses it: the quiz result, the end of a learning part, the level pop-up
  const title = await page.evaluate(() => {
    document.getElementById('words-input').value = Array.from({ length: 4 }, (_, i) => `word${i + 1}\tמילה${i + 1}`).join('\n');
    renderWords(); startFromInput();
    while (currentIndex < wordsData.length) { const c = wordsData[currentIndex].correct; [...document.querySelectorAll('#answers-container button')].find(x => x.innerText === c).click(); clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion(); }
    return document.getElementById('summary-title').textContent;
  });
  check(title === 'וואו נועה! אתם פשוט אלופים!', `the quiz result says "${title}"`);
  await page.evaluate(() => { showStart(); showLevelBonus(3); });
  const lbTitle = await page.$eval('#level-bonus .lb-title', e => e.textContent);
  check(lbTitle === 'נועה, כל הנושאים ברמה 3 ירוקים!', `the level pop-up says "${lbTitle}"`);
  await page.evaluate(() => document.getElementById('level-bonus').remove());
  // the back button closes the box without saving; a name can be changed, and removed
  await page.click('#player-name');
  await page.waitForSelector('#name-dialog input', { timeout: 3000 });
  check((await page.$eval('#name-dialog input', i => i.value)) === 'נועה', 'opening it again shows the name to change');
  await page.evaluate(() => { document.querySelector('#name-dialog input').value = 'דני'; history.back(); });
  await page.waitForFunction(() => !document.getElementById('name-dialog'), { timeout: 3000 });
  check((await btn()).text === '👋 שלום, נועה!', 'the phone back button closes it without saving');
  await page.click('#player-name');
  await page.waitForSelector('#name-dialog input', { timeout: 3000 });
  await page.evaluate(() => { document.querySelector('#name-dialog input').value = ''; document.querySelector('#name-dialog [type=submit]').click(); });
  b = await btn();
  check(b.empty && (await page.evaluate(() => localStorage.getItem('englishquiz-player-name'))) === null && (await page.evaluate(() => praise('כל הכבוד'))) === 'כל הכבוד!', 'an empty name removes it (back to asking, praise without a name)');
  // only Hebrew or English letters (and spaces): anything else is not saved, and the box says so
  await page.click('#player-name');
  await page.waitForSelector('#name-dialog input', { timeout: 3000 });
  for (const bad of ['נועה😽', 'dan1', 'רון!', 'a.b', 'שיר_']) {
    await page.$eval('#name-dialog input', i => { i.value = ''; });
    await page.type('#name-dialog input', bad);
    const live = await page.$eval('#name-dialog [data-taken]', e => e.textContent);
    await page.click('#name-dialog [type=submit]');
    await new Promise(r => setTimeout(r, 200));
    const st = await page.evaluate(() => ({ open: !!document.getElementById('name-dialog'), msg: document.querySelector('#name-dialog [data-taken]')?.textContent, name: playerName }));
    check(live.includes('רק אותיות') && st.open && st.msg.includes('רק אותיות בעברית או באנגלית') && st.name === '', `"${bad}" is not allowed: the box says so while typing and stays open, nothing saved`);
  }
  await page.$eval('#name-dialog input', i => { i.value = ''; });
  await page.type('#name-dialog input', 'Noa כהן');
  check((await page.$eval('#name-dialog [data-taken]', e => e.textContent)) === '', 'fixing it clears the message');
  await page.click('#name-dialog [type=submit]');
  b = await btn();
  check(!(await page.$('#name-dialog')) && b.text === '👋 שלום, Noa כהן!', `Hebrew and English letters with a space are fine ("${b.text}")`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
  // the very first time the app is opened it suggests picking a name; it can be skipped, and isn't asked again
  const firstCtx = await browser.createBrowserContext(), first = await newTestPage(firstCtx, true);   // nothing saved at all
  await first.goto(url, { waitUntil: "load" });
  await first.waitForSelector('#name-dialog [data-first]', { timeout: 5000 }).catch(() => {});
  check(!!(await first.$('#name-dialog [data-first]')) && (await first.$eval('#name-dialog [data-first]', e => e.textContent)).includes('10 השחקנים המובילים'), 'first time the app is opened: a box suggests picking a name (for the top 10 list)');
  await first.click('#name-dialog [data-cancel]');
  await first.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 2000));
  check(!(await first.$('#name-dialog')), 'skipped: it is not asked again on the next opening');
  await first.close(); await firstCtx.close();
  // a player who already used the app (no name yet) is not asked by itself
  const old = await openPage();
  await new Promise(r => setTimeout(r, 2000));
  check(!(await old.$('#name-dialog')), 'someone who already used the app is not asked by itself');
  await old.close();
}

// 🏆 The top 10 players: a trophy button under the cart opens their page (the cloud is a stand-in: tests never reach Firebase)
async function testTop() {
  console.log('\n[top] the 🏆 button opens a page with the 10 players with the most points');
  const page = await openPage();
  const shown = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  await page.evaluate(() => { shop.owned.push('dog'); shop.avatar = 'dog'; applyShop(); });   // a character in the corner
  const r = await page.$eval('#top-btn', b => b.getBoundingClientRect().toJSON());
  const av = await page.$eval('#menu-avatar', b => b.getBoundingClientRect().toJSON());
  check(av.width > 0 && r.width > 0 && Math.abs(r.top - av.top) < 4 && r.right <= av.left + 1 && av.left - r.right < 2, 'the main screen has a 🏆 button in the top row, touching the character');
  // no cloud (no network): it says so
  await page.click('#top-btn');
  check((await shown('top-screen')) && !(await shown('start-screen')) && !(await page.$('[data-dialog]')), 'it opens a page of its own (not a pop-up), instead of the main screen');
  await page.waitForFunction(() => document.getElementById('top-msg')?.textContent.includes('אין חיבור'), { timeout: 3000 });
  check(true, 'without a network it says there is no connection');
  await page.click('#top-back');
  check((await shown('start-screen')) && !(await shown('top-screen')), 'the back button on the page goes back to the main screen');
  // with the cloud: 10 players, medals for the first 3, this player marked
  await page.evaluate(() => {
    setPlayerName('נועה');
    window.cloud = { sync() {}, claim: async () => 'ok', top: async () => Array.from({ length: 10 }, (_, i) => ({ name: i === 3 ? 'נועה' : `שחקן${i + 1}`, points: 1000 - i * 50, topics: 20 - i })) };
  });
  await page.click('#top-btn');
  await page.waitForSelector('#top-screen .top-list', { timeout: 3000 });
  const rows = await page.$$eval('#top-screen .top-list li', ls => ls.map(l => ({ text: l.textContent, me: l.classList.contains('me') })));
  check(rows.length === 10, `it lists 10 players (${rows.length})`);
  check(rows[0].text.includes('🥇') && rows[0].text.includes('שחקן1') && rows[0].text.includes('1000') && rows[2].text.includes('🥉') && rows[9].text.includes('10.'), 'in order: 🥇🥈🥉, then numbers, with the points');
  check(rows[0].text.includes('✅ 20') && rows[9].text.includes('✅ 11'), 'each line shows how many topics the player finished');
  check(await page.$eval('#menu-topics', e => e.textContent) === '', 'no green topics yet: the main screen shows no ✅ count');
  check(await page.evaluate(() => { const keep = learnProgress; learnProgress = { 1: [0, 2, 5], 3: 4 }; const n = topicsDone(); learnProgress = keep; return n; }) === 7, 'the count of finished topics adds up all the levels (old saves too)');
  check(rows[3].me && rows.filter(x => x.me).length === 1, "this player's own line is marked");
  check(await page.$eval('#top-tab-earned', b => b.getAttribute('aria-selected')) === 'true' && await page.$eval('#top-tab-topics', b => b.getAttribute('aria-selected')) === 'false', 'it opens on the points tab');
  check(await page.$eval('#top-screen .top-list li .t-pts', e => e.classList.contains('t-by')), 'on the points tab the points are the big number');
  // the categories tab: asks the cloud for the list by finished topics
  await page.evaluate(() => {
    window.cloud.top = async by => by === 'topics' ? [{ name: 'דני', points: 40, topics: 30, purple: 5, avatar: SHOP_AVATARS[0].id }, { name: 'נועה', points: 900, topics: 12, avatar: 'capybara' }] : [];
  });
  await page.click('#top-tab-topics');
  await page.waitForFunction(() => document.querySelectorAll('#top-screen .top-list li').length === 2, { timeout: 3000 });
  const trows = await page.$$eval('#top-screen .top-list li', ls => ls.map(l => ({ text: l.textContent, me: l.classList.contains('me'), big: l.querySelector('.t-by').textContent, av: l.querySelector('.t-av').textContent, img: !!l.querySelector('.t-av img') })));
  check(await page.$eval('#top-tab-topics', b => b.getAttribute('aria-selected')) === 'true' && trows[0].text.includes('דני') && trows[0].big === '✅ 30 💜 5' && trows[1].big === '✅ 12' && trows[1].me, `the categories tab lists the players by finished topics, with the purple ones when there are any (${trows.map(t => t.big).join(' / ')})`);
  check(trows[0].av === (await page.evaluate(() => SHOP_AVATARS[0].pic)) && trows[1].img, `each line shows the player's character (${trows[0].av}, a drawn one as a picture)`);
  check(rows.every(x => !x.text.includes('💜')), 'no purple topics: no 💜 on the line');
  await page.evaluate(() => {
    window.cloud.top = async () => Array.from({ length: 10 }, (_, i) => ({ name: i === 3 ? 'נועה' : `שחקן${i + 1}`, points: 1000 - i * 50, topics: 20 - i }));
  });
  await page.click('#top-tab-earned');
  await page.waitForFunction(() => document.querySelectorAll('#top-screen .top-list li').length === 10, { timeout: 3000 });
  check(true, 'back on the points tab, the points list again');
  // the page is kept when the app is opened again
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('top-screen')).display !== 'none', { timeout: 3000 });
  check(!(await shown('start-screen')), 'closing and opening the app comes back to this page');
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('start-screen')).display !== 'none', { timeout: 3000 });
  check(!(await shown('top-screen')), 'the phone back button goes back to the main screen');
  await page.evaluate(() => { window.cloud = { sync() {}, claim: async () => 'ok', top: async () => [] }; });
  await page.click('#top-btn');
  await page.waitForFunction(() => document.getElementById('top-msg')?.textContent.includes('עדיין אין'), { timeout: 3000 });
  check(true, 'an empty list says there are no players yet');
  // everyone / my friends: the same two tabs, on me and my friends
  check(await page.$eval('#top-scope-all', b => b.getAttribute('aria-checked')) === 'true', 'it opens on everyone');
  await page.click('#top-scope-friends');
  await page.waitForFunction(() => document.getElementById('top-msg')?.textContent.includes('עדיין אין חברים'), { timeout: 3000 });
  check(await page.$eval('#top-scope-friends', b => b.getAttribute('aria-checked')) === 'true', 'my friends, with no friends yet: it says to add some with 👫');
  await page.evaluate(() => {
    setPlayerName('נועה'); friends = ['דני', 'נגה']; saveFriends();
    window.asked = null;
    window.cloud = { sync() {}, claim: async () => 'ok', top: async () => [],
      friends: async names => { asked = names; return [{ name: 'דני', points: 50, topics: 30 }, { name: 'נגה', points: 900, topics: 2, avatar: 'dog' }, { name: 'נועה', points: 300, topics: 9 }]; } };
  });
  await page.click('#top-scope-friends');
  await page.waitForSelector('#top-screen .top-list li', { timeout: 3000 });
  let fr = await page.$$eval('#top-screen .top-list li', ls => ls.map(l => ({ name: l.querySelector('.t-name').textContent, me: l.classList.contains('me'), big: l.querySelector('.t-by').textContent })));
  check(JSON.stringify(await page.evaluate(() => asked)) === '["דני","נגה","נועה"]' && fr.map(x => x.name).join() === 'נגה,נועה,דני' && fr[1].me && fr[0].big === '⭐ 900',
    `my friends by points: my friends and me, in order, me marked (${fr.map(x => x.name + ' ' + x.big).join(' / ')})`);
  check((await page.$eval('#top-title', e => e.textContent)).includes('החברים שלי'), 'the title says it is me and my friends');
  await page.click('#top-tab-topics');
  await page.waitForFunction(() => document.querySelector('#top-screen .top-list li .t-name')?.textContent === 'דני', { timeout: 3000 });
  fr = await page.$$eval('#top-screen .top-list li', ls => ls.map(l => l.querySelector('.t-name').textContent + ' ' + l.querySelector('.t-by').textContent));
  check(fr.join() === 'דני ✅ 30,נועה ✅ 9,נגה ✅ 2' && await page.$eval('#top-scope-friends', b => b.getAttribute('aria-checked')) === 'true', `the topics tab keeps my friends, by topics (${fr.join(' / ')})`);
  await page.click('#top-scope-all');
  await page.waitForFunction(() => document.getElementById('top-msg')?.textContent.includes('עדיין אין'), { timeout: 3000 });
  check(await page.$eval('#top-tab-topics', b => b.getAttribute('aria-selected')) === 'true' && (await page.$eval('#top-title', e => e.textContent)).includes('10 השחקנים'), 'back to everyone keeps the topics tab');
  const [frB, allB] = await Promise.all(['#top-scope-friends', '#top-scope-all'].map(id => page.$eval(id, b => b.getBoundingClientRect().toJSON())));
  check(frB.left > allB.left, 'my friends comes first (on the right), then everyone');
  await page.click('#top-back');
  await page.click('#top-btn');
  await page.waitForSelector('#top-screen .top-list li', { timeout: 3000 });
  check(await page.$eval('#top-scope-friends', b => b.getAttribute('aria-checked')) === 'true', 'with friends, the 🏆 page opens on my friends');
  await page.evaluate(() => { localStorage.setItem('englishquiz-learn-progress', JSON.stringify({ 1: [0, 1, 2], 2: [4] })); });
  await page.reload({ waitUntil: 'load' });
  check(await page.$eval('#menu-topics', e => e.textContent) === '✅ 4', 'the main screen shows how many topics are green in all the levels (✅ 4)');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 📖 / 📝 The random-words and picture tabs: two buttons instead of "start game": learn the list's words, or the quiz
async function testListLearn() {
  console.log('\n[listlearn] random words and picture: a learn button and a quiz button');
  const page = await openPage();
  const shown = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  for (const m of ['random', 'picture']) {
    await page.evaluate(m => setMode(m), m);
    const b = await page.evaluate(() => {
      const l = document.getElementById('learn-list-btn'), q = document.getElementById('start-btn');
      return { learn: l.textContent, quiz: q.textContent, lv: getComputedStyle(l).display !== 'none' && l.getBoundingClientRect().width > 0, qv: getComputedStyle(q).display !== 'none' && q.getBoundingClientRect().width > 0,
        same: Math.abs(l.getBoundingClientRect().top - q.getBoundingClientRect().top) < 2, old: document.body.textContent.includes('התחל משחק') };
    });
    check(b.lv && b.qv && b.learn.includes('לימוד') && b.quiz.includes('בוחן') && b.same && !b.old, `${m}: "📖 לימוד" and "📝 בוחן" side by side, no "start game"`);
  }
  await page.evaluate(() => setMode('category'));
  check(!(await page.$eval('#learn-list-btn', e => e.getBoundingClientRect().width > 0)) && !(await page.$eval('#start-btn', e => e.getBoundingClientRect().width > 0)), 'the learning-path tab has neither (it has its own learn and quiz per topic)');
  await page.evaluate(() => { setMode('random'); document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב\ncat\tחתול\nsun\tשמש'; renderWords(); });
  // 📖 learn: the list's words as cards
  await page.click('#learn-list-btn');
  check((await shown('learn-screen')) && !(await shown('start-screen')), 'the learn button opens the word cards');
  const card = () => page.evaluate(() => ({ title: document.getElementById('learn-title').textContent, word: document.getElementById('learn-word').textContent, he: document.getElementById('learn-meaning').textContent, count: document.getElementById('learn-count').textContent, back: document.getElementById('learn-back').textContent }));
  let c = await card();
  check(c.word === 'apple' && c.he === 'תפוח' && c.count === '1/4' && c.title.includes('המילים שלי') && c.back.includes('חזרה') && !c.back.includes('מסלול'), `the first card: apple = תפוח, 1/4, "back" (not "path") (${JSON.stringify(c)})`);
  await page.click('#learn-next');
  c = await card();
  check(c.word === 'dog' && c.count === '2/4', 'next: dog, 2/4');
  // reopening the app comes back to the same card
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('learn-screen')).display !== 'none', { timeout: 3000 });
  c = await card();
  check(c.word === 'dog' && c.count === '2/4', `closing and opening the app comes back to the same card (${c.word} ${c.count})`);
  await page.click('#learn-next'); await page.click('#learn-next'); await page.click('#learn-next');
  check(await shown('learn-done-screen'), 'after the last card: the "well done" screen');
  const done = await page.evaluate(() => ({ text: document.getElementById('learn-done-text').textContent, back: document.getElementById('learn-done-back').textContent }));
  check(done.text.includes('4') && !done.back.includes('מסלול'), `it says the 4 words were learned, and its back button says "back" (${JSON.stringify(done)})`);
  // 📝 its quiz: the same 4 words
  await page.click('#learn-quiz-btn');
  await new Promise(r => setTimeout(r, 400));
  const q = await page.$eval('#question-word', e => e.innerText.trim());
  check((await shown('game-screen')) && ['apple', 'dog', 'cat', 'sun'].includes(q) && (await page.evaluate(() => wordsData.length)) === 4 && (await page.evaluate(() => stepQuiz)) === null, `then the quiz on the same 4 words ("${q}")`);
  await page.evaluate(() => showStart());
  // 📝 the quiz button: straight to the quiz
  await page.click('#start-btn');
  await new Promise(r => setTimeout(r, 400));
  check((await shown('game-screen')) && (await page.evaluate(() => wordsData.length)) === 4, 'the quiz button goes straight to the quiz');
  await page.evaluate(() => showStart());
  // a list that cannot be played (a word without its meaning): learning shows the same error as the quiz
  await page.evaluate(() => { document.getElementById('words-input').value = 'apple\tתפוח\ndog'; renderWords(); });
  await page.click('#learn-list-btn');
  check((await shown('start-screen')) && (await page.$eval('#start-error', e => e.textContent)).length > 0, 'a list that cannot be played: learning stays and shows the error');
  // the learning path still says "path"
  await page.evaluate(() => startLearning(1, 0));
  await page.waitForFunction(() => getComputedStyle(document.getElementById('learn-screen')).display !== 'none', { timeout: 5000 });
  check((await card()).back.includes('מסלול'), 'a learning-path topic still goes back to the path');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 🎮 Games: a button under the shop opens a page with 4 games on the chosen level's words; each pays ⭐ at its end
async function testGames() {
  console.log('\n[games] the 🎮 button: memory, spelling, listening, true or false');
  const page = await openPage();
  const shown = id => page.$eval('#' + id, e => getComputedStyle(e).display !== 'none');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const money = () => page.evaluate(() => [grandTotal, earnedTotal]);
  await wait(500);   // the screen comes in with a short animation (it scales the buttons)
  const r = await page.$eval('#games-btn', b => b.getBoundingClientRect().toJSON());
  const shopR = await page.$eval('#shop-btn', b => b.getBoundingClientRect().toJSON());
  check(r.width > 0 && Math.abs(r.top - shopR.top) < 4 && r.left >= shopR.right - 1 && r.left - shopR.right < 2, 'the main screen has a 🎮 button in the top row, touching the store');
  await page.evaluate(() => setMode('category'));   // from the learning tab: the level's words
  await page.click('#games-btn');
  check((await shown('games-screen')) && !(await shown('start-screen')), 'it opens the games page');
  const cards = await page.$$eval('#games-body .game-card', bs => bs.map(b => b.dataset.game));
  check(cards.join() === 'memory,spell,listen,truefalse,match,missing,picture,bubbles', `8 games: ${cards.join(', ')}`);
  check((await page.$eval('#games-body', e => e.textContent)).includes('רמה 1'), 'it says which level the words come from');
  const play = async id => { await page.click(`.game-card[data-game="${id}"]`); await page.waitForFunction(id => curGame === id && !document.querySelector('#games-body').textContent.includes('טוען'), { timeout: 5000 }, id); };

  // 🃏 memory: 12 cards, each word twice (one card English, one its meaning); a wrong pair closes again, the right pairs stay open
  let [t0, e0] = await money();
  await play('memory');
  const ks = await page.$$eval('.mem-card', bs => bs.map(b => b.dataset.k));
  check(ks.length === 12 && new Set(ks).size === 6 && (await page.$$eval('.mem-card', bs => bs.every(b => b.textContent === '❓'))), '12 cards face down, 6 pairs');
  const idx = k => ks.map((x, i) => x === k ? i : -1).filter(i => i >= 0);
  const [a0] = idx('0'), [b0] = idx('1');
  await page.evaluate((a, b) => { const c = document.querySelectorAll('.mem-card'); c[a].click(); c[b].click(); }, a0, b0);
  const opened = await page.$$eval('.mem-card.open', bs => bs.map(b => ({ en: b.querySelector('.mem-en')?.textContent, he: b.querySelector('.mem-he')?.textContent })));
  check(opened.length === 2 && opened.every(o => !!o.en !== !!o.he && (o.en ? /[a-z]/i.test(o.en) : /[֐-׿]/.test(o.he))), `an open card shows either the English word or its meaning (${JSON.stringify(opened)})`);
  check((await page.$$eval('.mem-list .mem-pair', rs => rs.length)) === 6, 'the 6 words and their meanings are listed above the cards');
  await wait(1100);
  check(await page.$$eval('.mem-card', bs => bs.every(b => !b.classList.contains('open'))), 'two cards that do not belong together turn back');
  for (let k = 0; k < 6; k++) { const [x, y] = idx(String(k)); await page.evaluate((x, y) => { const c = document.querySelectorAll('.mem-card'); c[x].click(); c[y].click(); }, x, y); }
  check(await page.$$eval('.mem-card', bs => bs.every(b => b.classList.contains('done'))), 'matching pairs stay open (green)');
  await page.waitForSelector('.game-end', { timeout: 3000 });
  let [t1, e1] = await money();
  check(t1 === t0 + 6 && e1 === e0 + 6 && (await page.$eval('.g-end-points', e => e.textContent)) === '+6 ⭐', `all pairs found in 7 tries: +6 ⭐ (in the total and the earned points) (${t0} -> ${t1})`);

  // 🔤 spelling: 5 words; a wrong letter shakes and is not placed; a word with no mistakes is 2 ⭐, with one 1 ⭐
  await page.click('#game-again');   // "again" = the same game; go to the list and take the next one
  await page.click('#games-back');
  check(await page.$('#games-body .game-card'), 'the back button in a game goes back to the list of games');
  [t0, e0] = await money();
  await play('spell');
  for (let n = 0; n < 5; n++) {
    await page.waitForSelector('.spell-box', { timeout: 3000 });
    const word = await page.$eval('.spell-box', e => e.dataset.word);
    if (n === 0) {   // one wrong letter first
      const wrong = await page.evaluate(w => { const t = [...document.querySelectorAll('.spell-tile')].find(b => b.textContent !== w[0]); if (t) t.click(); return !!t; }, word);
      if (wrong) check((await page.$$eval('.spell-slot', s => s[0].textContent)) === '', 'a wrong letter is not placed');
    }
    await page.evaluate(w => { for (const ch of w) [...document.querySelectorAll('.spell-tile')].find(b => !b.disabled && b.textContent === ch).click(); }, word);
    if (n === 0) check((await page.$$eval('.spell-slot', s => s.map(x => x.textContent).join(''))) === word, `the letters spell "${word}"`);
    await wait(1100);
  }
  await page.waitForSelector('.game-end', { timeout: 3000 });
  [t1, e1] = await money();
  check(t1 === t0 + 5 && e1 === e0 + 5, `5 words, one with a mistake: +5 ⭐ (${t1 - t0})`);

  // 👂 listening: 8 words; a wrong pick turns red, the right one green; only first tries count
  await page.click('#game-menu');
  [t0] = await money();
  await play('listen');
  for (let n = 0; n < 8; n++) {
    await page.waitForSelector('.listen-box', { timeout: 3000 });
    const word = await page.$eval('.listen-box', e => e.dataset.word);
    if (n === 0) {
      await page.evaluate(w => [...document.querySelectorAll('.listen-answers button')].find(b => b.textContent !== w).click(), word);
      check((await page.$$eval('.listen-answers .wrong', b => b.length)) === 1, 'a wrong word turns red');
    }
    await page.evaluate(w => [...document.querySelectorAll('.listen-answers button')].find(b => b.textContent === w).click(), word);
    await wait(900);
  }
  await page.waitForSelector('.game-end', { timeout: 3000 });
  [t1] = await money();
  check(t1 === t0 + 5, `8 words, the first after a mistake: +5 ⭐ (${t1 - t0})`);

  // ⚡ true or false: 10 words, no timer; the 🔊 above the word says it
  await page.click('#game-menu');
  [t0] = await money();
  await play('truefalse');
  check(!(await page.$('.tf-time')) && (await page.$eval('.tf-count', e => e.textContent)) === '1/10', 'no timer: it counts the words (1/10)');
  const pos = await page.evaluate(() => ({ say: document.getElementById('tf-speak').getBoundingClientRect().bottom, word: document.querySelector('.tf-word').getBoundingClientRect().top }));
  check(pos.say <= pos.word + 1, 'the 🔊 button is above the English word');
  await page.evaluate(() => { window.__said = []; const orig = speakText; speakText = w => { window.__said.push(w); orig(w); }; });
  const tfWord = await page.$eval('.tf-word', e => e.textContent);
  await page.click('#tf-speak');
  check((await page.evaluate(() => window.__said)).join() === tfWord, `the 🔊 button says the word (${tfWord})`);
  for (let n = 0; n < 9; n++) await page.evaluate(() => document.querySelector(document.querySelector('.tf-box').dataset.ok === '1' ? '.tf-yes' : '.tf-no').click());
  check((await page.$eval('.tf-score', e => e.textContent)) === '✔ 9' && (await page.$eval('.tf-count', e => e.textContent)) === '10/10', '9 right answers: ✔ 9, on the 10th word');
  await page.evaluate(() => document.querySelector(document.querySelector('.tf-box').dataset.ok === '1' ? '.tf-no' : '.tf-yes').click());   // the last one wrong
  await page.waitForSelector('.game-end', { timeout: 3000 });
  [t1] = await money();
  check(t1 === t0 + 3 && (await page.$eval('.g-end-text', e => e.textContent)).includes('9 מתוך 10'), `after 10 words it ends: 9/10 right = +3 ⭐ (true or false gives 1-3) (${t1 - t0})`);
  // the range: a very good game 6 ⭐, a very bad one 1 ⭐, in between by how good
  check(await page.evaluate(() => [gameStars(1), gameStars(0), gameStars(0.5), gameStars(-1), gameStars(2), gameStars(1, TF_MAX), gameStars(0, TF_MAX), gameStars(0.5, TF_MAX)].join()) === '6,1,4,1,6,3,1,2', 'games give 6 ⭐ for a very good game, 1 ⭐ for a very bad one, the rest in between');
  // 🎁 every 10 games with 4 ⭐ or more: +10 bonus coins. So far: memory 6, spell 5, listen 5, true/false 6 = 4 good games
  check((await page.evaluate(() => goodGames)) === 4 && (await page.$eval('.game-end .g-good', e => e.textContent)).includes('4/10'), 'games with 4 ⭐ or more count toward the bonus, true or false at its 3 ⭐ too (4/10)');
  await page.evaluate(() => { goodGames = 9; });
  [t0] = await money();
  await page.click('#game-menu');
  check(!(await page.$('#games-body .g-good')), 'the games page has no bonus line');
  await play('memory');
  await page.evaluate(() => gameOver(gameToken, GAMES[0], 6, 'test'));   // a 6 ⭐ game
  await page.waitForSelector('.game-end', { timeout: 3000 });
  [t1] = await money();
  check(t1 === t0 + 16 && (await page.$eval('.g-end-bonus', e => e.textContent)).includes('+10') && (await page.$eval('.g-end-points', e => e.textContent)) === '+6 ⭐', `the 10th good game: +6 ⭐ and a 🎁 +10 bonus (${t1 - t0})`);
  check((await page.evaluate(() => localStorage.getItem('englishquiz-good-games'))) === '10', 'the count is saved on the device');
  await page.evaluate(() => { goodGames = 0; });
  await page.click('#game-menu');
  [t0] = await money();
  await play('truefalse');
  for (let n = 0; n < 10; n++) await page.evaluate(() => document.querySelector(document.querySelector('.tf-box').dataset.ok === '1' ? '.tf-no' : '.tf-yes').click());
  await page.waitForSelector('.game-end', { timeout: 3000 });
  [t1] = await money();
  check(t1 === t0 + 1 && (await page.evaluate(() => goodGames)) === 0 && !(await page.$('.g-end-bonus')), `a very bad game: +1 ⭐ and does not count (${t1 - t0})`);
  check(!(await page.$('.g-end-av')) && !(await page.$('.g-end-say')), 'not every answer right: no dance');
  // 💃 every answer right on the first try: the character dances on the end screen
  await page.evaluate(() => { if (!shop.owned.includes('dog')) shop.owned.push('dog'); shop.avatar = 'dog'; saveShop(); applyShop(); document.getElementById('avatar-fx').innerHTML = ''; });
  await page.click('#game-menu');
  await play('truefalse');
  for (let n = 0; n < 10; n++) await page.evaluate(() => document.querySelector(document.querySelector('.tf-box').dataset.ok === '1' ? '.tf-yes' : '.tf-no').click());
  await page.waitForSelector('.game-end .g-end-av', { timeout: 3000 }).catch(() => {});
  await wait(700);
  check((await page.$eval('.g-end-av', e => e.textContent).catch(() => '')) === '🐶' && await page.$eval('.g-end-av', e => e.getAnimations().length > 0).catch(() => false)
        && (await page.$eval('.g-end-say', e => e.textContent).catch(() => '')).includes('Perfect! Dance party!מושלם! מסיבת ריקודים!')
        && (await page.$$eval('#avatar-fx span', s => s.map(x => x.textContent))).some(x => ['💃', '🕺', '🎵', '🎶'].includes(x)), 'every answer right: the dog dances next to the 🎉 ("Perfect! Dance party!")');
  await page.evaluate(() => { shop.avatar = null; saveShop(); applyShop(); goodGames = 0; });

  // leaving: the phone back button from a game goes to the list; a left game stops (its timer gives nothing)
  await page.click('#game-menu');
  await play('truefalse');
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => !curGame && document.querySelector('#games-body .game-card'), { timeout: 3000 });
  check(await shown('games-screen'), 'the phone back button in a game goes back to the list of games');
  [t0] = await money();
  await wait(1200);
  check((await money())[0] === t0 && !(await page.$('.game-end')), 'a game that was left stops (no end screen, no points)');
  // from the random words / picture tabs: the words of their list
  await page.evaluate(() => { showStart(); setMode('random'); document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב\ncat\tחתול\nsun\tשמש\nbook (n)\tספר'; renderWords(); });
  await page.click('#games-btn');
  const note = await page.$eval('#games-body .games-note', e => e.textContent);
  check(note.includes('אקראי') && note.includes('5 מילים'), `from the random tab: its list's words (${note})`);
  await play('memory');
  const memWords = await page.evaluate(async () => { const c = [...document.querySelectorAll('.mem-card')]; return c.length; });
  check(memWords === 10, `memory on a list of 5 words: 5 pairs (${memWords} cards)`);
  await page.click('#games-back');
  await play('listen');
  const lw = new Set();
  for (let n = 0; n < 5; n++) {
    await page.waitForSelector('.listen-box', { timeout: 3000 });
    const word = await page.$eval('.listen-box', e => e.dataset.word);
    lw.add(word);
    await page.evaluate(w => [...document.querySelectorAll('.listen-answers button')].find(b => b.textContent === w).click(), word);
    await wait(900);
  }
  check([...lw].every(w => ['apple', 'dog', 'cat', 'sun', 'book'].includes(w)) && lw.size === 5, `listening uses only the list's words (${[...lw].join(', ')})`);
  await page.waitForSelector('.game-end', { timeout: 3000 });
  await page.evaluate(() => { showStart(); setMode('picture'); document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב'; renderWords(); });
  await page.click('#games-btn');
  check((await page.$eval('#games-body .games-note', e => e.textContent)).includes('מתמונה'), 'from the picture tab: its own list');
  await play('listen');
  check((await page.$eval('#game-few', e => e.textContent)).includes('4'), 'a list too short for a game (listening needs 4 words) says so');
  await page.evaluate(() => { showStart(); setMode('category'); });
  await page.click('#games-btn');
  // reopening the app comes back to the games page; back from the list goes to the main screen
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('games-screen')).display !== 'none', { timeout: 3000 });
  check(true, 'closing and opening the app comes back to the games page');
  await page.click('#games-back');
  check((await shown('start-screen')) && !(await shown('games-screen')), 'back from the list of games goes to the main screen');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// level 1 keeps only the colors; the shapes are the last topic of level 2. Old green marks of level 1 move with their topics.
async function testShapes() {
  console.log('\n[shapes] colors in level 1, shapes at the end of level 2; old progress moves');
  const page = await openPage();
  const info = await page.evaluate(async () => {
    const s1 = learnSteps(await loadLevel(1)), s2 = learnSteps(await loadLevel(2));
    return { l1: s1.map(s => s.name), colors: s1[4], days: s1[3], l2: s2.flatMap(s => s.words.map(w => w.en)), last2: s2[s2.length - 1] };
  });
  check(info.colors.name === 'צבעים' && info.colors.parts === 1 && info.colors.words.length === 14 && info.colors.words.every(w => !['circle', 'square', 'triangle', 'star', 'heart', 'line'].includes(w.en)), `level 1 step 4 is only the colors (${info.colors.words.length} words)`);
  check(info.days.name === 'ימות השבוע' && info.days.words.map(w => w.en).join() === 'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday' && !info.l2.includes('Sunday'), 'the days of the week are level 1 step 4 (after the numbers), not in level 2');
  check(!info.l1.some(n => n.includes('צורות')), 'level 1 has no shapes topic');
  check(info.last2.name === 'צורות' && info.last2.words.map(w => w.en).join() === 'circle,square,triangle,star,heart,line', 'the shapes are the last topic of level 2');
  // an old save: level 1 parts 0,1,2 green, colors+shapes part 2 (index 4) green, 5 and 7 green; a level-1 quiz open at index 5
  await page.evaluate(() => {
    localStorage.removeItem('englishquiz-shapes-moved');
    localStorage.setItem('englishquiz-learn-progress', JSON.stringify({ 1: [0, 1, 2, 4, 5, 7], 2: [0, 3] }));
    localStorage.setItem('englishquiz-session', JSON.stringify({ screen: 'learn', learn: { level: 1, index: 5, i: 2 } }));
  });
  await page.reload({ waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 800));
  const after = await page.evaluate(() => ({ p: learnProgress, flag: localStorage.getItem('englishquiz-shapes-moved'), learnShown: getComputedStyle(document.getElementById('learn-screen')).display !== 'none' }));
  check(JSON.stringify(after.p[1]) === '[0,1,2,3,4,6]' && JSON.stringify(after.p[2]) === '[0,3]', `level 1 green marks move with their topics (${JSON.stringify(after.p)})`);
  check(after.flag === '1' && !after.learnShown, 'a level-1 topic open past the colors starts again from the main screen');
  // it happens once: a later reload keeps the marks
  await page.reload({ waitUntil: 'load' });
  check(JSON.stringify(await page.evaluate(() => learnProgress[1])) === '[0,1,2,3,4,6]', 'the move happens only once');
  // the days of the week moved into level 1 as step 3: level 1's green marks from step 3 on move forward by one
  const daysMove = async (flags, progress) => {
    await page.evaluate((flags, progress) => {
      for (const k of flags) localStorage.removeItem(k);
      localStorage.setItem('englishquiz-learn-progress', JSON.stringify(progress));
      localStorage.setItem('englishquiz-session', JSON.stringify({ screen: 'learn', learn: { level: 1, index: 3, i: 0 } }));
    }, flags, progress);
    await page.reload({ waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 600));
    return page.evaluate(() => ({ p: learnProgress, flag: localStorage.getItem('englishquiz-days-moved'), learnShown: getComputedStyle(document.getElementById('learn-screen')).display !== 'none' }));
  };
  // a player who already had the colors move: greetings, numbers 1-2, colors 3, family 4... -> colors 4, family 5...
  let dm = await daysMove(['englishquiz-days-moved'], { 1: [0, 1, 2, 3, 4, 6], 2: [0, 1] });
  check(JSON.stringify(dm.p[1]) === '[0,1,2,4,5,7]' && JSON.stringify(dm.p[2]) === '[0,1]' && dm.flag === '1' && !dm.learnShown, `days move: level 1 marks from step 3 on move forward (${JSON.stringify(dm.p[1])}), level 2 stays, an open level-1 topic starts again`);
  // an older player: both moves at once (colors+shapes 3-4 -> colors 3 -> colors 4)
  dm = await daysMove(['englishquiz-days-moved', 'englishquiz-shapes-moved'], { 1: [0, 1, 2, 4, 5, 7] });
  check(JSON.stringify(dm.p[1]) === '[0,1,2,4,5,7]', `both moves at once keep every mark on its topic (${JSON.stringify(dm.p[1])})`);
  const names = await page.evaluate(async () => { const st = learnSteps(await loadLevel(1)); return [4, 5, 7].map(i => st[i].name + (st[i].part ? ' ' + st[i].part : '')); });
  check(names.join() === 'צבעים,משפחה ואנשים 1,הגוף 1', `the marks are on colors, family 1 and body 1 as before (${names.join(', ')})`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 🧊 ice cubes (from the shop box): a day with no quiz uses one instead of losing the 🔥 days
async function testIce() {
  console.log('\n[ice] a missed day uses a 🧊 and keeps the 🔥 days');
  const page = await openPage();
  const daysAgo = n => page.evaluate(n => { const d = new Date(); d.setDate(d.getDate() - n); return dayStr(d); }, n);
  const setup = async (ice, last, days) => {
    await page.evaluate((ice, last, days) => {
      const sh = JSON.parse(localStorage.getItem(SHOP_KEY) || '{}'); sh.ice = ice; localStorage.setItem(SHOP_KEY, JSON.stringify(sh));
      localStorage.setItem(DAILY_KEY, JSON.stringify({ last, days }));
    }, ice, last, days);
    await page.reload({ waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 500));
    return page.evaluate(() => ({ ice: shop.ice, saved: JSON.parse(localStorage.getItem(SHOP_KEY)).ice, daily, fire: document.getElementById('menu-fire').textContent,
      menuIce: document.getElementById('menu-ice').textContent, toast: document.getElementById('box-toast').textContent }));
  };
  // no ice: nothing shows on the main screen
  let r = await setup(0, await daysAgo(1), 4);
  check(r.menuIce === '' && r.fire === '🔥 4', `no 🧊: none shown, 🔥 4 (${r.fire})`);
  // one day missed (last quiz 2 days ago) with 2 ice cubes: one is used, the 🔥 days stay
  r = await setup(2, await daysAgo(2), 5);
  check(r.ice === 1 && r.saved === 1 && r.daily.last === (await daysAgo(1)) && r.daily.days === 5, `one missed day uses one 🧊 (2 -> ${r.ice}), the 🔥 days stay (${r.daily.days})`);
  check(r.fire === '🔥 5' && r.menuIce === '🧊 1' && r.toast.includes('🧊'), `the main screen: ${r.fire} ${r.menuIce}, and a note says the ice was used`);
  // the next quiz today adds a day
  const added = await page.evaluate(() => { countDailyPlay(); return daily.days; });
  check(added === 6, `a quiz today goes on: 🔥 6 (${added})`);
  // two days missed with 2 ice cubes: both are used
  r = await setup(2, await daysAgo(3), 7);
  check(r.ice === 0 && r.fire === '🔥 7' && r.menuIce === '', `two missed days use two 🧊 (left ${r.ice}), 🔥 7 stays`);
  // three days missed with only 1 ice cube: the 🔥 days start again and the ice is kept
  r = await setup(1, await daysAgo(4), 8);
  check(r.ice === 1 && r.fire === '🔥 1', `not enough 🧊 for the missed days: 🔥 starts again (${r.fire}), the 🧊 is kept (${r.ice})`);
  // played yesterday or today: no ice used
  r = await setup(1, await daysAgo(1), 3);
  check(r.ice === 1 && r.fire === '🔥 3', 'no day missed: no 🧊 used');
  // the shop shows them, and the box can give one
  await page.evaluate(() => { Math.random = () => 0.95; shop.boxes = 1; saveShop(); openShop(); });
  check((await page.$eval('#shop-ice', e => e.textContent)) === '🧊 × 1', 'the shop shows the ice cubes (🧊 × 1)');
  await page.click('#box-open');
  await page.waitForSelector('#box-reveal', { timeout: 3000 });
  const rv = await page.evaluate(() => ({ cls: document.getElementById('box-reveal').className, big: document.querySelector('#box-reveal .br-big').textContent, ice: shop.ice, shopIce: document.getElementById('shop-ice').textContent }));
  check(rv.cls === 'ice' && rv.big === 'קוביית קרח!' && rv.ice === 2 && rv.shopIce === '🧊 × 2', `the box can give an ice cube: "${rv.big}" (now ${rv.ice})`);
  const chance = await page.$eval('#box-reveal .br-chance', e => e.textContent);
  check(chance.includes('20%'), `the pop-up says how likely it was (${chance})`);
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 🎮 the 4 newer games: matching, missing letter, picture, bubbles
async function testGames2() {
  console.log('\n[games2] matching, missing letter, picture, bubbles');
  const page = await openPage();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const money = () => page.evaluate(() => grandTotal);
  await page.setViewport({ width: 360, height: 640 });
  await page.evaluate(() => setMode('category'));
  await page.click('#games-btn');
  const cards = await page.$$eval('#games-body .game-card', bs => bs.map(b => b.dataset.game));
  check(cards.join() === 'memory,spell,listen,truefalse,match,missing,picture,bubbles', `8 games: ${cards.join(', ')}`);
  const fit = await page.evaluate(() => { const b = document.getElementById('games-body'); return { over: b.scrollHeight - b.clientHeight, page: document.documentElement.scrollWidth - innerWidth }; });
  check(fit.over <= 0 && fit.page <= 0, `360x640: all 8 games fit with no scrolling (${fit.over}px)`);
  const play = async id => { await page.click(`.game-card[data-game="${id}"]`); await page.waitForFunction(id => curGame === id && !document.querySelector('#games-body').textContent.includes('טוען'), { timeout: 5000 }, id); };
  const end = async () => { await page.waitForSelector('.game-end', { timeout: 4000 }); };

  // 🔗 matching: 2 boards of 5; one wrong pair, then all right
  let t0 = await money();
  await play('match');
  const pairs = async () => page.$$eval('.match-cell', cs => cs.filter(c => !c.disabled).length / 2);
  check((await pairs()) === 5, 'matching: a board of 5 words and 5 meanings');
  await page.evaluate(() => { const en = document.querySelector('.match-cell[data-side="en"][data-k="0"]'), he = document.querySelector('.match-cell[data-side="he"][data-k="1"]'); en.click(); he.click(); });
  check(await page.$$eval('.match-cell.done', c => c.length) === 0, 'a word and a wrong meaning do not connect');
  for (let board = 0; board < 2; board++) {
    await page.waitForFunction(() => document.querySelectorAll('.match-cell:not(.done)').length === 10, { timeout: 3000 });
    await page.evaluate(() => { for (let k = 0; k < 5; k++) { document.querySelector(`.match-cell[data-side="en"][data-k="${k}"]`).click(); document.querySelector(`.match-cell[data-side="he"][data-k="${k}"]`).click(); } });
    if (board === 0) check(await page.$$eval('.match-cell.done', c => c.length) === 10, 'a word and its meaning connect (green)');
  }
  await end();
  let t1 = await money();
  check(t1 - t0 === 6, `10 pairs with 1 mistake: +6 ⭐ (${t1 - t0})`);

  // 🧩 missing letter: 8 words; the first one wrong first
  await page.click('#game-menu');
  t0 = await money();
  await page.evaluate(() => { window.__said = []; const orig = speakText; speakText = w => { window.__said.push(w); orig(w); }; });
  await play('missing');
  check((await page.evaluate(() => window.__said)).join() === (await page.$eval('.missing-box', e => e.dataset.word)), 'the English word is said at the start of the round (before answering)');
  for (let n = 0; n < 8; n++) {
    await page.waitForFunction(n => document.querySelector('.missing-box .g-progress')?.textContent === `${n + 1}/8`, { timeout: 3000 }, n);
    const [word, letter] = await page.$eval('.missing-box', e => [e.dataset.word, e.dataset.letter]);
    if (n === 0) {
      check((await page.$eval('.missing-word', e => e.textContent)).includes('_') && (await page.$$eval('.missing-answers button', b => b.length)) === 4, `a word with a missing letter and 4 letters to pick (${word})`);
      await page.evaluate(l => [...document.querySelectorAll('.missing-answers button')].find(b => b.textContent !== l).click(), letter);
    }
    await page.evaluate(l => [...document.querySelectorAll('.missing-answers button')].find(b => b.textContent === l).click(), letter);
    if (n === 0) check((await page.$eval('.missing-word', e => e.textContent)) === word, 'the right letter completes the word');
  }
  await end();
  t1 = await money();
  check(t1 - t0 === 5, `8 words, the first after a mistake: +5 ⭐ (${t1 - t0})`);

  // 🖼️ picture: 8 pictures, all right
  await page.click('#game-menu');
  t0 = await money();
  await play('picture');
  for (let n = 0; n < 8; n++) {
    await page.waitForFunction(n => document.querySelector('.pic-box .g-progress')?.textContent === `${n + 1}/8`, { timeout: 3000 }, n);
    const word = await page.$eval('.pic-box', e => e.dataset.word);
    if (n === 0) check((await page.$eval('.pic-big', e => e.textContent)).length > 0 && (await page.$$eval('.pic-box .btn-answer', b => b.length)) === 4, `a picture and 4 words (${word})`);
    await page.evaluate(w => [...document.querySelectorAll('.pic-box .btn-answer')].find(b => b.textContent === w).click(), word);
  }
  await end();
  t1 = await money();
  check(t1 - t0 === 2, `8 pictures all right: +2 ⭐ (picture gives 1-2) (${t1 - t0})`);

  // 🫧 bubbles: 10 rounds, 5 bubbles; two wrong first tries
  await page.click('#game-menu');
  t0 = await money();
  await play('bubbles');
  for (let n = 0; n < 10; n++) {
    await page.waitForFunction(n => document.querySelector('.bub-box .g-progress')?.textContent === `${n + 1}/10`, { timeout: 3000 }, n);
    const word = await page.$eval('.bub-box', e => e.dataset.word);
    if (n === 0) check((await page.$$eval('.bubble', b => b.length)) === 5, '5 bubbles with English words');
    if (n < 2) {
      await page.evaluate(w => [...document.querySelectorAll('.bubble')].find(b => b.textContent !== w).click(), word);
      if (n === 0) check((await page.$$eval('.bubble.popped', b => b.length)) === 1, 'a wrong bubble pops away');
    }
    await page.evaluate(w => [...document.querySelectorAll('.bubble')].find(b => b.textContent === w).click(), word);
  }
  await end();
  t1 = await money();
  check(t1 - t0 === 2, `10 bubbles, 2 after a mistake: +2 ⭐ (bubbles gives 1-2) (${t1 - t0})`);

  // a list with no pictures: the picture game says what it needs
  await page.evaluate(() => { showStart(); setMode('random'); document.getElementById('words-input').value = 'apple\tתפוח\ndog\tכלב\ncat\tחתול\nsun\tשמש'; renderWords(); });
  await page.click('#games-btn');
  await play('picture');
  check((await page.$eval('#game-few', e => e.textContent)).includes('תמונה'), 'on a list with no pictures the picture game says it needs words with pictures');
  await page.click('#games-back');
  await play('match');
  check(await page.$$eval('.match-cell', c => c.length) === 8, 'matching on a list of 4 words: one board of 4 pairs');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

// 💜 a green topic passed again turns purple; after the first level box is won, a second box opens when all topics are purple (90 right)
async function testPurple() {
  console.log('\n[purple] topics passed twice turn purple; the second level box needs all purple and 90 right');
  const page = await openPage();
  check(await page.evaluate(() => document.documentElement.getAttribute('translate') === 'no' && document.querySelector('meta[name="google"]')?.content === 'notranslate'), 'the page asks browsers not to translate it (the Hebrew must stay Hebrew)');
  await page.evaluate(() => { speechSynthesis.speak = u => setTimeout(() => u.onend && u.onend(), 20); window.coinSound = () => {}; playUnlockSound = () => {}; });
  const play = n => page.evaluate(n => { for (let k = 0; currentIndex < wordsData.length; k++) { const c = wordsData[currentIndex].correct, bs = [...document.querySelectorAll('#answers-container .btn-answer')];
    if (k >= n) bs.find(x => x.innerText !== c).click(); bs.find(x => x.innerText === c).click(); clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion(); } }, n);
  const res = () => page.$eval('#step-result', e => e.textContent);
  const cards = async () => { await page.evaluate(() => { showStart(); setMode('category'); document.getElementById('cat-level-select').value = '3'; }); await page.evaluate(() => renderPath());
    return page.$$eval('#cat-list .cat-prize', bs => bs.map(b => b.className)); };
  const n = await page.evaluate(async () => { document.getElementById('cat-level-select').value = '3'; const st = learnSteps(await loadLevel(3)); learnProgress[3] = [1]; localStorage.setItem(LEARN_KEY, JSON.stringify(learnProgress)); return st.length; });
  await page.evaluate(() => quizStep(3, 0)); await play(999);
  check(!(await page.evaluate(() => purpleSet(3).has(0))), 'a topic passed the first time is green, not purple');
  await page.evaluate(() => quizStep(3, 1)); await play(999);
  check((await page.evaluate(() => [...purpleSet(3)].join())) === '1' && (await res()).includes('סגול'), `passing a green topic again turns it purple ("${await res()}")`);
  await page.evaluate(() => quizStep(3, 2)); await play(0);
  check(!(await page.evaluate(() => purpleSet(3).has(2))), 'a quiz with mistakes turns nothing purple');
  let c = await cards();
  const row = await page.$eval('#cat-list .cat-row:nth-child(2) .cat-step', e => ({ cls: e.className, state: e.querySelector('.cat-state').textContent }));
  check(row.cls.includes('purple') && row.state === '💜' && (await page.$eval('#path-progress', e => e.textContent)).includes('💜 1/'), `the path shows it purple with 💜 (${row.cls})`);
  check(c.length === 2 && c[1].includes('locked') && c[1].includes('tier2'), `the second box is always there, locked before the first box is won (${c.join(' / ')})`);
  await page.evaluate(n => { learnPurple[3] = Array.from({ length: n }, (_, i) => i); }, n);
  c = await cards();
  check(c[1].includes('locked'), 'even with all topics purple it stays locked until the first box is won');
  await page.evaluate(() => { learnPurple[3] = [1]; });
  await page.evaluate(n => { learnProgress[3] = Array.from({ length: n }, (_, i) => i); localStorage.setItem(LEARN_KEY, JSON.stringify(learnProgress)); }, n);
  await page.evaluate(() => startLevelExam(3, 1)); await play(70);
  await new Promise(r => setTimeout(r, 1500)); await page.evaluate(() => document.getElementById('level-bonus')?.remove());
  c = await cards();
  check(c.length === 2 && c[0].includes('taken') && c[1].includes('locked') && c[1].includes('tier2'), `after winning the first box the second one is still locked (${c.join(' / ')})`);
  await page.evaluate(n => { learnPurple[3] = Array.from({ length: n - 1 }, (_, i) => i); localStorage.setItem(PURPLE_KEY, JSON.stringify(learnPurple)); }, n);
  c = await cards();
  check(c[1].includes('locked'), 'one topic not purple: still locked');
  await page.evaluate(n => quizStep(3, n - 1), n); await play(999);
  check((await res()).includes('בוחן שני'), `the last topic turning purple opens it ("${await res()}")`);
  c = await cards();
  check(c[1].includes('open'), 'all purple: the second box is open');
  await page.evaluate(() => document.querySelector('#cat-list .cat-prize.tier2').click());
  await page.waitForFunction(() => stepQuiz && stepQuiz.exam === 2 && wordsData.length === 100, { timeout: 5000 });
  await play(89);
  check(!(await page.evaluate(() => levelBonus2Given.includes(3))) && (await res()).includes('90'), `89 right: no prize, 90 are needed ("${await res()}")`);
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => startLevelExam(3, 2)); await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { for (let k = 0; k < 5; k++) { const c = wordsData[currentIndex].correct; [...document.querySelectorAll('#answers-container .btn-answer')].find(x => x.innerText === c).click(); clearTimeout(nextQuestionTimer); nextQuestionTimer = null; currentIndex++; loadQuestion(); } });
  await page.reload({ waitUntil: 'load' }); await new Promise(r => setTimeout(r, 800));
  check(await page.evaluate(() => stepQuiz && stepQuiz.exam === 2 && wordsData.length === 100 && currentIndex === 5 && correctFirstTryCount === 5), 'reopening the app in the middle keeps it the second box\'s quiz, at the same question');
  await play(100);
  await page.waitForSelector('#level-bonus', { timeout: 4000 });
  const title = await page.$eval('#level-bonus .lb-title', e => e.textContent);
  check(await page.evaluate(() => levelBonus2Given.includes(3) && JSON.parse(localStorage.getItem('englishquiz-level-bonus2')).includes(3)) && title.includes('סגולים'), `90+ right: the second prize, saved ("${title}")`);
  await page.evaluate(() => document.getElementById('level-bonus')?.remove());
  c = await cards();
  check(c[1].includes('taken'), 'then the second box shows it was taken (once per level)');
  check(page.pageErrors.length === 0, `no page errors${page.pageErrors.length ? ': ' + page.pageErrors.join('; ') : ''}`);
  await page.close();
}

const TESTS = { fire: testFire, wordbank: testWordbank, random: testRandom, layout: testLayout, back: testBack, tabs: testTabs, streak: testStreak, pairs: () => eachFixture('pairs', testPairs), list: () => eachFixture('list', testList), translation: testTranslationRetry, practice: testPractice, chooser: testChooser, header: testHeader, persist: testPersist, learn: testLearn, purple: testPurple, shop: testShop, box: testBox, phoneback: testPhoneBack, avatar: testAvatar, celebrate: testCelebrate, boxextra: testBoxExtra, keep: testKeep, wand: testWand, pictures: testPictures, name: testName, top: testTop, listlearn: testListLearn, games: testGames, shapes: testShapes, ice: testIce, games2: testGames2, update: testUpdate, friends: testFriends };
try {
  let ran = 0;
  for (const [name, run] of Object.entries(TESTS)) {
    if (!wanted(name)) continue;
    await run(); ran++;
  }
  if (!ran) { console.error(`Nothing ran (known tests: ${Object.keys(TESTS).join(', ')}; or slow / all).`); process.exitCode = 2; }
} finally {
  await browser.close();
  server.close();
}

console.log(failures.length ? `\n${failures.length} check(s) FAILED` : '\nAll checks passed');
process.exit(process.exitCode || (failures.length ? 1 : 0));

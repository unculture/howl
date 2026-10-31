// Launches the app (packaged exe if given, else the built out/ folder) and makes a song end to end.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { _electron as electron } from 'playwright';

const exe = process.argv[2];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const songsDir = mkdtempSync(join(tmpdir(), 'howl-smoke-'));
mkdirSync('test-output', { recursive: true });
const env = { ...process.env, HOWL_SONGS_DIR: songsDir };
// Skips the macOS permission prompt. The mic itself is replaced in the page below.
const micArgs = ['--use-fake-device-for-media-stream'];
// Playwright's Electron launch hangs about 1 time in 4 on Windows. Plain launches of the same build
// hung 0 times in 30 (scripts/launch-soak.mjs), so this retries the harness and nothing else.
const launch = async () => {
  const options = exe ? { executablePath: exe, env, args: micArgs } : { args: ['.', ...micArgs], env };
  for (let attempt = 1; ; attempt++) {
    try {
      return await electron.launch({ ...options, timeout: 30000 });
    } catch (err) {
      if (attempt === 5) throw err;
      console.log(`test harness launch attempt ${attempt} hung, retrying`);
    }
  }
};
// A recording of three spoken lines becomes the mic, so the real VAD and Whisper pipeline runs on this machine.
const useRecordingAsMic = (target) =>
  target.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(bytes.buffer.slice(0));
      const source = context.createBufferSource();
      source.buffer = buffer;
      const out = context.createMediaStreamDestination();
      source.connect(out);
      source.start();
      return out.stream;
    };
  }, readFileSync('tests/fixtures/three-lines.wav').toString('base64'));
const check = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log(`ok - ${message}`);
};

const blocked = [];
const watchNetwork = (electronApp) => {
  const read = (chunk) => {
    for (const match of String(chunk).matchAll(/Blocked network request: (\S+)/g)) blocked.push(match[1]);
  };
  electronApp.process().stdout?.on('data', read);
  electronApp.process().stderr?.on('data', read);
};
// Reopening starts the app exactly as she would, with no test harness loaded inside it,
// and only attaches from outside. So a hang here is a hang she would see.
async function openLikeHer(seconds) {
  const started = Date.now();
  const binary = exe ?? createRequire(import.meta.url)('electron');
  const port = 9337;
  const child = spawn(binary, [...(exe ? [] : ['.']), `--remote-debugging-port=${port}`, ...micArgs], { env, stdio: 'pipe' });
  let output = '';
  const read = (chunk) => {
    output += chunk;
    for (const match of String(chunk).matchAll(/Blocked network request: (\S+)/g)) blocked.push(match[1]);
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  const close = async () => {
    child.kill();
    await sleep(1000);
  };
  try {
    let target = null;
    while (!target) {
      if (Date.now() - started > seconds * 1000) throw new Error('no window ever appeared');
      if (child.exitCode !== null) throw new Error(`it exited with code ${child.exitCode}`);
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => []);
      target = targets.find((item) => item.type === 'page') ?? null;
      if (!target) await sleep(250);
    }
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    let nextId = 1;
    const waiting = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) waiting.get(message.id)?.(message);
      else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    };
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = nextId++;
        waiting.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
      });
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
    const waitFor = async (selector, timeout = 5000) => {
      const end = Date.now() + timeout;
      while (!(await run(`!!document.querySelector(${JSON.stringify(selector)})`))) {
        if (Date.now() > end) throw new Error(`${selector} never appeared`);
        await sleep(100);
      }
    };
    const click = (selector) => run(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const snap = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`test-output/${name}.png`, Buffer.from(shot.result.data, 'base64'));
    };
    await send('Runtime.enable');
    await waitFor(t('song-card'), seconds * 1000);
    console.log(`reopened in ${Date.now() - started}ms`);
    return { run, waitFor, click, snap, close };
  } catch (err) {
    console.log(`reopen attempt failed after ${Date.now() - started}ms: ${err.message}\n${output}`);
    await close();
    return null;
  }
}

let app = await launch();
watchNetwork(app);
let page = await app.firstWindow();
const errors = [];
const listen = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
};
listen(page);
const t = (id) => `[data-testid=${id}]`;
const shot = (name) => page.screenshot({ path: `test-output/${name}.png` });

try {
  // ---- Home and new song ----
  await page.waitForSelector(t('new-song'), { timeout: 30000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  check(await page.evaluate(() => window.crossOriginIsolated), 'page is cross-origin isolated');
  await shot('01-home-empty');
  await page.click(t('new-song'));
  await page.fill(t('new-name'), 'moon pocket');
  await page.click(t('mood-snowfall'));
  await sleep(300);
  await page.click(t('mood-wolfMoon'));
  await sleep(500);
  await shot('02-new-song');
  await page.click(t('start-writing'));

  // ---- Words ----
  await page.waitForSelector(t('type-instead'));
  await shot('03-say-it-all');

  // ---- Dictation: three spoken lines through VAD and Whisper, on this machine ----
  const dictationStart = Date.now();
  await page.waitForSelector(`${t('record')}:not([disabled])`, { timeout: 90000 });
  console.log(`dictation ready after ${Date.now() - dictationStart}ms`);
  await useRecordingAsMic(page);
  await page.click(t('record'));
  await page.waitForFunction(() => document.querySelectorAll('.say-line').length >= 3, null, { timeout: 60000 });
  await shot('03b-dictated');
  const said = await page.locator('.say-line').allInnerTexts();
  console.log('heard', JSON.stringify(said));
  check(said.length === 3, 'three spoken lines become three lines');
  check(/pine trees/i.test(said[0]) && /river/i.test(said[1]) && /moon/i.test(said[2]), 'spoken lines arrive in order');
  await page.click(t('record'));
  await page.waitForSelector(t('line'), { timeout: 15000 });
  console.log('last transcription ms', await page.evaluate(() => window.__howlProbe().lastTranscribeMs));
  check((await page.locator(t('line')).count()) === 3, 'Stop switches to Your lines');

  // Put known words in place for the steps below.
  for (const [i, text] of ['the pine trees whisper my name', 'walking where the snow forgets my feet', 'and the river runs cold under me'].entries()) {
    await page.locator(t('line')).nth(i).click({ position: { x: 300, y: 25 } });
    await page.keyboard.press('Enter');
    await page.fill(t('line-input'), text);
    await page.keyboard.press('Enter');
  }

  await page.locator(t('line')).nth(0).click({ position: { x: 300, y: 25 } });
  await page.waitForSelector(t('bit-count'));
  const count = () => page.locator(t('bit-count')).innerText();
  check((await count()) === '7 bits to sing', 'first line has 7 bits');
  await page.locator(t('join')).first().click();
  check((await count()) === '6 bits to sing', 'joining bits lowers the count');
  await page.locator(t('undo')).click();
  check((await count()) === '7 bits to sing', 'undo restores the bits');
  await page.locator(t('bit')).nth(1).click();
  await page.locator(t('split-gap')).first().click();
  check((await count()) === '8 bits to sing', 'splitting a bit raises the count');
  await page.locator(t('undo')).click();
  await shot('04-your-lines');

  await page.keyboard.press('Alt+ArrowDown');
  const first = () => page.locator(`${t('line')} .line-text`).first().innerText();
  check((await first()).startsWith('walking'), 'Alt+Down moves the line');
  await page.locator(t('undo')).click();
  check((await first()).startsWith('the pine'), 'undo puts it back');

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Delete');
  check((await page.locator(t('line')).count()) === 2, 'Delete removes the line');
  await page.locator('.toast-action').click();
  check((await page.locator(t('line')).count()) === 3, 'the toast Undo brings it back');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.fill(t('line-input'), 'the pine trees whisper my name');
  await page.keyboard.press('Escape');

  await page.locator(t('line')).nth(0).click({ position: { x: 300, y: 25 } });
  await page.click(t('make-tune'));

  // ---- Tune, with real touch events ----
  await page.waitForSelector(t('start'));
  await shot('05-tune-ready');
  await page.click(t('start'));
  await page.waitForSelector('.count-number', { timeout: 5000 });
  await shot('06-count-in');
  await page.waitForSelector('.count-number', { state: 'detached', timeout: 15000 });
  const cdp = await page.context().newCDPSession(page);
  const padCentre = async (i) => {
    const box = await page.locator('[data-pad]').nth(i).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const pressed = () => page.locator('[data-pad][data-pressed]').count();

  let peak = 0;
  // A tap, a tap, then a held tap with a slide (a bend).
  for (const pad of [1, 3]) {
    const p = await padCentre(pad);
    await touch('touchStart', [{ ...p, id: 1 }]);
    await sleep(100);
    peak = Math.max(peak, await page.evaluate(() => window.__howlProbe().peak));
    await touch('touchEnd', []);
    await sleep(100);
  }
  check((await page.locator(t('block')).count()) === 2, 'touch taps make blocks');
  const lefts = await page.locator(t('block')).evaluateAll((els) => els.map((el) => parseFloat(el.style.left)));
  check(lefts[1] - lefts[0] > 2.5, `notes land where they were tapped, not bunched up (${lefts.join('%, ')}%)`);
  const a = await padCentre(4);
  const b = await padCentre(6);
  await touch('touchStart', [{ ...a, id: 1 }]);
  await sleep(200);
  await touch('touchMove', [{ ...b, id: 1 }]);
  await sleep(200);
  check((await page.locator('[data-pad="6"][data-pressed]').count()) === 1, 'sliding lights the new pad');
  await touch('touchEnd', []);
  await sleep(60);
  check((await page.locator(t('block')).count()) === 4, 'sliding makes a bend on one bit');
  check((await page.locator('.block-bend').count()) === 1, 'the bend shows as a joined block');
  check((await page.locator('.bit-glow').innerText()) === 'whis', 'glow is on the fourth bit');

  // Two fingers: the second finger ends the first note and takes the next bit.
  const c = await padCentre(2);
  const d = await padCentre(5);
  await touch('touchStart', [{ ...c, id: 1 }]);
  await sleep(150);
  await touch('touchStart', [{ ...c, id: 1 }, { ...d, id: 2 }]);
  await sleep(150);
  check((await pressed()) === 1, 'two fingers light one pad');
  check((await page.locator('.bit-glow').innerText()) === 'my', 'second finger sings the next bit');
  await shot('07-tapping');
  await touch('touchEnd', [{ ...c, id: 1 }]);
  await sleep(50);
  await touch('touchEnd', []);
  await sleep(50);

  await page.keyboard.press('Backspace');
  check((await page.locator('.bit-glow').innerText()) === 'per', 'Backspace moves the glow back');

  // The rest by keyboard, holding one key to prove key-up handling.
  for (const key of ['s', 'd', 'f']) {
    await page.keyboard.down(key);
    await sleep(90);
    await page.keyboard.up(key);
    await sleep(60);
  }
  await page.waitForSelector(t('next'), { timeout: 5000 });
  await sleep(500);
  await shot('08-has-tune');
  const probe = await page.evaluate(() => window.__howlProbe());
  console.log('audio', JSON.stringify(probe), 'peak while pressed', peak);
  check(probe.state === 'running', 'audio is running');
  check(peak > 0, 'pads make sound');
  const worst = Math.max(...probe.handlerMs);
  check(worst < 50, `pad handler took under 50ms (${worst.toFixed(1)}ms worst, ${probe.queuedMs.map((ms) => ms.toFixed(0)).join(' ')}ms queued)`);
  const left = await page.locator('.playhead').evaluate((el) => [getComputedStyle(el).display, el.style.left]);
  await sleep(300);
  const left2 = await page.locator('.playhead').evaluate((el) => el.style.left);
  check(left[0] === 'block' && left[1] !== left2, 'playhead moves over the loop');
  await page.click(t('next'));
  await page.waitForSelector(t('start'));
  check((await page.locator('.tune-header h1').innerText()) === 'Line 2', 'Next line goes to line 2');

  await page.click(t('play-song'));
  await sleep(400);
  check((await page.locator('.tune-header h1').innerText()) === 'Line 1', 'Play song follows the first line with a tune');
  await page.keyboard.press('Escape');
  await sleep(100);

  // On touch there is no Space bar, so a looping line needs a Stop she can tap.
  await page.click(t('hear'));
  await page.click(t('stop'));
  await page.waitForSelector(t('hear'), { timeout: 2000 });
  check((await page.locator(t('stop')).count()) === 0, 'Stop button stops playback and gives Hear it back');

  // ---- Notes, octave, menus ----
  const padNames = () => page.locator('[data-pad]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')).join(' '));
  check((await padNames()) === 'A3 C4 D4 F4 G4 A4 C5 D5 F5 G5', 'Wolf moon 5-note pads');
  await page.keyboard.press('7');
  check((await padNames()) === 'A3 Bb3 C4 D4 E4 F4 G4 A4 Bb4 C5', 'Wolf moon 7-note pads');
  check((await page.locator('.pad-colour').count()) > 0, 'colour notes show in 7 notes');
  await shot('08b-seven-notes');
  await page.keyboard.press('5');
  await page.click('[aria-label=Higher]');
  check((await padNames()).startsWith('A4 C5'), 'octave arrow moves the pads up');
  check(await page.locator('[aria-label=Higher]').isDisabled(), 'octave arrow stops at the limit');
  await page.keyboard.press('z');
  check((await padNames()).startsWith('A3 C4'), 'Z moves the pads back');

  // ---- Editing blocks ----
  await page.waitForSelector(t('hear'));
  const block = page.locator(t('block')).nth(1);
  const place = () => block.evaluate((el) => ({ top: el.style.top, left: parseFloat(el.style.left), width: parseFloat(el.style.width) }));
  const dragBlock = async (fromX, fromY, dx, dy) => {
    const box = await block.boundingBox();
    const x = box.x + box.width * fromX;
    const y = box.y + box.height * fromY;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 });
    await page.mouse.move(x + dx, y + dy, { steps: 3 });
    await page.mouse.up();
    await sleep(50);
  };
  const before = await place();
  await dragBlock(0.3, 0.5, 0, -48);
  const lifted = await place();
  check(parseFloat(lifted.top) < parseFloat(before.top) && lifted.left === before.left, 'dragging up changes the pitch only');
  await page.locator(t('undo')).click();
  check((await place()).top === before.top, 'undo restores the pitch');
  await page.locator(t('block')).nth(0).evaluate((el) => el.scrollIntoView());
  await dragBlock(0.3, 0.5, 2000, 0);
  const pushed = await place();
  const next = await page.locator(t('block')).nth(2).evaluate((el) => parseFloat(el.style.left));
  check(pushed.left > before.left && pushed.left + pushed.width <= next + 0.01, 'dragging right stops at the next block');
  await page.locator(t('undo')).click();
  await sleep(250);
  const wide = await block.boundingBox();
  if (wide.width > 30) {
    await dragBlock(0.97, 0.5, 2000, 0);
    const resized = await place();
    check(resized.width > before.width && resized.left === before.left && resized.left + resized.width <= next + 0.01, 'dragging the right edge changes length and stops at the next block');
    await page.locator(t('undo')).click();
    await sleep(250);
  }
  await block.focus();
  await page.keyboard.press('ArrowUp');
  check((await place()).top !== before.top, 'arrow keys edit the focused block');
  await page.locator(t('undo')).click();
  await page.evaluate(() => document.activeElement?.blur());

  // ---- Helpers ----
  await page.click(t('tidy'));
  const starts = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((el) => el.innerText));
  check(starts.some((text) => text.includes('Timing tidied')), 'Tidy timing shows its toast');
  await page.locator('.toast-action').click();
  await page.click(t('sound-chip'));
  await page.click(t('sound-softKeys'));
  check((await page.locator(t('sound-chip')).innerText()) === 'Play it as: Soft keys', 'Play it as changes the sound');
  await page.keyboard.press('Escape');
  await page.click(t('speed-chip'));
  await shot('08c-speed');
  await page.keyboard.press('Escape');

  // Make line 2 by keyboard, then copy line 1's tune onto it (7 bits onto 9).
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector(t('start'));
  await page.keyboard.press('Space');
  await page.waitForSelector('.count-number', { timeout: 3000 });
  check((await page.locator('.count-number').innerText()) === '4', 'a later take still gets its full count-in');
  await page.waitForSelector('.count-number', { state: 'detached', timeout: 15000 });
  const bitsOnTwo = await page.locator('[data-testid=lyric] .bit-wrap').count();
  for (let i = 0; i < bitsOnTwo; i++) {
    await page.keyboard.down('d');
    await sleep(40);
    await page.keyboard.up('d');
    await sleep(40);
  }
  await page.waitForSelector(t('same-as'), { timeout: 5000 });
  await page.click(t('same-as'));
  await shot('08d-same-as');
  await page.click(t('same-as-item'));
  const copied = await page.locator('[data-testid=block] .t-note-label').count();
  check(copied === bitsOnTwo, `Same tune as gives every bit a note (${copied})`);
  await page.locator(t('undo')).click();

  // Mood change keeps every note in key.
  await page.click(t('mood-chip'));
  await page.click(t('mood-running'));
  check((await page.locator(t('mood-chip')).innerText()) === 'Running', 'mood chip changes');
  check((await padNames()) === 'A3 C4 D4 E4 G4 A4 C5 D5 E5 G5', 'pads follow the new mood');
  await shot('08e-mood');
  await page.locator(t('undo')).click();
  check((await padNames()).startsWith('A3 C4 D4 F4'), 'undo brings the old mood back');

  const samples = await page.evaluate(() => window.__howlProbe().samples);
  check(samples.loaded && samples.failed === 0 && samples.count > 50, `instrument recordings all loaded (${samples.count})`);

  // ---- Saved, and still there after quitting ----
  await app.close();
  const files = readdirSync(songsDir);
  check(files.includes('moon pocket.howl'), 'song file is in the songs folder');
  const zip = await JSZip.loadAsync(readFileSync(join(songsDir, 'moon pocket.howl')));
  check(['README.txt', 'lyrics.txt', 'song.json', 'tune.mid'].every((name) => zip.file(name)), 'zip holds the 4 files');
  const saved = JSON.parse(await zip.file('song.json').async('string'));
  check(saved.lines.length === 3 && saved.lines[0].tune.notes.length === 7, 'tune is in the saved song');

  await sleep(1000);
  let reopened = await openLikeHer(60);
  if (!reopened) {
    // Tells a saved-window-size problem apart from a general one.
    const appData = process.platform === 'win32' ? process.env.APPDATA : join(homedir(), 'Library/Application Support');
    rmSync(join(appData, 'howl', 'window.json'), { force: true });
    reopened = await openLikeHer(60);
    console.log(reopened ? 'reopen only worked without window.json' : 'reopen failed without window.json too');
    throw new Error('The app did not reopen after quitting');
  }
  app = reopened;
  await sleep(300);
  await reopened.snap('09-home');
  await reopened.click('.song-tile');
  await reopened.waitFor(t('rail-tune'));
  await reopened.waitFor('.tune');
  await reopened.click('[aria-label="Previous line"]'); // It opens on the first line without a tune.
  await reopened.waitFor(t('hear'));
  check((await reopened.run(`document.querySelectorAll('${t('block')}').length`)) >= 9, 'blocks are still there after reopening');
  await reopened.click(t('hear'));
  await sleep(300);
  await reopened.snap('10-reopened');

  check(blocked.length === 0, `no network requests were attempted${blocked.length ? `: ${blocked.join(' ')}` : ''}`);
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`);
  console.log('Smoke test passed');
} catch (err) {
  await page.screenshot({ path: 'test-output/failure.png' }).catch(() => {});
  console.error(err);
  if (errors.length) console.error('Page errors:', errors);
  process.exitCode = 1;
} finally {
  await app.close().catch(() => {});
}

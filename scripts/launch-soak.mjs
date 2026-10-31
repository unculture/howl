// Launches the app over and over to tell an app hang apart from a test harness hang.
// Usage: node scripts/launch-soak.mjs path/to/howl.exe [plainRuns] [harnessRuns]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const [exe, plainRuns = '30', harnessRuns = '8'] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const env = { ...process.env, HOWL_SONGS_DIR: mkdtempSync(join(tmpdir(), 'howl-soak-')) };
const homeIsUp = "!!document.querySelector('[data-testid=new-song]')";

/** Starts the exe as she would and waits for Home to be on screen. Returns ms, or null if it hung. */
async function plainLaunch(port, limitMs) {
  const started = Date.now();
  const child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore' });
  let ms = null;
  let socket = null;
  try {
    while (Date.now() - started < limitMs && ms === null) {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json(), () => []);
      const page = targets.find((item) => item.type === 'page');
      if (page && !socket) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.onopen = resolve;
          socket.onerror = reject;
        });
      }
      if (socket) {
        const up = await new Promise((resolve) => {
          socket.onmessage = (event) => resolve(JSON.parse(event.data).result?.result?.value);
          socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: homeIsUp, returnByValue: true } }));
          setTimeout(() => resolve(false), 2000);
        });
        if (up) ms = Date.now() - started;
      }
      if (ms === null) await sleep(100);
    }
    // Quit the way closing the window does, and check the process really goes away.
    if (ms !== null) {
      socket.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: 'window.close()' } }));
      const end = Date.now() + 8000;
      while (child.exitCode === null && Date.now() < end) await sleep(100);
      if (child.exitCode === null) console.log('  window closed but the process did not exit within 8s');
    }
  } catch (err) {
    console.log(`  ${err.message}`);
  } finally {
    socket?.close();
    child.kill();
    await sleep(500);
  }
  return ms;
}

let plainHangs = 0;
const times = [];
for (let i = 0; i < Number(plainRuns); i++) {
  const ms = await plainLaunch(9400 + (i % 50), 45000);
  console.log(`plain ${i + 1}: ${ms === null ? 'HUNG' : `${ms}ms`}`);
  if (ms === null) plainHangs++;
  else times.push(ms);
}
times.sort((a, b) => a - b);
console.log(`plain launches: ${plainHangs} hung of ${plainRuns}; median ${times[times.length >> 1]}ms, worst ${times.at(-1)}ms`);

let harnessHangs = 0;
for (let i = 0; i < Number(harnessRuns); i++) {
  const started = Date.now();
  try {
    const app = await electron.launch({ executablePath: exe, env, timeout: 40000 });
    const page = await app.firstWindow();
    await page.waitForSelector('[data-testid=new-song]', { timeout: 20000 });
    console.log(`harness ${i + 1}: ${Date.now() - started}ms`);
    await app.close();
  } catch (err) {
    harnessHangs++;
    console.log(`harness ${i + 1}: HUNG (${String(err.message).split('\n')[0]})`);
  }
  await sleep(500);
}
console.log(`harness launches: ${harnessHangs} hung of ${harnessRuns}`);
process.exit(plainHangs ? 1 : 0);

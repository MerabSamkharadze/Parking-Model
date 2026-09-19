// Headless-Chrome screenshot driver (no dependencies: Node 22 WebSocket + CDP).
//
//   node scripts/screenshot.mjs <url> <steps.js> [outDir]
//   env: W=1440 H=900 DPR=1 CHROME=/path/to/chrome SETTLE=2500
//
// <steps.js> runs inside this process with `evaluate(js)`, `shot(name, clip?)`,
// `wait(ms)`, `waitFor(js)` and `send(method, params)`; its return value is printed with the
// page's console output, uncaught errors and failed HTTP responses. In
// development builds the page exposes `window.__avp` (components/scene/
// DevHandle.tsx) for driving the scene. Used for the STATUS.md checks and the
// README screenshots.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [, , url, stepsPath, outDir = '.'] = process.argv;
if (!url || !stepsPath) {
  console.error('usage: node scripts/screenshot.mjs <url> <steps.js> [outDir]');
  process.exit(2);
}
const width = Number(process.env.W || 1440);
const height = Number(process.env.H || 900);
const port = 9333 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'avp-chrome-'));
mkdirSync(outDir, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let stderr = '';
chrome.stderr.on('data', (d) => (stderr += d));

async function waitForChrome() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return r.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('chrome did not start\n' + stderr);
}

const version = await waitForChrome();
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 0;
const pending = new Map();
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) events.push(msg);
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++nextId;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)));
  return r.result.value;
};
const shot = async (name, clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  const file = join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  return file;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls a page expression until it is truthy (e.g. `!!window.__avp`). */
const waitFor = async (expression, timeoutMs = 20000) => {
  const t0 = Date.now();
  while (!(await evaluate(expression))) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${expression}`);
    await wait(200);
  }
};

try {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: Number(process.env.DPR || 1), mobile: false });
  await send('Page.navigate', { url });
  await wait(Number(process.env.SETTLE || 2500));
  const steps = new Function('evaluate', 'shot', 'wait', 'waitFor', 'send', `return (async () => { ${readFileSync(stepsPath, 'utf8')} })();`);
  const result = await steps(evaluate, shot, wait, waitFor, send);
  const report = {
    chrome: version.Browser,
    result,
    console: events.filter((e) => e.method === 'Runtime.consoleAPICalled').map((e) => `[${e.params.type}] ${e.params.args.map((a) => a.value ?? a.description).join(' ')}`),
    errors: events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description),
    http: events.filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400).map((e) => `${e.params.response.status} ${e.params.response.url}`),
  };
  process.stdout.write(JSON.stringify(report, null, 1) + '\n');
} catch (e) {
  process.stdout.write(`DRIVER ERROR: ${e?.stack ?? e}\n`);
  process.exitCode = 1;
} finally {
  try {
    ws.close();
  } catch {
    /* already closed */
  }
  chrome.kill('SIGKILL');
  setTimeout(() => {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Chrome may still be flushing the profile; the temp dir is harmless */
    }
    process.exit();
  }, 400);
}

// Bounded visual checkpoint for the glade and whole-route camera before gameplay QA.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = path.resolve(process.env.MEMORY_CHECK_OUT || 'qa/memory/three-step/first-look');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const report = { errors: [], captures: [] };
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.errors.push(`${r.status()} ${r.url()}`); });
try {
  await page.goto(`${process.env.MEMORY_URL || 'http://127.0.0.1:4206/remake/minnisspil.html'}?seed=251025&play=1`);
  await page.waitForFunction(() => window.__memoryReady || !document.querySelector('#error').hidden, null, { timeout: 90000 });
  if (!await page.evaluate(() => window.__memoryReady)) throw new Error('Initialization failed');
  for (const [name, width, height] of [['desktop', 1280, 800], ['tablet', 820, 1180], ['phone', 390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const mode of ['auto', 'overview']) {
      await page.evaluate(mode => window.__memory.camera(mode), mode);
      await page.waitForFunction(() => !window.__memory.stats().camera.moving, null, { timeout: 20000 });
      await page.screenshot({ path: path.join(out, `${name}-${mode}.png`) });
      report.captures.push({ name, mode, stats: await page.evaluate(() => window.__memory.stats()) });
      console.log(`Captured ${name}-${mode}`);
    }
  }
} catch (e) { report.errors.push(e.message); process.exitCode = 1; }
finally { await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify({ errors: report.errors, captures: report.captures.length }));

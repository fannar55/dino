import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// This is an actual UI game, not a state-injection fixture. The QA API is read-only here.
// Run after the shared browser slot is available:
// PLAYWRIGHT_PATH=<absolute playwright directory> node remake/tools/yatzy-mosi-complete-check.mjs
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url)), output = path.join(root, 'qa/yatzy-mosi');
const url = process.env.YATZY_URL || 'http://127.0.0.1:4197/remake/yatzy-mosi.html?qa';
const seed = 0x5a17, errors = [], warnings = [];
const report = { url, seed, strategy: 'One deliberate zero to exercise confirmation, then human advice; Mosi uses its own controller.', checks: [], captures: [], errors, warnings, completed: false };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined, args: ['--enable-unsafe-swiftshader'] });
let page;

async function ready() {
  await page.waitForFunction(() => window.__yatzyQA || !document.getElementById('error').hidden, undefined, { timeout: 90000 });
  assert.ok(await page.evaluate(() => Boolean(window.__yatzyQA)), 'game initializes successfully');
  await page.evaluate(async () => { window.__completeRules = await import('./engine/yatzy-mosi/rules.js'); });
}
const state = () => page.evaluate(() => window.__yatzyQA.getState());
const human = () => page.waitForFunction(() => {
  const qa = window.__yatzyQA, state = qa.getState(), status = qa.getStatus();
  return state.currentPlayer === 0 && status.phase === 'human' && !status.paused;
}, undefined, { timeout: 90000 });
async function screenshot(name) {
  const file = `complete-${name}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); report.captures.push(file);
}
async function checkTable(label) {
  const result = await page.evaluate(() => {
    const qa = window.__yatzyQA, game = qa.getState(), snapshot = qa.getSnapshot(), rules = window.__completeRules;
    rules.validateGame(game);
    const visible = element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + .5 && rect.bottom <= innerHeight + .5 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    return {
      state: game, phase: qa.getStatus().phase, values: snapshot.dice.values, up: snapshot.dice.up,
      columns: [...document.querySelectorAll('.score-scroll thead th')].slice(1).map(element => ({ label: element.textContent, visible: visible(element) })),
      totals: ['you', 'mosi'].map((id, player) => ({ value: Number(document.getElementById(`${id}-total`).textContent), expected: rules.totals(game.players[player].scores).total, visible: visible(document.getElementById(`${id}-card`)) })),
      humanUsedEnabled: [...document.querySelectorAll('.score[data-player="0"]')].filter(button => game.players[0].scores[button.dataset.category] !== null && !button.disabled).length,
      opponentEnabled: [...document.querySelectorAll('.score[data-player="1"]')].some(button => !button.disabled),
    };
  });
  assert.deepEqual(result.columns.map(column => column.label), ['Þú', 'Mosi']);
  assert.ok(result.columns.every(column => column.visible), `${label}: both score columns visible`);
  assert.ok(result.totals.every(total => total.visible && total.value === total.expected), `${label}: both correct totals visible`);
  assert.equal(result.humanUsedEnabled, 0); assert.equal(result.opponentEnabled, false);
  if (result.state.rollCount > 0 && !['rolling', 'handoff'].includes(result.phase)) {
    assert.deepEqual(result.values, result.state.dice, `${label}: displayed values`);
    assert.deepEqual(result.up, result.state.dice, `${label}: actual upward mesh faces`);
  }
  return result;
}
async function startObserver() {
  await page.evaluate(() => {
    window.__completeAudit = { rolls: [], scores: [], issues: [] };
    const seen = new Set(); let previousTurn = -1;
    const sample = () => {
      const qa = window.__yatzyQA, game = qa.getState(), status = qa.getStatus(), audit = window.__completeAudit;
      if (game.turnCount !== previousTurn) {
        previousTurn = game.turnCount;
        audit.scores.push({ turn: game.turnCount, totals: game.players.map(player => window.__completeRules.totals(player.scores).total), rows: game.players.map(player => Object.values(player.scores).filter(value => value !== null).length) });
      }
      const key = `${game.turnCount}:${game.rollCount}`;
      if (game.rollCount > 0 && ['human', 'ai-wait', 'ai-hold', 'ai-score'].includes(status.phase) && !seen.has(key)) {
        seen.add(key); const debug = qa.dice.getDebugState();
        audit.rolls.push({ turn: game.turnCount, roll: game.rollCount, player: game.currentPlayer, dice: [...game.dice], up: debug.up });
        if (JSON.stringify(debug.up) !== JSON.stringify(game.dice) || JSON.stringify(debug.values) !== JSON.stringify(game.dice)) audit.issues.push(`Mesh/state mismatch at ${key}`);
      }
      window.__completeObserver = requestAnimationFrame(sample);
    };
    window.__completeObserver = requestAnimationFrame(sample);
  });
}
async function playDecision() {
  const before = await state(); assert.equal(before.currentPlayer, 0);
  const decision = await page.evaluate(() => window.__completeRules.decideAI(window.__yatzyQA.getState()));
  if (decision.type === 'roll') {
    if (before.rollCount > 0) for (let i = 0; i < 5; i++) if (before.held[i] !== decision.held[i]) await page.keyboard.press(String(i + 1));
    const selected = await state();
    if (before.rollCount > 0) assert.deepEqual(selected.held, decision.held);
    await page.locator('#roll').click();
    const committed = await state(); assert.equal(committed.rollCount, before.rollCount + 1);
    for (let i = 0; i < 5; i++) if (selected.held[i]) assert.equal(committed.dice[i], selected.dice[i]);
    await human(); await checkTable(`turn ${before.turnCount}, roll ${committed.rollCount}`);
    return false;
  }
  const expected = await page.evaluate(id => window.__completeRules.previews(window.__yatzyQA.getState())[id], decision.categoryId);
  await page.locator(`.score[data-player="0"][data-category="${decision.categoryId}"]`).click();
  if (expected === 0) { await page.locator('#zero-dialog').waitFor({ state: 'visible' }); await page.locator('#confirm-zero').click(); }
  const after = await state(); assert.equal(after.turnCount, before.turnCount + 1); assert.equal(after.players[0].scores[decision.categoryId], expected);
  report.humanChoices.push({ round: before.turnCount / 2 + 1, category: decision.categoryId, points: expected, rolls: before.rollCount });
  return true;
}

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push({ type: 'javascript', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); else if (message.type() === 'warning' && /webgl|shader|context/i.test(message.text())) warnings.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push({ type: 'http', status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => { if (!/ERR_ABORTED/.test(request.failure()?.errorText || '')) errors.push({ type: 'network', url: request.url(), message: request.failure()?.errorText }); });
  await page.addInitScript(seed => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = array => { if (array instanceof Uint32Array && array.length === 1) { array[0] = seed; return array; } return original(array); };
  }, seed);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }); await ready();
  await page.locator('#start').click(); await human(); await checkTable('new game');

  // Reload while the normal cup animation is still active: the committed outcome must survive.
  await page.locator('#roll').click();
  await page.waitForFunction(() => window.__yatzyQA.getStatus().phase === 'rolling' && window.__yatzyQA.dice.getDebugState().elapsed > .1);
  const inFlight = await state(); assert.equal(inFlight.rollCount, 1);
  assert.equal(await page.evaluate(() => window.__yatzyQA.getStatus().phase), 'rolling');
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 }); await ready();
  await page.locator('#continue').click(); await human(); assert.deepEqual(await state(), inFlight);
  await checkTable('mid-roll reload'); report.checks.push('Reload during the normal first roll resumes its exact committed outcome without another roll.');

  // A hold uses the real projected die button and survives another fresh page load.
  await page.locator('.die-target[data-index="0"]').click(); const held = await state(); assert.equal(held.held[0], true);
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 }); await ready();
  await page.locator('#continue').click(); await human(); assert.deepEqual(await state(), held); await checkTable('held-die reload');
  assert.equal(await page.locator('.die-target[data-index="0"]').getAttribute('aria-pressed'), 'true');
  report.checks.push('A held die, all five values, roll count and RNG state survive reload.');

  await page.locator('#pause').click(); await page.locator('#motion').click();
  assert.equal(await page.evaluate(() => window.__yatzyQA.getStatus().reduced), true);
  const paused = await page.evaluate(() => ({ state: window.__yatzyQA.getState(), dice: window.__yatzyQA.getSnapshot().dice, timer: window.__yatzyQA.getStatus().timer }));
  await page.evaluate(() => new Promise(resolve => { let count = 0; const next = () => ++count === 20 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); }));
  assert.deepEqual(await page.evaluate(() => ({ state: window.__yatzyQA.getState(), dice: window.__yatzyQA.getSnapshot().dice, timer: window.__yatzyQA.getStatus().timer })), paused);
  await page.locator('#pause-dialog [data-close]').click(); await human(); await startObserver();
  report.checks.push('Reduced motion selected through the pause menu; paused frames leave dice, turn state and timer unchanged.');

  const zeroId = await page.evaluate(() => {
    const previews = window.__completeRules.previews(window.__yatzyQA.getState());
    return ['yatzy', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight'].find(id => previews[id] === 0);
  });
  assert.ok(zeroId); const beforeZero = await state();
  await page.locator(`.score[data-player="0"][data-category="${zeroId}"]`).click();
  await page.locator('#zero-dialog').waitFor({ state: 'visible' }); await screenshot('zero-confirmation');
  await page.locator('#zero-dialog [data-close]').click(); assert.deepEqual(await state(), beforeZero);
  await page.locator(`.score[data-player="0"][data-category="${zeroId}"]`).click(); await page.locator('#confirm-zero').click();
  const afterZero = await state(); assert.equal(afterZero.turnCount, 1); assert.equal(afterZero.players[0].scores[zeroId], 0);
  report.humanChoices = [{ round: 1, category: zeroId, points: 0, rolls: beforeZero.rollCount }];
  report.checks.push('A zero-score selection can be cancelled unchanged, then explicitly confirmed once.');
  await human(); assert.equal((await state()).turnCount, 2); await checkTable('round one');
  await screenshot('round-one');

  for (let round = 2; round <= 15; round++) {
    await human(); assert.equal((await state()).turnCount, (round - 1) * 2);
    for (let actions = 0; ; actions++) {
      assert.ok(actions < 5, 'a human turn has at most three rolls and one scoring decision');
      if (await playDecision()) break;
      if (round === 2 && actions === 0) { await page.locator('#advice').click(); assert.equal(await page.locator('#moment-kicker').textContent(), 'TILLAGA'); await screenshot('held-advice'); }
    }
    if (round < 15) {
      await human(); assert.equal((await state()).turnCount, round * 2); await checkTable(`round ${round}`);
      if ([5, 10].includes(round)) { await screenshot(`round-${round}`); console.log(`Completed ${round}/15 rounds through UI.`); }
    }
  }
  await page.locator('#win-dialog').waitFor({ state: 'visible', timeout: 90000 });
  const final = await state(); assert.equal(final.status, 'finished'); assert.equal(final.turnCount, 30);
  assert.ok(final.players.every(player => Object.values(player.scores).length === 15 && Object.values(player.scores).every(value => value !== null)));
  const finalAudit = await page.evaluate(() => window.__completeAudit); assert.deepEqual(finalAudit.issues, []);
  assert.ok(finalAudit.rolls.some(roll => roll.player === 1), 'Mosi rolls sampled');
  assert.deepEqual(finalAudit.scores.map(score => score.turn), Array.from({ length: 31 }, (_, index) => index));
  report.audit = finalAudit; report.final = final; report.result = await page.locator('#win-copy').textContent();
  assert.ok((await page.locator('#win-title').textContent()).length > 0);
  const totals = await page.evaluate(() => window.__yatzyQA.getState().players.map(player => window.__completeRules.totals(player.scores)));
  for (const total of totals) assert.ok(report.result.includes(String(total.total)));
  await screenshot('result'); await page.locator('#win-dialog [data-close]').click(); await checkTable('completed scorecard'); await screenshot('scorecard');
  report.checks.push(`All 15 rounds complete through real inputs; both players fill all 15 categories, with ${finalAudit.rolls.length} settled rolls checked against mesh orientation.`);

  // A finished save must show the result copy on a fresh DOM, not only after the final turn.
  await page.reload({ waitUntil: 'networkidle', timeout: 90000 }); await ready(); await page.locator('#continue').click();
  await page.locator('#win-dialog').waitFor({ state: 'visible' }); assert.deepEqual(await state(), final);
  assert.equal(await page.locator('#win-copy').textContent(), report.result); assert.ok((await page.locator('#win-title').textContent()).length > 0);
  report.checks.push('Reloading the completed save restores the exact scorecards and populated final-result dialog.');
  assert.deepEqual(errors, []); report.completed = true;
  console.log(JSON.stringify({ completed: true, rounds: 15, totals: totals.map(total => total.total), winner: final.winner, rollsChecked: finalAudit.rolls.length, errors: errors.length, warnings: warnings.length, report: path.join(output, 'complete-report.json') }));
} catch (error) {
  report.failure = { name: error.name, message: error.message, stack: error.stack };
  if (page) {
    try { report.last = await page.evaluate(() => ({ state: window.__yatzyQA?.getState(), status: window.__yatzyQA?.getStatus(), audit: window.__completeAudit })); } catch {}
    try { await screenshot('failure'); } catch {}
  }
  throw error;
} finally {
  await browser.close(); await writeFile(path.join(output, 'complete-report.json'), JSON.stringify(report, null, 2));
}

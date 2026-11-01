#!/usr/bin/env node
// "Veiddu" in "Fjölspil", checked headless in Edge (Task 9; the owner's decision of 2026-11-01: Egill's hand is on his own device, so every
// human seat plays from a phone and the big screen is only the pond, the seats' tags and the bubbles). No Playwright: it drives Edge over the
// DevTools protocol, as veiddu-video.mjs does (it imports that file's browser, video and sound parts), with one browser context for each
// phone so each keeps its own guest id.
//
//   node remake/tools/veiddu-fjolspil-check.mjs --out qa/remake/veiddu/t9 [--url http://127.0.0.1:4256/remake/] [--seed t9] [--video]
//     [--browser edge|chrome|<exe>] [--max 1200] [--stall 90] [--quick] [--kinds 7]
//
// It needs the dev server running (node remake/tools/serve.mjs --port 4256: the page's Fjölspil room is a WebSocket on it). The big screen is
// veiddu-lab.html?fjolspil=1 (1280x800), with Egill's phone and Anna's (spil.html, 390x844) beside it. Egill's phone is "Ég er Egill", Anna
// joins with a name and a friend, Uggeðla is added, "Byrjum!" seats the three, and the round is played to its end by taps on the phones (a
// card, a seat, the pond, "Farðu að veiða!": what a finger does). In the check run it also checks, on the way:
//   - no console error or exception on any page;
//   - every act a phone sent is heard once by the big screen (its host session's onAct), in the order they were sent;
//   - an act that is not allowed (out of turn, to oneself, a card not held, a seat that is not there, a no with the animal in hand, ...) changes
//     nothing: the rules' game is the same, the table still waits for the same seat, and the phone is sent its view again;
//   - a phone that goes (Anna's page closed on her turn) is waited for over the board: the lobby's card "Bíðum eftir Anna…" with the QR code
//     and the room's letters, then "Halda áfram án Anna" after 20 s, which makes the computer play her seat; she comes back in the same
//     browser context (the same guest id) and plays her seat again;
//   - Egill's phone is reloaded in the middle of a round and finds its seat and its hand again by the kept id;
//   - the big screen is reloaded in the middle of a round: both phones wait, "Halda áfram" takes the kept round up where it was, and it ends.
// With --video it only plays the round (no illegal acts, dropouts or reloads) and records the big screen with its sound (veiddu-video.mjs's
// sound tap, the voices mixed in) beside Egill's phone, side by side, as <out>/fjolspil.mp4, with the stills the owner asked for beside it.
// --quick plays the check run on a smaller table (two seats: Egill and Uggeðla): no Anna, so no illegal acts of hers and no dropout.
// --kinds N (6 to 13, the lab's &kinds=N) deals the round from a deck of the first N kinds: a round in minutes, for the video; with fewer
// than thirteen the round is not kept in the save, so the reload of the big screen is not checked.
// <out>/report.json (report-video.json with --video) has every check, the captures, the errors and the acts. Exit code 1 when a check fails or an error is logged, 2 when the
// tool itself breaks. The page is served by the dev server; nothing is left running here but what the tool starts, which it stops.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { ROOT, FPS, launchBrowser, stopBrowser, startVideo, soundTap, collectSound, mixSound, sleep } from './veiddu-video.mjs';

const COVER_AFTER_MS = 20000; // protocol.js

function parseArgs(argv) {
  const o = { out: 'qa/remake/veiddu/t9', url: 'http://127.0.0.1:4256/remake/', seed: 't9', video: false, browser: 'edge', max: 1500, stall: 120, quick: false, kinds: 13 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = next();
    else if (a === '--url') o.url = next();
    else if (a === '--seed') o.seed = next();
    else if (a === '--video') o.video = true;
    else if (a === '--browser') o.browser = next();
    else if (a === '--max') o.max = Number(next());
    else if (a === '--stall') o.stall = Number(next());
    else if (a === '--quick') o.quick = true;
    else if (a === '--kinds') o.kinds = Number(next());
    else throw new Error(`Unknown argument ${a}`);
  }
  o.url = o.url.replace(/\/?$/, '/');
  o.width = 1280;
  o.height = 800;
  return o;
}

// ---- Pages ------------------------------------------------------------------------------------------------------------------------

/** A page in a browser context of its own (so its localStorage, and so its guest id, is its own), driven over the protocol. */
async function openPage(browser, { name, size, mobile, errors, onFrame = null, sound = false }) {
  const { cdp } = browser;
  const { browserContextId } = await cdp.send('Target.createBrowserContext');
  const page = { name, browserContextId, size, mobile, errors, onFrame, sound, closed: false };
  await attach(browser, page);
  return page;
}

async function attach(browser, page) {
  const { cdp } = browser;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: page.browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  Object.assign(page, { targetId, sessionId, closed: false });
  // a call that is not answered in 40 s (a page going away under it) is an error, not a wait for ever
  const send = (method, params) => Promise.race([cdp.send(method, params, sessionId), sleep(40000).then(() => { throw new Error(`${page.name}: ${method} was not answered in 40 s`); })]);
  page.send = send;
  page.ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`${page.name}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  cdp.handlers.add(msg => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      page.errors.push(`${page.name}: exception: ${d.exception?.description || d.text} @${d.url || ''}:${d.lineNumber}`.slice(0, 700));
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(msg.params.type)) {
      page.errors.push(`${page.name}: console.${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' ')}`.slice(0, 600));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const e = msg.params.entry;
      if (!/favicon\.ico/.test(e.url || e.text || '')) page.errors.push(`${page.name}: log.error: ${e.text} ${e.url || ''}`.slice(0, 600));
    } else if (msg.method === 'Page.screencastFrame') {
      page.onFrame?.(Buffer.from(msg.params.data, 'base64'), msg.params.metadata?.timestamp ? msg.params.metadata.timestamp * 1000 : Date.now());
      send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {});
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  if (page.sound) await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${soundTap.toString()})()` });
  await send('Emulation.setDeviceMetricsOverride', { width: page.size[0], height: page.size[1], deviceScaleFactor: 1, mobile: page.mobile });
  if (page.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}

const goto = (page, url) => page.send('Page.navigate', { url });
async function closePage(browser, page) {
  page.closed = true;
  await browser.cdp.send('Target.closeTarget', { targetId: page.targetId }).catch(() => {});
}

/** Waits until `expression` is true on the page (polled), at most `ms`. */
async function until(page, expression, label, ms = 60000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < ms) {
    try {
      last = await page.ev(expression);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await sleep(120);
  }
  throw new Error(`${page.name}: timed out after ${ms / 1000} s waiting for ${label} (${typeof last === 'string' ? last : JSON.stringify(last)})`);
}

/** A real mouse click in the middle of the element (it must be there and not under anything else), as a finger would tap it. */
async function click(page, selector, { timeout = 60000 } = {}) {
  const where = await until(page, `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    if (!e || e.hidden || e.disabled) return null;
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { x, y, hit: e.contains(document.elementFromPoint(x, y)) };
  })()`, `${selector} to be tappable`, timeout);
  if (!where.hit) throw new Error(`${page.name}: ${selector} is under something else`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: where.x, y: where.y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: where.x, y: where.y, button: 'left', clickCount: 1 });
  await sleep(40);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: where.x, y: where.y, button: 'left', clickCount: 1 });
}

async function shot(page, file) {
  const png = await page.send('Page.captureScreenshot', { format: 'png' });
  await fsp.writeFile(file, Buffer.from(png.data, 'base64'));
  return file;
}

// ---- The run ----------------------------------------------------------------------------------------------------------------------

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, o.out);
  await fsp.mkdir(outDir, { recursive: true });
  const errors = [];
  const report = { url: o.url, seed: o.seed, video: o.video, quick: o.quick, startedAt: new Date().toISOString(), checks: [], captures: [], errors, acts: [], stills: [], final: null };
  const check = text => { report.checks.push(text); console.log(`- ${text}`); };
  const still = async (page, name) => { const file = await shot(page, path.join(outDir, `${name}.png`)); report.stills.push(path.relative(ROOT, file).replace(/\\/g, '/')); return file; };
  const origin = new URL(o.url).origin;
  const browser = await launchBrowser({ browser: o.browser, width: o.width, height: o.height });
  const workDir = o.video ? await fsp.mkdtemp(path.join(os.tmpdir(), 'veiddu-fjolspil-')) : null;
  let fatal = null;
  let recorders = null;
  let sound = null;
  const lagSamples = [];
  try {
    const bigRec = o.video ? startVideo(path.join(workDir, 'big-silent.mp4'), 1280, 800) : null;
    const eRec = o.video ? startVideo(path.join(workDir, 'egill.mp4'), 390, 844) : null;
    recorders = { bigRec, eRec };
    const big = await openPage(browser, { name: 'big', size: [1280, 800], mobile: false, errors, sound: o.video, onFrame: bigRec ? (jpeg, at) => { lagSamples.push(Date.now() - at); bigRec.frame(jpeg, at); } : null });
    const egill = await openPage(browser, { name: 'egill', size: [390, 844], mobile: true, errors, onFrame: eRec ? (jpeg, at) => eRec.frame(jpeg, at) : null });
    const anna = o.quick ? null : await openPage(browser, { name: 'anna', size: [390, 844], mobile: true, errors });
    const phones = [egill, anna].filter(Boolean);

    // The big screen: the lab with the page's Fjölspil session; its setup card, then the lobby
    await goto(big, `${o.url}veiddu-lab.html?fjolspil=1&seed=${encodeURIComponent(o.seed)}&kinds=${o.kinds}`);
    await until(big, `window.__veiddu && window.__fjolspil && window.__veiddu.phase === 'setup'`, 'the setup card', 120000);
    check('the lab opens with the setup card');
    if (o.video) { // the recording begins with the card: the lobby, the phones joining and the round follow
      await big.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
      report.sound = { started: await big.ev('window.__snd.start()') };
    }
    const buttons = await big.ev(`[...document.querySelectorAll('.veiddu-setup-card button:not([hidden])')].map(b => b.textContent.trim()).filter(Boolean)`);
    assert.deepEqual(buttons, ['Spila við Uggeðlu og Mosa', 'Fjölspil'], 'no "Halda áfram" with nothing kept');
    await big.ev(`window.__acts = []; window.__fjolspil.onAct((seat, body) => window.__acts.push({ seat, body: JSON.parse(JSON.stringify(body)) })); true`);
    await click(big, '.veiddu-multi-button');
    await until(big, `!document.querySelector('#fjolspil .fjolspil-lobby').hidden`, 'the lobby');
    const code = await big.ev('window.__fjolspil.code');
    assert.match(code, /^[A-Z]{4}$/);
    const lobbyStates = await big.ev(`[...document.querySelectorAll('#fjolspil .fjolspil-seat')].map(e => e.getAttribute('data-state'))`);
    assert.deepEqual(lobbyStates, ['waiting', 'empty', 'empty', 'empty'], 'Egill\'s seat waits for his own device');
    assert.equal(await big.ev(`document.querySelector('#fjolspil .fjolspil-start').disabled`), true);
    check(`the lobby (${code}) shows Egill's seat waiting for his device, and "Byrjum!" waits`);
    await big.ev(`document.querySelectorAll('#fjolspil .fjolspil-note').forEach(e => { e.hidden = true; }); true`);
    await sleep(600);
    await still(big, 'lobby-waiting');

    const phoneUrl = `${origin}/remake/spil.html?r=${code}`;
    // Egill's phone: his portrait first, one tap
    await goto(egill, phoneUrl);
    await until(egill, `window.__spil && window.__spil.screen === 'join' && !document.querySelector('.spil-host').hidden`, 'Egill\'s portrait on the join screen');
    check('a phone that joins is offered Egill\'s portrait first ("Ég er Egill")');
    await still(egill, 'phone-join-egill');
    if (o.video) await egill.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
    await click(egill, '.spil-host');
    await until(egill, `window.__spil.screen === 'lobby'`, 'Egill\'s phone in the lobby');
    assert.equal(await egill.ev(`document.querySelector('.spil-me-name').textContent`), 'Egill');
    assert.deepEqual(await big.ev(`[...document.querySelectorAll('#fjolspil .fjolspil-seat')].slice(0, 2).map(e => e.getAttribute('data-state'))`), ['taken', 'empty']);
    assert.equal(await big.ev(`window.__fjolspil.seats.bySeat(0).kind + ' ' + (window.__fjolspil.seats.bySeat(0).guestId ? 'bound' : 'free')`), 'host bound');
    check('one tap binds his phone to seat 0 (still kind host, name Egill) and the big screen shows him seated');
    assert.equal(await big.ev(`document.querySelector('#fjolspil .fjolspil-start').disabled`), true, '"Byrjum!" needs a second seat');

    // Anna's phone: a name and a friend
    if (anna) {
      await goto(anna, phoneUrl);
      await until(anna, `window.__spil && window.__spil.screen === 'join'`, 'Anna\'s join screen');
      assert.equal(await anna.ev(`document.querySelector('.spil-host').hidden`), true, 'Egill\'s seat is taken: nobody else is offered it');
      await anna.ev(`(() => { const n = document.querySelector('.spil-name'); n.value = 'Anna'; n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await click(anna, '.spil-avatar[data-id="kambedla"]');
      await click(anna, '.spil-ready');
      await until(anna, `window.__spil.screen === 'lobby'`, 'Anna in the lobby');
      check('Anna joins with a name and a friend (and is not offered Egill\'s portrait)');
    }
    // Uggeðla is added, and "Byrjum!"
    await click(big, '#fjolspil .fjolspil-ai');
    await until(big, `window.__fjolspil.seats.list().some(s => s.kind === 'ai')`, 'Uggeðla seated');
    await sleep(700);
    await still(big, 'lobby-full');
    await click(big, '#fjolspil .fjolspil-start');
    const seatsAtStart = o.quick ? 2 : 3;
    await until(big, `window.__veiddu.fjolspil.isOn && window.__veiddu.fjolspil.seats === ${seatsAtStart}`, 'the round to begin');
    check(`"Byrjum!" seats ${seatsAtStart}: the big screen is the pond and the seats (no hand), Egill's phone has his own`);
    assert.equal(await big.ev(`document.querySelectorAll('.veiddu-multi .veiddu-place').length`), seatsAtStart);
    assert.equal(await big.ev(`!document.querySelector('.veiddu-hand') || document.querySelector('.veiddu-table').hidden`), true, 'no hand on the big screen');

    // ---- Playing -----------------------------------------------------------------------------------------------------------------
    const started = Date.now();
    const expected = []; // every act the phones sent, in order: { seat, body, legal }
    const taken = {};
    const seatOf = page => (page === egill ? 0 : 1);
    const view = page => page.ev('window.__spil && window.__spil.state ? JSON.parse(JSON.stringify(window.__spil.state)) : null');
    let phase = '';
    let lastChange = Date.now();
    let lastKey = '';
    let acts = 0;
    let dropped = false; // Anna's dropout was checked
    let egillReloaded = false;
    let bigReloaded = false;
    let illegalDone = false;
    let hadPond = false;
    let hadAsked = false;
    let beat = Date.now();

    const duty = async (page, need) => {
      const v = await until(page, `(() => { const s = window.__spil.state; return s && s.mode === ${JSON.stringify(need)} ? JSON.parse(JSON.stringify(s)) : null; })()`, `${page.name}'s phone to show "${need}"`, 20000);
      let body;
      if (need === 'ask') {
        const card = v.hand[acts % v.hand.length];
        const target = v.targets[acts % v.targets.length];
        await click(page, `.veiddu-card[data-id="${card.id}"]`);
        await sleep(250);
        await click(page, `.spil-veiddu-seat[data-seat="${target}"] .spil-veiddu-seat-hit`);
        body = { type: 'ask', target, kind: card.kind };
      } else if (need === 'give') {
        const card = v.hand.find(held => held.kind === v.asked.kind);
        await sleep(400);
        await click(page, `.veiddu-card[data-id="${card.id}"]`);
        body = { type: 'give', cardId: card.id };
      } else if (need === 'no') {
        await sleep(400);
        await click(page, '.spil-veiddu-no');
        body = { type: 'no' };
      } else {
        await sleep(300);
        await click(page, '.spil-veiddu-pond');
        body = { type: 'fish' };
      }
      expected.push({ seat: seatOf(page), body, legal: true });
      acts++;
      return v;
    };

    // The lobby's note about --lan is for the grown-up at a dev server on loopback: it is left out of the owner's stills
    const hideNote = () => big.ev(`document.querySelectorAll('#fjolspil .fjolspil-note').forEach(e => { e.hidden = true; }); true`);

    // What an illegal act may not change: the rules' game, and what the table waits for
    const gameState = () => big.ev(`JSON.stringify({ game: window.__veiddu.fjolspil.game, phase: window.__veiddu.phase })`);

    while (Date.now() - started < o.max * 1000) {
      const now = await big.ev(`({ phase: window.__veiddu.phase, log: window.__veiddu.fjolspil.game ? window.__veiddu.fjolspil.game.log.length : 0 })`).catch(error => { errors.push(`driver: ${error.message}`); return null; });
      if (!now) break;
      const key = `${now.phase}/${now.log}`;
      if (key !== lastKey) { lastKey = key; lastChange = Date.now(); }
      if (Date.now() - lastChange > o.stall * 1000) throw new Error(`the round stalled at "${now.phase}" after ${now.log} events (${o.stall} s)`);
      phase = now.phase;
      if (Date.now() - beat > 20000) { beat = Date.now(); console.log(`  [${Math.round((beat - started) / 1000)} s] ${phase}, ${now.log} events, ${acts} acts`); }
      if (phase === 'fjolspil over') break;
      const match = /^fjolspil (\d) (ask|fish|give|no)$/.exec(phase);
      if (match && taken[key] !== true) {
        const seat = Number(match[1]);
        const page = seat === 0 ? egill : anna;
        const need = match[2];
        if (page && !page.closed) {
          // the checks of the check run, at stable moments (the table waits for Egill to ask)
          if (!o.video && !o.quick && !illegalDone && seat === 0 && need === 'ask' && now.log > 14) {
            illegalDone = true;
            await illegalActs();
            lastChange = Date.now();
          }
          if (!o.video && !o.quick && !dropped && seat === 1 && need === 'ask' && now.log > (o.kinds === 13 ? 30 : 24)) {
            dropped = true;
            await dropout();
            lastChange = Date.now();
            continue;
          }
          if (!o.video && !egillReloaded && seat === 0 && need === 'ask' && (dropped || o.quick) && now.log > (o.kinds === 13 ? 60 : 50)) {
            egillReloaded = true;
            await reloadEgill();
            lastChange = Date.now();
            continue;
          }
          if (!o.video && o.kinds === 13 && !bigReloaded && seat === 0 && need === 'ask' && (egillReloaded || o.quick) && now.log > (o.quick ? 40 : 90)) {
            bigReloaded = true;
            await reloadBig();
            lastChange = Date.now();
            continue;
          }
          if (!hadPond && seat === 0 && need === 'ask' && now.log > 10) { // the pond with its seats, Egill's phone with its hand (a card lifted: the seats she may ask glow)
            hadPond = true;
            await sleep(1500); // the cue card is away
            await hideNote();
            await still(big, 'big-pond');
            await still(egill, 'phone-hand-ask');
            await click(egill, '.spil-veiddu-hand .veiddu-card');
            await sleep(500);
            await still(egill, 'phone-hand-picked');
            if (!o.video) { // the same phone on its side (844x390), for a moment
              await egill.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
              await sleep(900);
              await still(egill, 'phone-hand-landscape');
              await egill.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
              await sleep(500);
            }
          }
          if (!hadAsked && (need === 'give' || need === 'no') && now.log > 24) { // a guest being asked: her phone and the big screen's bubble
            hadAsked = true;
            await sleep(2200);
            await still(big, 'big-asked');
            await still(page, `phone-${page.name}-asked`);
          }
          await duty(page, need);
          taken[key] = true;
        }
      }
      await sleep(150);
    }
    phase = await big.ev('window.__veiddu.phase');
    assert.equal(phase, 'fjolspil over', `the round ended (the table says "${phase}")`);
    await sleep(2500);
    await still(big, 'big-win');
    for (const [k, p] of phones.entries()) await still(p, k === 0 ? 'phone-egill-end' : 'phone-anna-end');
    report.final = await big.ev(`(() => { const g = window.__veiddu.fjolspil.game; return { pairs: g.pairs.map(p => p.length), winners: g.winners, title: document.querySelector('.veiddu-win:not([hidden]) h2').textContent, sticker: !document.querySelector('.veiddu-win:not([hidden]) .veiddu-sticker').hidden, said: window.__veiddu.said.map(line => line.id), acts: window.__acts.length, save: window.__veidduSave.wins }; })()`);
    check(`the round ended: ${JSON.stringify(report.final.pairs)} pairs, "${report.final.title}"`);
    assert.equal(report.final.pairs.reduce((sum, n) => sum + n, 0), o.kinds * 2, `all ${o.kinds * 2} pairs are down`);

    // Every act the phones sent was heard once, in order (the big screen's own listener saw them as the host session delivered them)
    const heard = await big.ev('window.__acts');
    report.acts = heard;
    if (!o.video) {
      const mine = expected.map(e => `${e.seat}:${JSON.stringify(e.body)}`);
      const theirs = heard.map(e => `${e.seat}:${JSON.stringify(e.body)}`);
      assert.deepEqual(theirs, mine, 'what the big screen heard is what the phones sent, once each, in order');
      check(`every act a phone sent was heard once, in order (${heard.length} acts, ${expected.filter(e => !e.legal).length} of them refused)`);
    }

    if (o.video) await finishVideo();

    // ---- The check run's checks ----------------------------------------------------------------------------------------------------
    async function illegalActs() {
      const before = await gameState();
      const waitingFor = await big.ev('window.__veiddu.phase');
      const hand0 = (await view(egill)).hand;
      const held = hand0[0].kind;
      const lacking = ['froskur', 'skjaldbaka', 'drekafluga', 'snigill', 'salamandra', 'brunnklukka'].find(kind => !hand0.some(card => card.kind === kind));
      const tries = [
        [anna, { type: 'fish' }], [anna, { type: 'ask', target: 0, kind: 'froskur' }], [anna, { type: 'give', cardId: 'froskur-1' }], [anna, { type: 'no' }],
        [egill, { type: 'fish' }], [egill, { type: 'give', cardId: 'nothing-1' }], [egill, { type: 'no' }],
        [egill, { type: 'ask', target: 9, kind: held }], [egill, { type: 'ask', target: 0, kind: held }], [egill, { type: 'ask', target: 1, kind: lacking }],
        [egill, { type: 'ask', target: 1 }], [egill, 'ask'],
      ].filter(([page]) => page);
      const views = new Map();
      for (const page of phones) { await page.ev('window.__before = window.__spil.state; true'); views.set(page, true); }
      for (const [page, body] of tries) {
        await page.ev(`window.__spil.send(${JSON.stringify(body)})`);
        expected.push({ seat: seatOf(page), body, legal: false });
        await sleep(180);
      }
      await sleep(900);
      assert.equal(await gameState(), before, 'the rules\' game is as it was');
      assert.equal(await big.ev('window.__veiddu.phase'), waitingFor, 'the table still waits for the same seat');
      for (const page of phones) assert.equal(await page.ev('window.__spil.state !== window.__before'), true, `${page.name}'s phone was sent its view again`);
      check(`${tries.length} acts that are not allowed (out of turn, to oneself, a card not held, a seat that is not there, junk) changed nothing, and the phones were sent their views again`);
    }

    async function dropout() {
      const wait = await big.ev('window.__veiddu.phase');
      assert.equal(wait, 'fjolspil 1 ask');
      await closePage(browser, anna); // her phone goes
      await until(big, `window.__veiddu.phase === 'fjolspil away 1'`, 'the table to wait for Anna', 40000);
      await until(big, `!!document.querySelector('#fjolspil .fjolspil-wait')`, 'the waiting card');
      await sleep(500);
      const words = await big.ev(`document.querySelector('#fjolspil .fjolspil-wait-words').textContent`);
      assert.equal(words, 'Bíðum eftir Anna…');
      const letters = await big.ev(`[...document.querySelectorAll('#fjolspil .fjolspil-wait .fjolspil-letter')].map(e => e.textContent).join('')`);
      assert.equal(letters, code, 'the same letters to type');
      assert.equal(await big.ev(`!!document.querySelector('#fjolspil .fjolspil-wait .fjolspil-qr svg')`), true, 'and the QR code');
      assert.equal(await big.ev(`!document.querySelector('#fjolspil .fjolspil-continue')`), true, '"Halda áfram án …" is not there at once');
      await still(big, 'big-dropout-card');
      check(`Anna's phone went on her turn: the table waits over the board, "${words}" with the QR code and the letters ${letters}`);
      const t = Date.now();
      await until(big, `!!document.querySelector('#fjolspil .fjolspil-continue')`, '"Halda áfram án Anna"', COVER_AFTER_MS + 15000);
      assert.ok(Date.now() - t >= COVER_AFTER_MS - 5000, 'it comes after 20 s of waiting');
      assert.equal(await big.ev(`document.querySelector('#fjolspil .fjolspil-continue').textContent`), 'Halda áfram án Anna');
      await still(big, 'big-dropout-continue');
      await click(big, '#fjolspil .fjolspil-continue');
      await until(big, `!document.querySelector('#fjolspil .fjolspil-wait')`, 'the card to go');
      assert.equal(await big.ev(`window.__fjolspil.seats.bySeat(1).covered`), true);
      check('after 20 s "Halda áfram án Anna" made the computer play her seat');
      // the computer plays her turn (a mild mind): the phase goes on without her
      await until(big, `window.__veiddu.fjolspil.game.turn !== 1 || window.__veiddu.phase !== 'fjolspil busy'`, 'the computer to play her turn', 30000);
      // she comes back in the same browser context (the same guest id)
      await attach(browser, anna);
      await goto(anna, phoneUrl);
      await until(anna, `window.__spil && (window.__spil.screen === 'game' || window.__spil.screen === 'lobby')`, 'Anna\'s phone to find her seat again', 40000);
      await until(big, `window.__fjolspil.seats.bySeat(1).present === true`, 'her seat present again');
      check('Anna came back in the same browser: the big screen has her seat present again');
    }

    async function reloadEgill() {
      const before = await view(egill);
      await egill.send('Page.reload');
      await until(egill, `window.__spil && window.__spil.screen === 'game' && window.__spil.state && window.__spil.state.hand.length > 0`, 'Egill\'s phone to find its seat and hand again', 40000);
      const after = await view(egill);
      assert.equal(after.seat, 0);
      assert.deepEqual(after.hand.map(card => card.id), before.hand.map(card => card.id), 'the same hand');
      check('Egill\'s phone, reloaded in the middle of a round, found his seat and his own hand again by its kept id');
    }

    async function reloadBig() {
      const kept = JSON.parse(await big.ev(`JSON.stringify({ pond: window.__veiddu.fjolspil.game.pond.map(c => c.id), hands: window.__veiddu.fjolspil.game.hands.map(h => h.map(c => c.id)), pairs: window.__veiddu.fjolspil.game.pairs, turn: window.__veiddu.fjolspil.game.turn, phase: window.__veiddu.fjolspil.game.phase })`));
      // wait for a stable moment: the table waits for a phone, so nothing is under way
      await big.send('Page.reload');
      await until(big, `window.__veiddu && window.__fjolspil && window.__veiddu.phase === 'setup'`, 'the setup card after the reload', 120000);
      await big.ev(`window.__acts = []; window.__fjolspil.onAct((seat, body) => window.__acts.push({ seat, body: JSON.parse(JSON.stringify(body)) })); true`);
      assert.equal(await big.ev(`!document.querySelector('.veiddu-continue').hidden`), true, '"Halda áfram" is on the card');
      await still(big, 'big-continue');
      await click(big, '.veiddu-continue');
      await until(big, `window.__veiddu.fjolspil.isOn`, 'the kept round to be taken up', 60000);
      const now = JSON.parse(await big.ev(`JSON.stringify({ pond: window.__veiddu.fjolspil.game.pond.map(c => c.id), hands: window.__veiddu.fjolspil.game.hands.map(h => h.map(c => c.id)), pairs: window.__veiddu.fjolspil.game.pairs, turn: window.__veiddu.fjolspil.game.turn, phase: window.__veiddu.fjolspil.game.phase })`));
      assert.deepEqual(now, kept, 'the round is taken up where it was');
      check('the big screen reloaded in the middle of a round: "Halda áfram" took the kept round up exactly where it was (same hands, pond, pairs and turn)');
      // the heard acts now start afresh on the new page: compare only what comes after
      expected.length = 0;
      report.reloadedAt = acts;
    }

    // The video: the big screen with its sound beside Egill's phone, side by side (the later of the two recordings put off by when each began)
    async function finishVideo() {
      await sleep(4000); // the win card, the sticker and the confetti are in
      await big.send('Page.stopScreencast').catch(() => {});
      await egill.send('Page.stopScreencast').catch(() => {});
      sound = await collectSound(big.ev, workDir, workDir).catch(error => { errors.push(`sound: ${error.message}`.slice(0, 600)); return null; });
      const bigVideo = await recorders.bigRec.finish();
      const eVideo = await recorders.eRec.finish();
      assert.ok(!bigVideo.error && !eVideo.error, `the recordings are made (${bigVideo.error ?? eVideo.error ?? ''})`);
      const silent = path.join(workDir, 'big-silent.mp4');
      const withSound = path.join(workDir, 'big.mp4');
      report.soundReport = mixSound(sound, recorders.bigRec.video, lagSamples, silent, withSound, workDir);
      const offset = (recorders.eRec.video.t0 - recorders.bigRec.video.t0) / 1000;
      const out = path.join(outDir, 'fjolspil.mp4');
      const args = ['-y', '-loglevel', 'error', '-i', withSound, '-itsoffset', offset.toFixed(3), '-i', path.join(workDir, 'egill.mp4'),
        '-filter_complex', '[1:v]scale=-2:800[p];[0:v]pad=1650:800:0:0:color=0x24201b[b];[b][p]overlay=1280:0:eof_action=pass[v]',
        '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p', '-c:a', 'copy', out];
      const made = spawnSync('ffmpeg', args, { encoding: 'utf8' });
      if (made.status !== 0) throw new Error(`ffmpeg could not put the two side by side: ${String(made.stderr).slice(0, 500)}`);
      let bytes = fs.statSync(out).size;
      report.video = { file: path.relative(ROOT, out).split(path.sep).join('/'), bytes, seconds: +(bigVideo.written / FPS).toFixed(1), offsetSeconds: +offset.toFixed(2), frames: bigVideo.written };
      if (bytes > 30 * 1024 * 1024) { // under 30 MiB: a smaller copy, which is then the one to send
        const small = path.join(outDir, 'fjolspil-small.mp4');
        const again = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-vf', 'scale=1100:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', small], { encoding: 'utf8' });
        if (again.status === 0) { report.video.small = { file: path.relative(ROOT, small).split(path.sep).join('/'), bytes: fs.statSync(small).size }; }
      }
      check(`the video: ${report.video.file} (${report.video.seconds} s, ${(bytes / 1048576).toFixed(1)} MiB)`);
    }
  } catch (error) {
    fatal = error;
    errors.push(`driver: ${error.stack || error.message}`.slice(0, 1200));
  } finally {
    await stopBrowser(browser);
    if (fatal) console.error(fatal.stack || fatal.message);
    report.finishedAt = new Date().toISOString();
    await fsp.writeFile(path.join(outDir, o.video ? 'report-video.json' : 'report.json'), JSON.stringify(report, null, 2));
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
  console.log(`${fatal ? 'FAILED' : 'DONE'}: ${report.checks.length} checks, ${errors.length} errors; report ${path.relative(ROOT, path.join(outDir, o.video ? 'report-video.json' : 'report.json')).replace(/\\/g, '/')}`);
  for (const e of errors.slice(0, 12)) console.log(`  error: ${e}`);
  process.exitCode = fatal ? 1 : errors.length ? 1 : 0;
}

main().catch(error => { console.error(error); process.exit(2); });

// Run against the existing loopback-only offline acceptance application.
// Generated audio and local identity fixtures only; no Stripe payment is created.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.MUSICBAT_PLAYWRIGHT_MODULE ?? '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const origin = new URL(process.env.MUSICBAT_ACCEPTANCE_ORIGIN ?? 'http://127.0.0.1:5173');
if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) || origin.pathname !== '/' || origin.username || origin.password) {
  throw new Error('Only the existing loopback offline acceptance application is allowed.');
}
const evidence = { scope: 'actual Vinext application with offline generated-audio fixtures', checks: [], errors: [], consoleErrors: [], failedRequests: [], requests: [], responses: [] };
let browser;
const started = performance.now();
async function check(name, action) {
  const began = performance.now();
  await action();
  evidence.checks.push({ name, milliseconds: Math.round(performance.now() - began) });
  console.log('PASS', name);
}
try {
  browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.MUSICBAT_CHROMIUM_PATH ?? playwright.chromium.executablePath(), args: ['--no-sandbox'] });
  evidence.browser = browser.version();
  const context = await browser.newContext();
  const marker = await context.request.get(new URL('/__local', origin).href);
  assert.equal(marker.status(), 200);
  assert.match(await marker.text(), /MusicBat offline acceptance/);
  const login = await context.request.post(new URL('/__local/login', origin).href, { form: { role: 'musician' }, headers: { origin: origin.origin }, maxRedirects: 0 });
  assert.equal(login.status(), 303);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  page.on('requestfailed', request => evidence.failedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }));
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/')) evidence.responses.push({ path, status: response.status() });
  });
  page.on('requestfinished', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      const timing = request.timing();
      evidence.requests.push({ path: new URL(request.url()).pathname, milliseconds: Math.round(timing.responseEnd) });
    }
  });
  await page.addInitScript(() => {
    window.musicbatPlaybackEvents = [];
    for (const name of ['play', 'playing', 'pause', 'waiting', 'stalled', 'error', 'loadedmetadata', 'timeupdate', 'seeking', 'seeked', 'emptied']) {
      document.addEventListener(name, event => {
        if (event.target instanceof HTMLMediaElement && window.musicbatPlaybackEvents.length < 300) {
          window.musicbatPlaybackEvents.push({ name, at: Math.round(performance.now()), time: event.target.currentTime, ready: event.target.readyState, error: event.target.error?.code ?? null });
        }
      }, true);
    }
  });
  await check('application loads authorized Free Radio and decodes audible PCM', async () => {
    await page.goto(origin.href, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForFunction(() => !!document.querySelector('audio')?.getAttribute('src'));
    await page.evaluate(() => {
      const audio = document.querySelector('audio');
      window.musicbatOriginalAudio = audio;
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio), analyser = context.createAnalyser();
      source.connect(analyser); analyser.connect(context.destination);
      window.musicbatAnalyser = { context, analyser };
      document.querySelector('button[aria-label="Play Radio"]').addEventListener('click', () => void context.resume(), { once: true });
    });
    await page.getByRole('button', { name: 'Play Radio', exact: true }).click();
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio'), { context, analyser } = window.musicbatAnalyser;
      const values = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(values);
      return !audio.paused && audio.readyState >= 2 && context.state === 'running' && Math.max(...values) - Math.min(...values) > 10;
    });
    assert.match(await page.locator('audio').getAttribute('src'), /^\/api\/musicbat\/channel\/audio\?/);
  });
  await check('mute, volume, pause and resume respond in the application', async () => {
    await page.getByRole('button', { name: 'Mute Radio', exact: true }).click();
    assert.equal(await page.locator('audio').evaluate(audio => audio.muted), true);
    await page.getByRole('button', { name: 'Unmute Radio', exact: true }).click();
    await page.getByRole('slider', { name: 'Volume', exact: true }).fill('0.35');
    assert.equal(await page.locator('audio').evaluate(audio => audio.volume), 0.35);
    await page.getByRole('button', { name: 'Pause Radio', exact: true }).click();
    assert.equal(await page.locator('audio').evaluate(audio => audio.paused), true);
    await page.getByRole('button', { name: 'Play Radio', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('audio').paused);
  });
  await check('screen navigation and the artist route preserve the one live player', async () => {
    for (const name of ['Discover Artists', 'Manage Songs', 'Add Track', 'Shock Room', 'Radio']) {
      const tab = page.getByRole('tab', { name, exact: true });
      await tab.click();
      assert.equal(await tab.getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('audio').count(), 1);
      assert.equal(await page.evaluate(() => window.musicbatOriginalAudio === document.querySelector('audio')), true);
    }
    await page.getByRole('tab', { name: 'Discover Artists', exact: true }).click();
    const artist = page.locator('article a').filter({ hasText: 'Local test musician' }).first();
    const target = await artist.getAttribute('href');
    assert.match(target, /^\/[^/?]+$/);
    await artist.click();
    await page.waitForURL(new URL(target, origin).href);
    assert.equal(await page.evaluate(() => window.musicbatOriginalAudio === document.querySelector('audio')), true);
    await page.getByRole('link', { name: 'Open Radio', exact: true }).click();
    await page.getByRole('tab', { name: 'Radio', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('[role="tab"][data-state="active"]')?.textContent.trim() === 'Radio');
    assert.equal(await page.evaluate(() => window.musicbatOriginalAudio === document.querySelector('audio')), true);
    assert.equal(await page.locator('audio').evaluate(audio => audio.volume), 0.35);
    const before = await page.locator('audio').evaluate(audio => audio.currentTime);
    await page.waitForFunction(before => document.querySelector('audio').currentTime > before + 0.2, before);
  });
  await check('unauthenticated Radio is denied and browser reports no application errors', async () => {
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.get(new URL('/api/musicbat/channel', origin).href)).status(), 401);
    await anonymous.close();
    assert.deepEqual(evidence.errors, []);
    assert.deepEqual(evidence.consoleErrors, []);
    assert.deepEqual(evidence.responses.filter(response => response.status >= 400), []);
    assert.ok(evidence.responses.some(response => response.path === '/api/musicbat/channel/audio' && [200, 206].includes(response.status)));
    // Media seeks and client navigation may cancel an obsolete request normally.
    assert.deepEqual(evidence.failedRequests.filter(request => request.error !== 'net::ERR_ABORTED'), []);
  });
  evidence.playback = await page.evaluate(() => ({ events: window.musicbatPlaybackEvents, currentTime: document.querySelector('audio').currentTime, readyState: document.querySelector('audio').readyState, mediaError: document.querySelector('audio').error?.code ?? null }));
  console.log(JSON.stringify({ passed: evidence.checks.length, failed: 0, browser: evidence.browser }));
} catch (error) {
  evidence.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  evidence.milliseconds = Math.round(performance.now() - started);
  await mkdir('.sites-runtime', { recursive: true });
  await writeFile('.sites-runtime/application-browser-evidence.json', JSON.stringify(evidence, null, 2));
  await browser?.close();
}

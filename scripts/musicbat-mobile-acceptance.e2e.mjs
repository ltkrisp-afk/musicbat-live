// Browser acceptance only: existing loopback fixture application, no hosted writes.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const playwright = require(process.env.MUSICBAT_PLAYWRIGHT_MODULE ?? 'playwright');
const origin = new URL(process.env.MUSICBAT_ACCEPTANCE_ORIGIN ?? 'http://127.0.0.1:5173');
if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) || origin.pathname !== '/' || origin.username || origin.password)
  throw new Error('Only loopback fixture acceptance is allowed.');
const evidence = { scope: 'Chromium actual application with generated local fixtures', checks: [], errors: [] };
let browser;
try {
  await mkdir('.sites-runtime', { recursive: true });
  browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox'] });
  evidence.browser = browser.version();
  const context = await browser.newContext();
  const marker = await context.request.get(new URL('/__local', origin).href);
  assert.equal(marker.status(), 200);
  assert.match(await marker.text(), /MusicBat offline acceptance/);
  assert.equal((await context.request.post(new URL('/__local/login', origin).href, { form: { role: 'musician' }, headers: { origin: origin.origin }, maxRedirects: 0 })).status(), 303);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.goto(origin.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('tab', { name: 'Radio', exact: true }).click();
  const console = page.getByRole('region', { name: 'Bat Radio Retrofutura console', exact: true });
  await console.waitFor();
  const knob = console.getByRole('button', { name: 'Push dial to tune category', exact: true });
  for (const width of [320, 375, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await knob.scrollIntoViewIfNeeded();
    assert.equal(await knob.isVisible(), true);
    assert.equal(await page.getByRole('link', { name: 'MusicBat', exact: true }).first().isVisible(), true);
    const box = await console.boundingBox(), dial = await knob.boundingBox();
    assert.ok(box && dial);
    assert.ok(box.x >= -1 && box.x + box.width <= width + 1, 'console exceeds viewport at ' + width);
    assert.ok(dial.x >= box.x && dial.x + dial.width <= box.x + box.width + 1, 'dial exceeds console at ' + width);
    assert.ok(dial.width >= 87 && dial.width <= 113);
    for (const label of ['GENRE', 'SUBGENRE', 'STYLE']) assert.equal(await console.getByText(label, { exact: true }).isVisible(), true);
    assert.equal(await console.getByRole('button', { name: 'Turn dial backward', exact: true }).isVisible(), true);
    assert.equal(await console.getByRole('button', { name: 'Turn dial forward', exact: true }).isVisible(), true);
    await page.screenshot({ path: '.sites-runtime/mobile-' + width + '.png', fullPage: true });
    evidence.checks.push({ width, consoleWidth: box.width, dialWidth: dial.width, dialLocked: await knob.isDisabled() });
  }
  // Exercise the physical dial only after the existing fixture's signed invoice
  // unlocks Plus. This is a simulated subscription; no Stripe API is called.
  await console.getByRole('button', { name: 'Join Radio Plus · $3/month', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Radio Plus', exact: true });
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Continue to test checkout', exact: true }).click();
  await page.waitForURL('**/__local/plus-checkout/**');
  await page.getByRole('button', { name: 'Simulate successful subscription payment', exact: true }).click();
  await page.getByRole('tab', { name: 'Radio', exact: true }).click();
  await page.waitForFunction(() => {
    const button = document.querySelector('button[aria-label="Push dial to tune category"]');
    return button && !button.disabled;
  });
  await knob.press('ArrowRight');
  await console.getByText('Rock', { exact: true }).waitFor();
  for (const category of [
    { genre: 'Rock' },
    { genre: 'Rock', subgenre: 'Punk' },
    { genre: 'Rock', subgenre: 'Punk', style: 'Hardcore' },
  ]) {
    const responsePromise = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/musicbat/channel' && response.request().method() === 'POST');
    await knob.click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    assert.deepEqual(response.request().postDataJSON(), { category });
    assert.deepEqual((await response.json()).snapshot.category, category);
  }
  const freeResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/musicbat/channel' && response.request().method() === 'POST');
  await console.getByRole('button', { name: 'Free Radio · continuous discovery', exact: true }).click();
  assert.equal((await (await freeResponse).json()).snapshot.category, null);
  assert.equal(await page.locator('audio').count(), 1);
  await page.screenshot({ path: '.sites-runtime/mobile-dial-plus.png', fullPage: true });
  evidence.checks.push({ name: 'signed fixture membership unlocks physical Genre/Subgenre/Style push dial and returns to Free Radio', simulatedSubscription: true });
  assert.deepEqual(evidence.errors, []);
  process.stdout.write(JSON.stringify({ passed: evidence.checks.length, failed: 0, checks: evidence.checks }) + '\n');
} catch (error) {
  evidence.failure = error.stack;
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
} finally {
  await writeFile('.sites-runtime/mobile-browser-evidence.json', JSON.stringify(evidence, null, 2));
  await browser?.close();
}

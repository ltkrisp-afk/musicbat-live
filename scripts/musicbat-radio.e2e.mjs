import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { localStack } from '../e2e/local-stack.mjs';
import { seedRuntime } from '../e2e/fixtures.mjs';
const require=createRequire(import.meta.url);
let playwright;
try {playwright=require('playwright')} catch {playwright=require(process.env.MUSICBAT_PLAYWRIGHT_MODULE??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')}
const dir=await mkdtemp(join(tmpdir(),'musicbat-browser-'));
let stack,browser;const results=[];
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name)}
async function metrics(page){return page.locator('audio').evaluate(a=>({paused:a.paused,time:a.currentTime,ready:a.readyState,src:a.getAttribute('src'),error:a.error?.code??null}))}
async function waitPlaying(page){await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&!a.paused&&a.currentTime>0.2&&a.readyState>=2},{},{timeout:15000})}
async function contextFor(id) {
 const context=await browser.newContext();await context.addCookies([{name:'bat_test_session',value:stack.session(id),url:stack.origin}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(stack.origin);await page.getByRole('button',{name:'Play Radio',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('button[aria-label="Play Radio"]').disabled);
 return {context,page,errors};
}
try {
 stack=await localStack({databasePath:join(dir,'radio.sqlite'),assetRoot:dir});await seedRuntime(stack.runtime,dir,{durationMs:30000});stack.runtime.start();
 browser=await playwright.chromium.launch({headless:true,executablePath:process.env.MUSICBAT_CHROMIUM_PATH??playwright.chromium.executablePath(),args:['--no-sandbox']});
 const one=await contextFor('listener-one'),two=await contextFor('listener-two');
 await check('press Play decodes authorized PCM audio and advances playback',async()=>{
  await one.page.evaluate(()=>{
   const a=document.querySelector('audio');const ctx=new AudioContext();const source=ctx.createMediaElementSource(a);const analyser=ctx.createAnalyser();source.connect(analyser);analyser.connect(ctx.destination);
   window.testAnalyser={ctx,analyser};document.querySelector('button[aria-label="Play Radio"]').addEventListener('click',()=>void ctx.resume(),{once:true});
  });
  await one.page.getByRole('button',{name:'Play Radio',exact:true}).click();await waitPlaying(one.page);
  await one.page.waitForFunction(()=>{const {ctx,analyser}=window.testAnalyser;const b=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(b);return ctx.state==='running'&&Math.max(...b)-Math.min(...b)>10});
  assert.equal((await metrics(one.page)).error,null);
 });
 await check('two independent authenticated browsers share performance and stay within 350ms',async()=>{
  await two.page.getByRole('button',{name:'Play Radio',exact:true}).click();await waitPlaying(two.page);
  assert.equal(await one.page.getByTestId('performance').textContent(),await two.page.getByTestId('performance').textContent());
  const values=await Promise.all([metrics(one.page),metrics(two.page)]);const drift=Math.abs(values[0].time-values[1].time);assert.ok(drift<=0.35,'initial drift '+drift);
  await one.page.waitForTimeout(1200);const next=await Promise.all([metrics(one.page),metrics(two.page)]);const laterDrift=Math.abs(next[0].time-next[1].time);assert.ok(laterDrift<=0.35,'sustained drift '+laterDrift);console.log('Measured drift seconds:',{initial:drift,sustained:laterDrift});
 });
 await check('Genre → Subgenre → Style switching uses real channel audio and no individual track commands',async()=>{
  await one.page.getByLabel('Radio genre',{exact:true}).selectOption('Rock');await waitPlaying(one.page);
  await one.page.getByLabel('Radio subgenre',{exact:true}).selectOption('Punk');await waitPlaying(one.page);
  await one.page.getByLabel('Radio style',{exact:true}).selectOption('Hardcore');await waitPlaying(one.page);
  assert.match(await one.page.getByTestId('performance').textContent(),/^hardcore:/);
  await two.page.getByLabel('Radio genre',{exact:true}).selectOption('Rock');await waitPlaying(two.page);
  await two.page.getByLabel('Radio subgenre',{exact:true}).selectOption('Punk');await waitPlaying(two.page);
  await two.page.getByLabel('Radio style',{exact:true}).selectOption('Hardcore');await waitPlaying(two.page);
  const v=await Promise.all([metrics(one.page),metrics(two.page)]);assert.ok(Math.abs(v[0].time-v[1].time)<=0.35);
 });
 await check('pause/resume rejoins server position without resetting the shared performance',async()=>{
  const key=await one.page.getByTestId('performance').textContent();await one.page.getByRole('button',{name:'Pause Radio'}).click();
  await one.page.waitForTimeout(500);assert.equal((await metrics(one.page)).paused,true);
  await one.page.getByRole('button',{name:'Play Radio'}).click();await waitPlaying(one.page);assert.equal(await one.page.getByTestId('performance').textContent(),key);
 });
 await check('network failure unloads audio; reconnect restores shared authority and current position',async()=>{
  await one.page.route('**/api/musicbat/**',route=>route.abort());
  await one.page.waitForFunction(()=>!document.querySelector('audio').getAttribute('src'),{},{timeout:5000});
  assert.equal((await metrics(one.page)).paused,true);await one.page.unroute('**/api/musicbat/**');
  await waitPlaying(one.page);const v=await Promise.all([metrics(one.page),metrics(two.page)]);assert.ok(Math.abs(v[0].time-v[1].time)<=0.35);
 });
 await check('withdrawal stops assigned audio, switches both listeners, and rejects stale byte ranges',async()=>{
  const old=await metrics(one.page);const id=await one.page.getByTestId('track').textContent();stack.runtime.withdraw(id,'browser withdrawal fixture');
  await one.page.waitForFunction(old=>document.querySelector('[data-testid="track"]').textContent!==old,id);await waitPlaying(one.page);await waitPlaying(two.page);
  await two.page.waitForFunction(old=>document.querySelector('[data-testid="track"]').textContent!==old,id);
  assert.equal((await one.context.request.get(stack.origin+old.src,{headers:{range:'bytes=0-100'}})).status(),409);
 });
 await check('empty catalog becomes silence in both browsers without bypass',async()=>{
  for(const id of ['a','b','c'])stack.runtime.withdraw(id,'empty-catalog fixture');
  for(const p of [one.page,two.page])await p.waitForFunction(()=>!document.querySelector('audio').getAttribute('src'));
  assert.equal((await metrics(one.page)).paused,true);assert.equal((await metrics(two.page)).paused,true);
 });
 await check('public forgery, cross-origin mutation and legacy audio requests cannot deliver audio',async()=>{
  const anon=await browser.newContext();
  assert.equal((await anon.request.get(stack.origin+'/api/musicbat/channel',{headers:{'x-musicbat-listener':'listener-one','oai-authenticated-user-id':'listener-one'}})).status(),401);
  assert.equal((await one.context.request.post(stack.origin+'/api/musicbat/channel',{headers:{origin:'https://attacker.invalid'},data:{category:null}})).status(),403);
  assert.equal((await one.context.request.get(stack.origin+'/api/musicbat/audio/a.wav')).status(),410);await anon.close();
 });
 assert.deepEqual(one.errors,[]);assert.deepEqual(two.errors,[]);
 console.log(JSON.stringify({passed:results.length,failed:0,checks:results},null,2));
} finally {await browser?.close();await stack?.close();await rm(dir,{recursive:true,force:true})}

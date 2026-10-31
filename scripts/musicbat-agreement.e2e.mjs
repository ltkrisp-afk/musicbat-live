// Actual local application UI; exact terms are a deliberate browser fixture.
// Does not activate an agreement in any database or execute an artist license.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {directLicenseFinal} from '../lib/direct-license-final.ts';
const require=createRequire(import.meta.url),pw=require(process.env.MUSICBAT_PLAYWRIGHT_MODULE??'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=new URL(process.env.MUSICBAT_ACCEPTANCE_ORIGIN??'http://127.0.0.1:5173');
if(origin.protocol!=='http:'||!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Loopback offline acceptance only');
const evidence={scope:'Chromium application UI with exact-text nonoperative agreement fixture',checks:[],errors:[]};let browser;
try{
 browser=await pw.chromium.launch({headless:true,executablePath:process.env.MUSICBAT_CHROMIUM_PATH??pw.chromium.executablePath(),args:['--no-sandbox']});
 const context=await browser.newContext();assert.equal((await context.request.get(new URL('/__local',origin).href)).status(),200);
 assert.equal((await context.request.post(new URL('/__local/login',origin).href,{form:{role:'musician'},headers:{origin:origin.origin},maxRedirects:0})).status(),303);
 const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
 const a=directLicenseFinal;
 await page.route('**/api/musicbat/agreement',async route=>{
  const post=route.request().method()==='POST';if(post)assert.deepEqual(route.request().postDataJSON(),{version:a.version,sha256:a.sha256});
  await route.fulfill({json:{agreement:{version:a.version,sha256:a.sha256,body:a.body,acceptance_text:a.acceptance_text},...(post?{reviewReceiptId:'SYNTHETIC_BROWSER_ONLY',reviewedAt:Date.now()}:{})}});
 });
 await page.goto(origin.href);await page.getByRole('tab',{name:'Add Track',exact:true}).click();
 const review=page.getByRole('button',{name:'Review Direct Licensing Agreement',exact:true});
 const acceptance=page.getByRole('checkbox',{name:/I own or control the necessary rights/});
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});assert.equal(await acceptance.isChecked(),false);assert.equal(await acceptance.isDisabled(),true);
  await review.focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor();
  assert.ok((await dialog.innerText()).includes(a.body));assert.ok((await dialog.innerText()).includes('Version '+a.version));
  const box=await dialog.boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1);assert.ok(box.height<=900*.85+2);
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);}
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await review.evaluate(el=>el===document.activeElement),true);
  assert.equal(await acceptance.isChecked(),false);evidence.checks.push({name:'exact terms, six schedules, responsive dialog, focus trap and Escape return',width});
 }
 await page.getByRole('checkbox',{name:/I consent to electronic contracting/}).check();await page.getByRole('checkbox',{name:/I can save the supplied UTF-8 text/}).check();
 assert.equal(await acceptance.isEnabled(),true);assert.equal(await acceptance.isChecked(),false);await acceptance.check();assert.equal(await acceptance.isChecked(),true);
 evidence.checks.push({name:'review and separate confirmations never substitute for affirmative acceptance'});assert.deepEqual(evidence.errors,[]);
 console.log(JSON.stringify({passed:evidence.checks.length,failed:0}));
}catch(error){evidence.failure=String(error.stack);console.error(error.stack);process.exitCode=1;}
finally{await mkdir('.sites-runtime',{recursive:true});await writeFile('.sites-runtime/agreement-browser-evidence.json',JSON.stringify(evidence,null,2));await browser?.close();}

import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.MUSICBAT_PLAYWRIGHT_MODULE||'playwright');
const output=process.env.MUSICBAT_DESIGN_OUTPUT||'.sites-runtime/design-screenshots';await mkdir(output,{recursive:true});
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.MUSICBAT_CHROMIUM_PATH,args:['--no-sandbox']});
let checks=0; const check=(condition)=>{assert.ok(condition);checks++};
try {
 const page=await browser.newPage({viewport:{width:1440,height:1250}});page.setDefaultTimeout(10000);console.log('browser ready');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.MUSICBAT_DESIGN_URL||'http://127.0.0.1:4199/design-preview'),{waitUntil:'domcontentloaded'});console.log('loaded');await page.getByRole('button',{name:'Play Radio',exact:true}).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')==='Play Radio'&&Object.keys(b).some(k=>k.startsWith('__reactProps'))));console.log('hydrated');
 await page.getByRole('button',{name:'Play Radio',exact:true}).click();await page.getByRole('button',{name:'Pause Radio',exact:true}).waitFor();check(true);
 await page.getByRole('button',{name:'Mute Radio',exact:true}).click();await page.getByRole('button',{name:'Unmute Radio',exact:true}).waitFor();check(true);
 await page.getByRole('button',{name:'Unmute Radio',exact:true}).click();
 await page.getByRole('slider',{name:'Volume',exact:true}).fill('0.4');check(await page.getByRole('slider',{name:'Volume',exact:true}).inputValue()==='0.4');
 const dial=page.getByRole('button',{name:'Push dial to tune category'});await dial.press('ArrowRight');await dial.press('Enter');await page.getByText('Shared channel tuned.',{exact:true}).waitFor();check((await page.getByRole('status').allTextContents()).some(s=>s.includes('tuned')));
 check(await page.locator('.mb-tone-knob').count()===0);check(await page.getByRole('img',{name:'OUTPUT SETTING: 40 percent'}).count()===1);
 await page.screenshot({path:output+'/musicbat-stereo-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Pause Radio',exact:true}).click();check(await page.getByRole('button',{name:'Play Radio',exact:true}).isVisible());
 for(const width of [320,390,768]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:1000});await page.screenshot({path:output+'/musicbat-stereo-mobile.png',fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});check(await page.locator('.mb-tuning-needle').evaluate(e=>getComputedStyle(e).transitionDuration)==='0s');check(errors.length===0);
 console.log(JSON.stringify({passed:checks,failed:0,pageErrors:errors}));
}finally{await browser.close();}

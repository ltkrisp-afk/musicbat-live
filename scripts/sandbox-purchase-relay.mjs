// Genuine Stripe CLI relay. Signing secret stays in memory, never chat/logs/files.
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {start} from './sandbox-purchase.mjs';

export function signingSecret(output){
 const matches=String(output).match(/\bwhsec_[A-Za-z0-9_]+\b/g)??[];
 if(matches.length!==1)throw Error('Stripe CLI did not return exactly one signing secret.');
 return matches[0];
}
export function redact(line){return line.replace(/\b(?:whsec_|[rs]k_(?:test|live)_)[A-Za-z0-9_]+\b/g,'[secret hidden]');}
export function cliEnvironment(env){return Object.fromEntries(Object.entries(env).filter(([key])=>!key.startsWith('STRIPE_')));}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 process.chdir(fileURLToPath(new URL('../',import.meta.url)));
 const cliEnv=cliEnvironment(process.env);
 const listing=spawnSync('npx',['--yes','@stripe/cli','login','list'],{env:cliEnv,encoding:'utf8',timeout:30000});
 const active=(listing.stdout??'').split('\n').find(line=>line.includes('acct_1UHA0OLKJHBmA7Jw')&&line.includes('sandbox')&&line.includes('active'));
 if(listing.status!==0||!active){console.error('Stopped: expected MusicBat sandbox is not active in Stripe CLI. No payment created.');process.exit(1);}
 const secretResult=spawnSync('npx',['--yes','@stripe/cli','listen','--print-secret'],{env:cliEnv,encoding:'utf8',timeout:45000,maxBuffer:1048576});
 let secret;
 try{if(secretResult.status!==0)throw Error();secret=signingSecret(secretResult.stdout)}catch{console.error('Could not privately obtain the sandbox relay signing secret. No payment created.');process.exit(1);}
 try{process.loadEnvFile('.env.local')}catch{console.error('Could not read existing local configuration. No payment created.');process.exit(1);}
 if((process.env.MUSICBAT_STRIPE_MODE??'test')!=='test'||!/^(?:rk|sk)_test_[A-Za-z0-9_]+$/.test(process.env.STRIPE_SECRET_KEY??'')){
  console.error('Stopped: application key/mode is not sandbox. No credentials changed.');process.exit(1);
 }
 if(process.env.STRIPE_WEBHOOK_SECRET&&process.env.STRIPE_WEBHOOK_SECRET!==secret){console.error('An existing different webhook secret is configured; stopped without changing it.');process.exit(1);}
 process.env.STRIPE_WEBHOOK_SECRET=secret;
 // Explicit sandbox scenario, not a claim about the live processor contract.
 process.env.MUSICBAT_PROCESSING_BPS??='290';
 process.env.MUSICBAT_PROCESSING_FIXED_CENTS??='30';
 console.log('Sandbox fee scenario: '+process.env.MUSICBAT_PROCESSING_BPS+' basis points + '+process.env.MUSICBAT_PROCESSING_FIXED_CENTS+' cents. Existing credential file unchanged.');
 const relay=spawn('npx',['--yes','@stripe/cli','listen','--events','checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired','--forward-to','http://127.0.0.1:5181/api/musicbat/stripe/webhook'],{env:cliEnv,stdio:['ignore','pipe','pipe']});
 let ready=false;
 const timeout=setTimeout(()=>{console.error('Relay did not become ready; no Checkout started.');relay.kill('SIGTERM');process.exitCode=1;},45000);
 async function line(value){
  const clean=value.replace(/\u001b\[[0-9;]*m/g,'');
  // Match the actual relay secret; refuse a changed CLI session secret.
  const announced=clean.match(/\bwhsec_[A-Za-z0-9_]+\b/)?.[0];
  if(announced&&announced!==secret){console.error('Relay signing secret changed; stopped without starting purchase.');relay.kill('SIGTERM');process.exitCode=1;return;}
  console.log(redact(clean));
  if(!ready&&announced===secret){
   ready=true;clearTimeout(timeout);
   try{await start()}catch{console.error('Sandbox runner failed readiness checks. No successful purchase claimed.');relay.kill('SIGTERM');process.exitCode=1;}
  }
 }
 for(const stream of [relay.stdout,relay.stderr]){
  let pending='';stream.setEncoding('utf8');stream.on('data',chunk=>{pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){const value=pending.slice(0,end);pending=pending.slice(end+1);void line(value)}});
  stream.on('end',()=>{if(pending)void line(pending)});
 }
 relay.on('error',()=>{clearTimeout(timeout);console.error('Stripe CLI relay could not start.');process.exitCode=1});
 relay.on('exit',()=>{clearTimeout(timeout);if(!ready){console.error('Relay stopped before purchase runner started.');process.exitCode=1}else{console.log('Stripe relay stopped. Restart this launcher before further payment testing.');}});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearTimeout(timeout);relay.kill('SIGTERM')});
}

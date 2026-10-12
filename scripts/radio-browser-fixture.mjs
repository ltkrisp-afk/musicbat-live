import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { localStack } from '../e2e/local-stack.mjs';
import { seedRuntime } from '../e2e/fixtures.mjs';
const dir=await mkdtemp(join(tmpdir(),'musicbat-cloud-browser-'));
const opts={databasePath:join(dir,'radio.sqlite'),assetRoot:dir,host:'0.0.0.0'};
const one=await localStack({...opts,port:5178,browserFixtureListener:'listener-one'});
await seedRuntime(one.runtime,dir,{durationMs:180000});one.runtime.start();
const two=await localStack({...opts,port:5179,browserFixtureListener:'listener-two'});two.runtime.start();
console.log(JSON.stringify({fixture:true,one:'http://terminal.local:5178',two:'http://terminal.local:5179',database:opts.databasePath}));
// Test control through process stdin only. No public admin or identity-changing API.
createInterface({input:process.stdin}).on('line',async line=>{
 try {
  const command=JSON.parse(line);
  if(command.action==='offline') one.controls.offline=command.value;
  if(command.action==='withdraw') one.runtime.withdraw(command.id,'cloud-browser test withdrawal');
  if(command.action==='empty')for(const id of ['a','b','c'])one.runtime.withdraw(id,'cloud-browser empty fixture');
  if(command.action==='status')console.log(JSON.stringify({one:one.runtime.engine.reconnect({id:'listener-one',plusUntil:Date.now()+86400000}),two:two.runtime.engine.reconnect({id:'listener-two',plusUntil:Date.now()+86400000})}));
  if(command.action==='close'){await two.close();await one.close();process.exit(0)}
  console.log('TEST CONTROL APPLIED '+command.action);
 }catch(error){console.error(error)}
});

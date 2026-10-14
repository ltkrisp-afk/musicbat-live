import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRadioRequestQueue} from '../lib/radio-request-queue.ts';
test('listener tuning waits for poll rather than failing; background polls cannot overtake it',async()=>{
 const queue=createRadioRequestQueue(),calls=[];let release;
 const poll=queue.run(false,async()=>{calls.push('poll');await new Promise(r=>release=r);});
 const tune=queue.run(true,async()=>{calls.push('tune');});
 await queue.run(false,async()=>calls.push('extra poll'));
 assert.deepEqual(calls,['poll']);release();await poll;await tune;assert.deepEqual(calls,['poll','tune']);
});
test('failed authority poll does not prevent next listener tune',async()=>{
 const queue=createRadioRequestQueue();
 const failed=queue.run(false,async()=>{throw new Error('offline');});
 const tune=queue.run(true,async()=> 'Rock');
 await assert.rejects(failed,/offline/);assert.equal(await tune,'Rock');
});

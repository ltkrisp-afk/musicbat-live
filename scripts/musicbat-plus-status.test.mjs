import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPlusStatusReader} from '../lib/radio-plus-status.ts';
const active={available:true,active:true,paidUntil:1794529482000,cancelAtPeriodEnd:true,status:'active'};
test('late signed-out response cannot overwrite refreshed active patron membership',async()=>{
 const pending=[],views=[];
 const reader=createPlusStatusReader((url,options)=>{assert.equal(options.credentials,'same-origin');return new Promise(resolve=>pending.push(resolve));},v=>views.push(v));
 const old=reader.refresh(),fresh=reader.refresh();
 pending[1](Response.json(active));await fresh;
 pending[0](Response.json({error:'Sign in to use Radio Plus.'},{status:401}));await old;
 assert.deepEqual(views.at(-1),{status:active,signedOut:false,loading:false,error:''});
});
test('refresh clears stale status and errors; successful retry preserves cancelled paid access',async()=>{
 const responses=[Response.json(active),Response.json({error:'Temporary failure'},{status:503}),Response.json(active)],views=[];
 const reader=createPlusStatusReader(async()=>responses.shift(),v=>views.push(v));
 await reader.refresh();await reader.refresh();
 assert.equal(views.at(-1).status,null);assert.equal(views.at(-1).error,'Temporary failure');
 await reader.refresh();assert.equal(views.at(-2).loading,true);assert.equal(views.at(-2).error,'');
 assert.equal(views.at(-1).status.cancelAtPeriodEnd,true);assert.equal(views.at(-1).status.active,true);assert.equal(views.at(-1).error,'');
});
test('account change invalidates pending response and does not display previous entitlement',async()=>{
 let resolve;const views=[];
 const reader=createPlusStatusReader(()=>new Promise(r=>resolve=r),v=>views.push(v));
 const pending=reader.refresh();reader.invalidate();resolve(Response.json(active));await pending;
 assert.equal(views.length,1);assert.equal(views[0].status,null);
});

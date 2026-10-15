import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stripeMode,stripeModeMatches,stripeGet,stripePost} from '../app/api/musicbat/stripe/stripe.ts';
test('credentials and explicit mode fail closed before any network request',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({id:'fixture'})};
 try {
 for(const [mode,key] of [['live','sk_test_fixture'],['test','sk_live_fixture'],['bad','sk_test_fixture'],['live',undefined],[undefined,'sk_live_fixture']])await assert.rejects(()=>stripeGet({MUSICBAT_STRIPE_MODE:mode,STRIPE_SECRET_KEY:key},'/v1/account'));
 assert.equal(calls,0);
 for(const mode of ['live','test'])await stripeGet({MUSICBAT_STRIPE_MODE:mode,STRIPE_SECRET_KEY:`sk_${mode}_fixture`},'/v1/account');
 assert.equal(calls,2);assert.equal(stripeMode({}),'test');
 for(const mode of ['live','test'])for(const value of [undefined,null,0,1,'true','false'])assert.equal(stripeModeMatches({MUSICBAT_STRIPE_MODE:mode},value),false);
 }finally{globalThis.fetch=old}
});


test('restricted sandbox credentials reach Stripe unchanged; invalid and live restricted keys fail closed',async()=>{
 const old=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({id:'acct_fixture'});};
 try {
  for(const [mode,key] of [['live','rk_test_fixture'],['live','rk_live_fixture'],['test','rk_live_fixture'],['test','pk_test_fixture'],['test','rk_test_'],['test','rk_test_bad key']])
   await assert.rejects(()=>stripeGet({MUSICBAT_STRIPE_MODE:mode,STRIPE_SECRET_KEY:key},'/v1/account'));
  assert.equal(calls.length,0);
  const env={STRIPE_SECRET_KEY:'rk_test_fixture'};
  await stripePost(env,'/v1/accounts',{type:'express'},'connect-fixture');
  await stripeGet(env,'/v1/accounts/acct_fixture');
  await stripePost(env,'/v1/account_links',{account:'acct_fixture',type:'account_onboarding'});
  assert.equal(calls.length,3);
  for(const call of calls)assert.equal(call.init.headers.authorization,'Bearer rk_test_fixture');
  assert.equal(calls[0].init.headers['idempotency-key'],'connect-fixture');
  assert.equal(calls[0].init.body.get('type'),'express');
  globalThis.fetch=async()=>Response.json({error:{message:'Permission denied'}},{status:403});
  await assert.rejects(()=>stripePost(env,'/v1/accounts',{type:'express'}),/Permission denied/);
 }finally{globalThis.fetch=old;}
});

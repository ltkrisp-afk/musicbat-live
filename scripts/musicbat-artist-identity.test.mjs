import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,post} from './website-fixture.mjs';

test('artist display identity follows authenticated ownership, never a viewed artist or patron query parameter',async()=>{
 const f=await fixture();try{
  await f.route.POST(post({action:'set_artist_identity',artistName:'Owner Band'}));
  const get=()=>f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=artists&artistId=owner'));
  const owner=await (await get()).json();assert.equal(owner.artistIdentity,'Owner Band');assert.equal(owner.artists[0].is_owner,1);
  assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled:true}))).status,403);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_follows').get().n,0);
  f.state.user={userId:'patron'};const patron=await (await get()).json();assert.equal(patron.artistIdentity,null);assert.equal(patron.canManage,false);assert.equal(patron.artists[0].is_owner,0);
  assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled:true}))).status,200);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_follows').get().n,1);
  f.state.user={userId:'other'};await f.route.POST(post({action:'set_artist_identity',artistName:'Other Band'}));assert.equal((await (await get()).json()).artistIdentity,'Other Band');
  f.state.user=null;const guest=await (await get()).json();assert.equal(guest.artistIdentity,null);assert.equal(guest.canManage,false);
 }finally{f.sqlite.close();}
});

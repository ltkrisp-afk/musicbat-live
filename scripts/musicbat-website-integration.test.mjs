import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,upload,mine,post} from './website-fixture.mjs';
const get=(f,view)=>f.route.GET(new Request('https://musicbat.audio/api/musicbat?view='+view));
test('fresh musician journey edits hierarchy, withdraws Radio independently and returns only with withdrawn grants retained',async()=>{
 const f=await fixture();try{
  assert.equal((await upload(f.route)).status,201);
  assert.equal((await f.route.POST(post({action:'edit_metadata',trackId:1,title:'Revised title',primaryGenre:'Jazz',subgenre:'Fusion',style:'Jazz Rock',energyLane:'soft'}))).status,200);
  const track=(await (await mine(f.route)).json()).tracks[0];assert.equal(track.title,'Revised title');assert.equal(track.style,'Jazz Rock');assert.equal(track.energy_lane,'soft');
  f.sqlite.prepare("INSERT INTO playback_permissions VALUES (1,'direct','fixture','fixture','fixture',1,1,1,1,1,9999999999999,NULL,'worldwide')").run();
  assert.equal((await f.route.POST(post({action:'set_radio',trackId:1,enabled:false}))).status,200);
  assert.equal((await (await get(f,'tracks')).json()).tracks[0].rotation_eligible,false);
  const revoked=f.sqlite.prepare('SELECT withdrawn_at FROM playback_permissions').get().withdrawn_at;assert.ok(revoked);
  assert.equal((await f.route.POST(post({action:'set_radio',trackId:1,enabled:true}))).status,200);
  assert.equal(f.sqlite.prepare('SELECT withdrawn_at FROM playback_permissions').get().withdrawn_at,revoked);
  assert.equal((await (await get(f,'tracks')).json()).tracks[0].rotation_eligible,false);
  assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:1}))).status,200);
  assert.equal((await (await get(f,'tracks')).json()).tracks.length,0);assert.equal((await (await mine(f.route)).json()).tracks[0].status,'withdrawn');
 }finally{f.sqlite.close()}
});
test('patron cannot mutate any musician controls; representative permission disappears on revocation',async()=>{
 const f=await fixture();try{
  await upload(f.route);f.state.user={userId:'patron'};
  for(const action of ['edit_metadata','set_radio','withdraw_track','delete_track','set_energy_lane','set_primary_genre','set_rotation_priority']){
   assert.equal((await f.route.POST(post({action,trackId:1,enabled:true,energyLane:'soft',primaryGenre:'Jazz',title:'Hijack'}))).status,403,action);
  }
  assert.equal((await (await get(f,'artists')).json()).canManage,false);assert.equal((await (await mine(f.route)).json()).tracks.length,0);
  f.state.user={userId:'rep'};await f.route.POST(post({action:'set_artist_identity',artistName:'Representative'}));f.state.user={userId:'owner'};
  await f.route.POST(post({action:'grant_representative',trackId:1,representativeId:'rep'}));f.state.user={userId:'rep'};
  assert.equal((await (await mine(f.route)).json()).tracks.length,1);
  f.state.user={userId:'owner'};await f.route.POST(post({action:'revoke_representative',trackId:1,representativeId:'rep'}));f.state.user={userId:'rep'};
  assert.equal((await (await mine(f.route)).json()).tracks.length,0);assert.equal((await f.route.POST(post({action:'withdraw_track',trackId:1}))).status,403);
 }finally{f.sqlite.close()}
});
test('fresh patron follows survive requests and never add Shock Room engagement; empty artist page remains followable',async()=>{
 const f=await fixture();try{
  await upload(f.route);const original=(await (await get(f,'artists')).json()).artists[0];
  f.state.user={userId:'patron'};for(const enabled of [true,true,false,true])assert.equal((await f.route.POST(post({action:'follow_artist',artistId:'owner',enabled}))).status,200);
  assert.equal((await (await get(f,'artists')).json()).artists[0].following,1);
  const shock=(await (await get(f,'shock-room')).json()).rows[0];assert.equal(shock.shock_score,0);assert.equal(shock.keep_count,0);assert.equal(shock.up_count,0);
  f.state.user={userId:'owner'};await f.route.POST(post({action:'delete_track',trackId:1}));
  f.state.user={userId:'patron'};const remaining=(await (await get(f,'artists')).json()).artists[0];assert.equal(remaining.slug,original.slug);assert.equal(remaining.track_count,0);assert.equal(remaining.following,1);
  assert.equal((await (await get(f,'tracks')).json()).tracks.length,0);assert.equal(f.objects.size,1);
 }finally{f.sqlite.close()}
});
test('membership-specific qualification rejects Free Radio, records one choice, and updates genuine Shock Room counts',async()=>{
 const f=await fixture();try{
  await upload(f.route);f.state.user={userId:'patron'};let category=null;
  f.state.env.RADIO_SERVICE={async fetch(){return Response.json({snapshot:{simulation:false,status:'playing',channelId:'fixture',category,performance:{trackId:'1',authorityId:'one'}}})}};
  const start=await f.route.POST(post({action:'start_listen',trackId:1,performanceKey:'fixture:one'}));assert.equal(start.status,200);const {listenId}=await start.json();
  f.sqlite.prepare("UPDATE listens SET started_at=datetime('now','-13 seconds')").run();
  assert.equal((await f.route.POST(post({action:'qualify_listen',trackId:1,listenId}))).status,403);
  category={genre:'Rock'};assert.equal((await f.route.POST(post({action:'qualify_listen',trackId:1,listenId}))).status,200);
  for(const signal of ['up','up','down'])assert.equal((await f.route.POST(post({action:'radio_feedback',trackId:1,listenId,signal}))).status,200);
  assert.equal((await f.route.POST(post({action:'toggle_keep',trackId:1,enabled:true}))).status,200);
  const row=(await (await get(f,'shock-room')).json()).rows[0];assert.equal(row.up_count,0);assert.equal(row.down_count,1);assert.equal(row.keep_count,1);assert.equal(row.shock_score,1);
  category=null;assert.equal((await f.route.POST(post({action:'radio_feedback',trackId:1,listenId,signal:'up'}))).status,403);
  assert.equal((await (await get(f,'shock-room')).json()).rows[0].shock_score,1);
 }finally{f.sqlite.close()}
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fixture,upload,mine,post} from './website-fixture.mjs';
import {testRightsDeclaration} from './license-fixture.mjs';
import {matchesRadioCategory} from '../lib/radio-category.ts';

test('new recordings require explicit creation declaration; legacy recordings remain unknown',async()=>{
 const f=await fixture();try{
 const {creationClassification:_removed,...missing}=testRightsDeclaration;void _removed;
 assert.equal((await upload(f.route,{rightsDeclaration:JSON.stringify(missing)})).status,422);
 for(const creationClassification of ['Human','Human + AI','AI']){
  assert.equal((await upload(f.route,{rightsDeclaration:JSON.stringify({...testRightsDeclaration,creationClassification})})).status,201);
  const track=f.sqlite.prepare('SELECT * FROM tracks ORDER BY id DESC LIMIT 1').get();assert.equal(track.creation_classification,creationClassification);assert.equal(track.radio_enabled,1);
  assert.equal(JSON.parse(f.sqlite.prepare('SELECT declaration_json FROM artist_rights_declarations WHERE track_id=?').get(track.id).declaration_json).creationClassification,creationClassification);
 }
 f.sqlite.prepare("INSERT INTO tracks(artist_id,artist_name,title,audio_url) VALUES('owner','Artist','Legacy','legacy')").run();assert.equal(f.sqlite.prepare("SELECT creation_classification FROM tracks WHERE title='Legacy'").get().creation_classification,null);
 }finally{f.sqlite.close();}
});
test('classification amendments preserve original acceptance and existing auditable history with private authority',async()=>{
 const f=await fixture();try{
 await upload(f.route);const original=f.sqlite.prepare('SELECT declaration_json FROM artist_rights_declarations').get().declaration_json;
 for(const classification of ['Human + AI','AI'])assert.equal((await f.route.POST(post({action:'set_creation_classification',trackId:1,creationClassification:classification}))).status,200);
 const own=await(await mine(f.route)).json();assert.equal(own.tracks[0].creation_classification,'AI');assert.equal(own.creationHistory.length,3);assert.equal(f.sqlite.prepare('SELECT declaration_json FROM artist_rights_declarations').get().declaration_json,original);
 assert.equal((await f.route.POST(post({action:'set_creation_classification',trackId:1,creationClassification:'guessed'}))).status,422);
 f.state.user={userId:'stranger'};assert.equal((await f.route.POST(post({action:'set_creation_classification',trackId:1,creationClassification:'Human'}))).status,403);assert.equal((await(await mine(f.route)).json()).creationHistory.length,0);
 f.sqlite.prepare("INSERT INTO track_authority VALUES(1,'rep','owner',1,NULL)").run();f.state.user={userId:'rep'};assert.equal((await f.route.POST(post({action:'set_creation_classification',trackId:1,creationClassification:'Human'}))).status,200);
 f.sqlite.prepare("UPDATE track_authority SET revoked_at=2 WHERE account_id='rep'").run();assert.equal((await f.route.POST(post({action:'set_creation_classification',trackId:1,creationClassification:'AI'}))).status,403);
 f.state.user=null;assert.equal((await f.route.POST(post({action:'set_creation_classification',trackId:1,creationClassification:'AI'}))).status,401);
 }finally{f.sqlite.close();}
});
test('AI channel uses declared creation independently of genre; free discovery does not exclude any classification',()=>{
 for(const creationClassification of [null,undefined,'Human','Human + AI','AI']){
  const track={category:{genre:'Rock',subgenre:'Punk'},creationClassification};
  assert.equal(matchesRadioCategory(track,null),true);assert.equal(matchesRadioCategory(track,{genre:'Rock'}),true);
  assert.equal(matchesRadioCategory(track,{genre:'AI'}),creationClassification==='Human + AI'||creationClassification==='AI');
  assert.equal(matchesRadioCategory(track,{genre:'AI',subgenre:'Punk'}),false);
 }
});

import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {SharedRadioEngine} from '../lib/shared-radio-engine.ts';
import {D1SharedRadioEngine} from '../lib/d1-shared-radio-engine.ts';
function d1(sqlite){const db={prepare(sql){const bound=(...v)=>({bind:(...next)=>bound(...next),async all(){return {success:true,results:sqlite.prepare(sql).all(...v)}},async first(){return sqlite.prepare(sql).get(...v)??null},async run(){return {success:true,meta:sqlite.prepare(sql).run(...v)}},execute(){const s=sqlite.prepare(sql);return {success:true,results:s.columns().length?s.all(...v):[],meta:s.columns().length?{}:s.run(...v)}}});return bound()},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};return db;}
for(const asynchronous of [false,true])test(`${asynchronous?'D1':'SQLite'} shared AI channel excludes human/unknown and enforces membership and channel review`,async()=>{
 const sqlite=new DatabaseSync(':memory:');try{
 sqlite.exec(await readFile('drizzle/0008_shared_radio_engine.sql','utf8'));
 const permission={recording_basis:'direct',recording_evidence:'Synthetic',composition_evidence:'Synthetic',reviewed_by:'Synthetic',reviewed_at:0,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:0,expires_at:999999999,withdrawn_at:null,territory:'US'};
 for(const [id,creationClassification] of [['human','Human'],['hybrid','Human + AI'],['ai','AI'],['legacy',null]])sqlite.prepare('INSERT INTO radio_engine_catalog VALUES (?,?)').run(id,JSON.stringify({id,creationClassification,category:{genre:'Rock'},durationMs:1000,artistIds:['artist'+id],albumId:'album'+id,compilationIds:[],eligible:true,metadataReviewed:true,permission,statutoryEligibility:null,directRestrictions:null}));
 const config={category:{genre:'AI'},mode:'radio-plus',territory:'US',minimumArtists:1,review:{reference:'Synthetic reviewed AI channel',verifiedAt:0,expiresAt:999999999},gate:null};
 sqlite.prepare('INSERT INTO radio_engine_channels VALUES (?,?,0,0,0,0)').run('ai',JSON.stringify(config));
 const db=d1(sqlite);db.withSession=()=>db;const engine=asynchronous?new D1SharedRadioEngine(db,()=>10000):new SharedRadioEngine(sqlite,()=>10000);
 await assert.rejects(async()=>engine.tune({id:'free',plusUntil:null},{genre:'AI'}),/entitlement/);
 const result=await engine.tune({id:'paid',plusUntil:999999999},{genre:'AI'});assert.equal(result.status,'playing');assert.ok(['hybrid','ai'].includes(result.performance.trackId));
 sqlite.prepare('UPDATE radio_engine_channels SET config_json=? WHERE id=?').run(JSON.stringify({...config,review:null}),'ai');assert.equal((await engine.reconnect({id:'paid',plusUntil:999999999})).status,'silent');
 }finally{sqlite.close();}
});

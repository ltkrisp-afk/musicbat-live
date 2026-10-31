import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fixture,upload,post,load} from './website-fixture.mjs';
import {testRightsDeclaration} from './license-fixture.mjs';
import {directLicenseFinal} from '../lib/direct-license-final.ts';
import {directLicenseDraft} from '../lib/direct-license-draft.ts';

test('complete review draft matches source, is readable without activation and cannot be activated',async()=>{
 assert.equal(directLicenseDraft.body,await readFile('legal/direct-licensing-agreement-draft.md','utf8'));
 const f=await fixture();try{
 f.sqlite.exec('DELETE FROM direct_license_current');
 const api=await load('app/api/musicbat/agreement/route.ts',f.state);const response=await api.GET();
 assert.equal(response.status,503);assert.equal((await response.json()).candidate.body,directLicenseFinal.body);
 f.sqlite.prepare('INSERT INTO direct_license_versions VALUES (?,?,?,?,?)').run(directLicenseDraft.version,directLicenseDraft.body,'draft','not approval',1);
 assert.throws(()=>f.sqlite.prepare('INSERT INTO direct_license_current VALUES (1,?)').run(directLicenseDraft.version),/Draft agreements/);
 assert.equal((await upload(f.route,{agreementVersion:directLicenseDraft.version})).status,503);
 }finally{f.sqlite.close();}
});
test('missing declarations and missing shared authority references fail before storing files',async()=>{
 const f=await fixture();try{
 for(const value of ['',JSON.stringify({...testRightsDeclaration,legalName:''}),JSON.stringify({...testRightsDeclaration,rightsBasis:'shared',evidenceReference:''})])assert.equal((await upload(f.route,{rightsDeclaration:value})).status,422);
 assert.equal(f.objects.size,0);
 }finally{f.sqlite.close();}
});
test('shared authority remains held despite forged review fields; consent and private declarations survive and export only to their signer',async()=>{
 const f=await fixture();try{
 const declaration={...testRightsDeclaration,rightsBasis:'shared',evidenceReference:'Private signed authorization awaiting review',reviewRequired:false,cleared:true};
 const response=await upload(f.route,{rightsDeclaration:JSON.stringify(declaration),saleEnabled:'true',saleRightsAttested:'true',salePriceCents:'200'});
 assert.equal(response.status,201);const {track,rightsReview}=await response.json();assert.equal(rightsReview,'required');assert.equal(track.sale_enabled,0);assert.equal(track.radio_enabled,0);
 assert.equal((await f.route.POST(post({action:'set_sale_settings',trackId:track.id,saleEnabled:true,saleRightsAttested:true,salePriceCents:200}))).status,409);
 assert.equal((await f.route.POST(post({action:'set_radio',trackId:track.id,enabled:true}))).status,409);
 const row=f.sqlite.prepare('SELECT * FROM artist_rights_declarations').get();assert.equal(row.review_required,1);assert.equal(JSON.parse(row.declaration_json).cleared,undefined);
 assert.throws(()=>f.sqlite.exec('UPDATE artist_rights_declarations SET review_required=0'),/immutable/);
 assert.throws(()=>f.sqlite.exec('UPDATE tracks SET sale_enabled=1'),/Rights review/);
 const records=()=>f.route.GET(new Request('https://musicbat.audio/api/musicbat?view=license-records'));
 assert.equal((await (await records()).json()).records[0].track_id,track.id);
 f.state.user={userId:'another'};assert.equal((await (await records()).json()).records.length,0);
 f.sqlite.prepare('INSERT INTO artist_rights_reviews(acceptance_id,decision,reviewed_by,reviewed_at,evidence_reference) VALUES (?,?,?,?,?)').run(row.acceptance_id,'cleared','synthetic reviewer',Date.now(),'synthetic inspected documents');
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_rights_holds').get().n,0);
 assert.equal(f.sqlite.prepare('SELECT sale_enabled FROM tracks').get().sale_enabled,0);
 f.sqlite.prepare('INSERT INTO artist_rights_reviews(acceptance_id,decision,reviewed_by,reviewed_at,evidence_reference) VALUES (?,?,?,?,?)').run(row.acceptance_id,'hold','synthetic reviewer',Date.now(),'synthetic new claim');
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_rights_holds').get().n,1);
 }finally{f.sqlite.close();}
});
test('declaration storage failure rolls back acceptance and track and removes audio',async()=>{
 const f=await fixture(),saved=console.error;try{
 console.error=()=>{};f.sqlite.exec("CREATE TRIGGER reject_declaration BEFORE INSERT ON artist_rights_declarations BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 assert.equal((await upload(f.route)).status,500);assert.equal(f.objects.size,0);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_license_acceptances').get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tracks').get().n,0);
 }finally{console.error=saved;f.sqlite.close();}
});

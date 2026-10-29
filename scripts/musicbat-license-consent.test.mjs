import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture,upload,load} from './website-fixture.mjs';
import {testAgreement} from './license-fixture.mjs';

test('agreement endpoint returns exact approved text; no active agreement fails closed',async()=>{
 const f=await fixture();try{
  const api=await load('app/api/musicbat/agreement/route.ts',f.state);
  const response=await api.GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual((await response.json()).agreement,{version:testAgreement.version,body:testAgreement.body,acceptance_text:testAgreement.acceptanceText});
  f.sqlite.exec('DELETE FROM direct_license_current');
  assert.equal((await api.GET()).status,503);assert.equal((await upload(f.route)).status,503);assert.equal(f.objects.size,0);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tracks').get().n,0);
 }finally{f.sqlite.close();}
});

test('upload rejects missing, false, malformed and stale consent before storing audio',async()=>{
 const f=await fixture();try{
  for(const values of [{agreementAccepted:''},{agreementAccepted:'false'},{agreementAccepted:'1'},{agreementVersion:''},{agreementVersion:'older-version'}]){
   assert.equal((await upload(f.route,values)).status,409);
  }
  assert.equal(f.objects.size,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_license_acceptances').get().n,0);
 }finally{f.sqlite.close();}
});

test('affirmative consent uses authenticated identity and server time, survives reopening, and preserves immutable exact terms',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'musicbat-consent-')),path=join(directory,'test.sqlite');
 const f=await fixture(path);let closed=false;
 try{
  const before=Date.now();const response=await upload(f.route,{accountId:'forged',acceptedAt:'1'});assert.equal(response.status,201);
  const {track}=await response.json();const row=f.sqlite.prepare('SELECT * FROM artist_license_acceptances').get();
  assert.equal(row.track_id,track.id);assert.equal(row.account_id,'owner');assert.equal(row.accepted,1);assert.equal(row.agreement_version,testAgreement.version);
  assert.ok(row.accepted_at>=before && row.accepted_at<=Date.now());
  for(const sql of ["UPDATE direct_license_versions SET body='changed'","DELETE FROM direct_license_versions","UPDATE artist_license_acceptances SET account_id='forged'","DELETE FROM artist_license_acceptances"]){assert.throws(()=>f.sqlite.exec(sql),/immutable|retained/);}
  f.sqlite.close();closed=true;const reopened=new DatabaseSync(path);
  try{assert.deepEqual(reopened.prepare('SELECT * FROM artist_license_acceptances').get(),row);assert.equal(reopened.prepare('SELECT body FROM direct_license_versions').get().body,testAgreement.body);}finally{reopened.close();}
 }finally{if(!closed)f.sqlite.close();await rm(directory,{recursive:true});}
});

test('acceptance storage failure or agreement replacement during upload rolls back track and cleans audio',async()=>{
 for(const failure of ['write','version']){
  const f=await fixture();const original=console.error;console.error=()=>{};
  try{
   if(failure==='write')f.sqlite.exec("CREATE TRIGGER reject_test_consent BEFORE INSERT ON artist_license_acceptances BEGIN SELECT RAISE(ABORT,'test failure'); END;");
   else {const put=f.state.env.BUCKET.put;f.state.env.BUCKET.put=async(...args)=>{await put(...args);f.sqlite.exec('DELETE FROM direct_license_current');};}
   assert.equal((await upload(f.route)).status,500);assert.equal(f.objects.size,0);
   assert.equal(f.sqlite.prepare('SELECT count(*) n FROM tracks').get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM artist_license_acceptances').get().n,0);
  }finally{console.error=original;f.sqlite.close();}
 }
});

test('migration preserves historical subscription invoices and leaves the agreement unactivated',async()=>{
 const {readMigrationFiles}=await import('drizzle-orm/migrator');const db=new DatabaseSync(':memory:');
 try{
  const migrations=readMigrationFiles({migrationsFolder:'drizzle'});
  for(const migration of migrations.slice(0,-1))for(const sql of migration.sql)db.exec(sql);
  db.exec("INSERT INTO radio_plus_enrollments(id,user_id) VALUES ('legacy','artist'); INSERT INTO radio_plus_invoices VALUES ('old-invoice','legacy','old-sub',300,123,456)");
  const before=db.prepare('SELECT * FROM radio_plus_invoices').get();
  for(const sql of migrations.at(-1).sql)db.exec(sql);
  assert.deepEqual(db.prepare('SELECT * FROM radio_plus_invoices').get(),before);
  assert.equal(db.prepare('SELECT count(*) n FROM direct_license_current').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM direct_license_versions').get().n,0);
 }finally{db.close();}
});

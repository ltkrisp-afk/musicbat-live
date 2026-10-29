import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {readMigrationFiles} from 'drizzle-orm/migrator';
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
const old=JSON.parse(readFileSync('release/v13/baseline/_journal.json','utf8'));
const migrations=readMigrationFiles({migrationsFolder:'drizzle'});
function execute(db,migration){for(const sql of migration.sql)db.exec(sql)}
const rows=(db,table)=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(r=>({...r}));
function fixture(){const db=new DatabaseSync(':memory:');for(let i=0;i<5;i++)execute(db,migrations[i]);
 db.exec(`INSERT INTO tracks(id,artist_id,artist_name,title,audio_url) VALUES(1,'owner','Band','Unity','original.wav');
 INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,artist_id,processor_session_id) VALUES('historical','buyer',1,'Unity','Band','original.wav','paid',1000,900,100,'owner','cs_test_old');
 INSERT INTO artist_accounts(artist_id,stripe_account_id) VALUES('owner','acct_old');
 INSERT INTO stripe_events(event_id,event_type) VALUES('evt_old','checkout.session.completed');
 INSERT INTO listens(id,track_id,listener_id,qualified,qualified_at) VALUES('listen-up',1,'up',1,'2026-10-01'),('listen-down',1,'down',1,'2026-10-01'),('future',1,'future',1,'2026-10-11'),('hanger-listen',1,'hanger',1,'2026-10-01');
 INSERT INTO radio_feedback(track_id,listener_id,signal,created_at,updated_at) VALUES(1,'up','up','2026-10-02','2026-10-10'),(1,'down','down','2026-10-02','2026-10-10'),(1,'unqualified','up','2026-10-02','2026-10-10'),(1,'future','up','2026-10-02','2026-10-10'),(1,'owner','up','2026-10-02','2026-10-10'),(99,'orphan','up','2026-10-02','2026-10-10');
 INSERT INTO track_keeps(track_id,listener_id,enabled) VALUES(1,'keep',1),(1,'disabled',0),(1,'owner',1),(99,'orphan',1);
 INSERT INTO hangers(track_id,listener_id,kind,created_at) VALUES(1,'hanger','standout','2026-10-10'),(1,'up','want_more','2026-10-10'),(1,'hanger-keep','keep_in_rotation','2026-10-10'),(1,'disabled','keep_in_rotation','2026-10-10');`);return db;}
test('version 13 immutable history, all pending migrations registered and compatibility preserves data',()=>{
 assert.deepEqual(journal.entries.slice(0,5),old.entries);
 for(let i=0;i<5;i++)assert.equal(readFileSync(`drizzle/${old.entries[i].tag}.sql`,'utf8'),readFileSync(`release/v13/baseline/${old.entries[i].tag}.sql`,'utf8'));
 assert.equal(migrations.length,19);assert.deepEqual(journal.entries.slice(6).map(e=>e.tag.slice(0,4)),['0006','0007','0008','0009','0010','0011','0012','0013','0014','0015','0016','0017','0018']);
 const db=fixture(),before={};for(const t of ['purchases','artist_accounts','stripe_events','hangers','radio_feedback','track_keeps'])before[t]=rows(db,t);
 db.exec('BEGIN IMMEDIATE');for(let i=5;i<migrations.length;i++)execute(db,migrations[i]);db.exec('COMMIT');
 for(const t of ['artist_accounts','stripe_events','hangers'])assert.deepEqual(rows(db,t),before[t]);
 assert.deepEqual(rows(db,'purchases').map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['processing_cents','sale_withdrawn_at','checkout_request_json','cleanup_state','cleanup_attempts','cleanup_error','payment_review_reason','buyer_account_id'].includes(key)))),before.purchases);assert.equal(rows(db,'purchases')[0].processing_cents,0);
 assert.deepEqual(rows(db,'v13_radio_feedback_archive'),before.radio_feedback);assert.deepEqual(rows(db,'v13_track_keeps_archive'),before.track_keeps);
 assert.deepEqual(rows(db,'radio_feedback').map(r=>r.listener_id).sort(),['down','hanger','up']);
 assert.deepEqual(rows(db,'track_keeps').map(r=>r.listener_id).sort(),['hanger-keep','keep']);
 assert.equal(rows(db,'tracks')[0].recording_metadata,'{}');assert.equal(rows(db,'tracks')[0].technical_metadata,'{}');assert.equal(rows(db,'tracks')[0].compilation_allowed,0);assert.equal(rows(db,'tracks')[0].licensing_allowed,0);
 assert.equal(rows(db,'playback_permissions').length,0);assert.equal(rows(db,'track_authority').length,0);
 // New sales/events/ownership must survive rollback as well.
 db.exec(`INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,processing_cents) VALUES('new-sale','buyer',1,'Unity','Band','original.wav','paid',200,170,30,37);
 INSERT INTO stripe_events(event_id,event_type) VALUES('evt_new','checkout.session.completed');
 INSERT INTO radio_feedback VALUES('new',1,'owner','up','listen-up','medium','down','2026-10-12');
 INSERT INTO radio_feedback VALUES('tie',1,'owner','up','listen-up','medium','up','2026-10-12');
 DELETE FROM track_keeps WHERE listener_id='keep'; INSERT INTO track_keeps VALUES(1,'new-keep','2026-10-12');`);
 db.exec("INSERT INTO artist_follows(listener_id,artist_id) VALUES ('follower','owner')");
 const discovery=rows(db,'artist_pages'),follows=rows(db,'artist_follows');
 const financial=rows(db,'purchases'),events=rows(db,'stripe_events');
 db.exec('BEGIN IMMEDIATE');db.exec(readFileSync('release/v13/rollback-signals.sql','utf8'));db.exec('COMMIT');
 assert.deepEqual(rows(db,'artist_pages'),discovery);assert.deepEqual(rows(db,'artist_follows'),follows);
 assert.deepEqual(rows(db,'purchases'),financial);assert.deepEqual(rows(db,'stripe_events'),events);
 assert.equal(db.prepare("SELECT signal FROM radio_feedback WHERE listener_id='up'").get().signal,'up');
 assert.equal(db.prepare("SELECT updated_at FROM radio_feedback WHERE listener_id='up'").get().updated_at,'2026-10-12');
 assert.equal(db.prepare("SELECT enabled FROM track_keeps WHERE listener_id='keep'").get().enabled,0);
 assert.equal(db.prepare("SELECT enabled FROM track_keeps WHERE listener_id='new-keep'").get().enabled,1);
 assert.equal(db.prepare("SELECT enabled FROM track_keeps WHERE listener_id='disabled'").get().enabled,0);
 assert.equal(db.prepare("SELECT enabled FROM track_keeps WHERE listener_id='owner'").get().enabled,1);
 assert.equal(rows(db,'release_radio_feedback_archive').length,5);db.close();
});
test('failed isolated upgrade rolls back all statements with original rows intact',()=>{
 const db=fixture(),before=rows(db,'radio_feedback');db.exec('BEGIN IMMEDIATE');
 assert.throws(()=>{execute(db,migrations[5]);db.exec('CREATE TABLE purchases(id TEXT)')});db.exec('ROLLBACK');
 assert.deepEqual(rows(db,'radio_feedback'),before);assert.throws(()=>rows(db,'v13_radio_feedback_archive'));db.close();
});

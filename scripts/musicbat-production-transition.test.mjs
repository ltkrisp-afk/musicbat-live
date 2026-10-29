import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {readMigrationFiles} from 'drizzle-orm/migrator';
const migrations=readMigrationFiles({migrationsFolder:'drizzle'}),apply=(db,m)=>m.sql.forEach(sql=>db.exec(sql));
const rows=(db,table)=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all().map(r=>({...r}));
function productionShaped(){const db=new DatabaseSync(':memory:');migrations.slice(0,5).forEach(m=>apply(db,m));
 for(let i=1;i<=5;i++)db.prepare('INSERT INTO tracks(id,artist_id,artist_name,title,audio_url,status,rights_attested) VALUES (?,?,?,?,?,\'active\',1)').run(i,'synthetic-owner','Synthetic band','Representative recording '+i,'/api/musicbat/audio/'+i+'.mp3');
 db.exec("INSERT INTO artist_accounts(artist_id,stripe_account_id) VALUES ('synthetic-owner','acct_synthetic'); INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,artist_id) VALUES ('legacy-paid','hash',1,'Representative recording 1','Synthetic band','/api/musicbat/audio/1.mp3','paid',200,180,20,'synthetic-owner'); INSERT INTO stripe_events(event_id,event_type) VALUES ('evt_synthetic','checkout.session.completed'); INSERT INTO listens(id,track_id,listener_id) VALUES ('listen-synthetic',1,'listener-synthetic'); INSERT INTO hangers(track_id,listener_id,kind) VALUES (1,'listener-synthetic','standout');");return db;}
test('production-shaped upgrade and rollback preserve all five catalog entries, accounts, old entitlements and new 85/15 payments',()=>{
 const db=productionShaped();try{
 const before=Object.fromEntries(['tracks','artist_accounts','purchases','stripe_events','listens','hangers'].map(t=>[t,rows(db,t)]));
 db.exec('BEGIN IMMEDIATE');migrations.slice(5).forEach(m=>apply(db,m));db.exec('COMMIT');
 for(const table of Object.keys(before))assert.deepEqual(rows(db,table).map(r=>Object.fromEntries(Object.keys(before[table][0]).map(k=>[k,r[k]]))),before[table]);
 assert.equal(rows(db,'direct_license_current').length,0);assert.equal(rows(db,'recording_use_reviews').length,0);
 db.exec("INSERT INTO purchases(id,buyer_hash,buyer_account_id,track_id,title,artist_name,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,processing_cents) VALUES ('new-paid','hash2','synthetic-buyer',2,'Representative recording 2','Synthetic band','/api/musicbat/audio/2.mp3','paid',200,170,30,37)");
 const finances=rows(db,'purchases'),accounts=rows(db,'artist_accounts');
 db.exec('BEGIN IMMEDIATE');db.exec(readFileSync('release/v13/rollback-signals.sql','utf8'));db.exec('COMMIT');
 assert.deepEqual(rows(db,'purchases'),finances);assert.deepEqual(rows(db,'artist_accounts'),accounts);assert.equal(rows(db,'tracks').length,5);
 assert.equal(db.prepare("SELECT artist_share_cents FROM purchases WHERE id='legacy-paid'").get().artist_share_cents,180);
 assert.equal(db.prepare("SELECT artist_share_cents FROM purchases WHERE id='new-paid'").get().artist_share_cents,170);
 }finally{db.close();}
});
test('failed transactional migration leaves original five tracks and entitlement evidence intact',()=>{
 const db=productionShaped();try{const before=rows(db,'tracks'),paid=rows(db,'purchases');db.exec('BEGIN IMMEDIATE');assert.throws(()=>{migrations.slice(5).forEach(m=>apply(db,m));db.exec('CREATE TABLE purchases(id TEXT)');});db.exec('ROLLBACK');assert.deepEqual(rows(db,'tracks'),before);assert.deepEqual(rows(db,'purchases'),paid);}finally{db.close();}
});

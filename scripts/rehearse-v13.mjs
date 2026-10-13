// Read-only export on stdin. In-memory rehearsal only: no production/network/file writes.
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {readMigrationFiles} from 'drizzle-orm/migrator';
import assert from 'node:assert/strict';
const input=JSON.parse(readFileSync(0,'utf8'));
const db=new DatabaseSync(':memory:');
const migrations=readMigrationFiles({migrationsFolder:'drizzle'});
for(const migration of migrations.slice(0,5))for(const sql of migration.sql)db.exec(sql);
const tables=['artist_accounts','hangers','listens','purchases','radio_feedback','stripe_events','track_keeps','tracks'];
const read=t=>db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all().map(r=>({...r}));
for(const t of tables){const columns=db.prepare(`PRAGMA table_info("${t}")`).all().map(r=>r.name);for(const row of input[t]){const keys=Object.keys(row);assert.ok(keys.every(k=>columns.includes(k)));db.prepare(`INSERT INTO "${t}" (${keys.map(k=>'"'+k+'"').join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}}
const before=Object.fromEntries(tables.map(t=>[t,read(t)]));
db.exec('BEGIN IMMEDIATE');for(const migration of migrations.slice(5))for(const sql of migration.sql)db.exec(sql);db.exec('COMMIT');
for(const t of tables.filter(t=>!['radio_feedback','track_keeps'].includes(t))){const originalKeys=before[t].length?Object.keys(before[t][0]):[];assert.deepEqual(read(t).map(r=>Object.fromEntries(originalKeys.map(k=>[k,r[k]]))),before[t]);}
assert.deepEqual(read('v13_radio_feedback_archive'),before.radio_feedback);
assert.deepEqual(read('v13_track_keeps_archive'),before.track_keeps);
assert.equal(read('playback_permissions').length,0);assert.equal(read('track_authority').length,0);
const report=read('release_signal_reconciliation');
const financial=read('purchases');
db.exec('BEGIN IMMEDIATE');db.exec(readFileSync('release/v13/rollback-signals.sql','utf8'));db.exec('COMMIT');
assert.deepEqual(read('purchases'),financial);assert.deepEqual(read('stripe_events'),before.stripe_events);
for(const row of before.radio_feedback){const actual=db.prepare('SELECT * FROM radio_feedback WHERE track_id=? AND listener_id=?').get(row.track_id,row.listener_id);assert.deepEqual({...actual},row);}
for(const row of before.track_keeps){const actual=db.prepare('SELECT * FROM track_keeps WHERE track_id=? AND listener_id=?').get(row.track_id,row.listener_id);assert.deepEqual({...actual},row);}
console.log(JSON.stringify({result:'PASS',sourceCounts:Object.fromEntries(tables.map(t=>[t,before[t].length])),reconciliation:report,rollback:'PASS; original choices, historical finances, tracks, listens, owners and Hangers preserved',database:'isolated memory'},null,2));db.close();

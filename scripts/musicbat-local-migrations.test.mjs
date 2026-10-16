import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {readMigrationFiles} from 'drizzle-orm/migrator';

test('journal discovers all fifteen SQL files including durable recovery',()=>{
 const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
 assert.deepEqual(journal.entries.map(e=>e.tag+'.sql'),readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort());
 const migrations=readMigrationFiles({migrationsFolder:'drizzle'});
 assert.equal(migrations.length,15);
 const db=new DatabaseSync(':memory:');
 try{
  for(const migration of migrations)for(const sql of migration.sql)db.exec(sql);
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  for(const table of ['artist_accounts','tracks','purchases','stripe_events','artist_profiles','artist_pages','radio_plus_enrollments','radio_plus_events','radio_plus_invoices'])assert.ok(tables.includes(table),table);
 }finally{db.close();}
});

test('0011 upgrades an existing schema without changing purchase or artist records and is safe to reapply',()=>{
 const db=new DatabaseSync(':memory:'),migrations=readMigrationFiles({migrationsFolder:'drizzle'});
 try{
  for(const migration of migrations.slice(0,11))for(const sql of migration.sql)db.exec(sql);
  db.exec("INSERT INTO artist_accounts(artist_id,stripe_account_id) VALUES ('fixture_artist','acct_fixture'); INSERT INTO purchases(id,buyer_hash,track_id,title,artist_name,audio_path,status,amount_cents,artist_share_cents,platform_fee_cents,processing_cents) VALUES ('historical','hash',42,'Retained','Artist','retained.wav','paid',200,170,30,37)");
  const before={purchase:db.prepare('SELECT * FROM purchases').all(),artist:db.prepare('SELECT * FROM artist_accounts').all()};
  for(let i=0;i<2;i++)for(const sql of migrations[11].sql)db.exec(sql);
  assert.deepEqual(db.prepare('SELECT * FROM purchases').all(),before.purchase);
  assert.deepEqual(db.prepare('SELECT * FROM artist_accounts').all(),before.artist);
  assert.equal(db.prepare('SELECT count(*) n FROM radio_plus_enrollments').get().n,0);
 }finally{db.close();}
});

test('local D1 configuration matches Vite identity; migration command refuses remote arguments',()=>{
 const config=JSON.parse(readFileSync('wrangler.local.json','utf8')),vite=readFileSync('vite.config.ts','utf8');
 const binding=JSON.parse(readFileSync('.openai/hosting.json','utf8')).d1;
 assert.equal(config.d1_databases[0].binding,binding);
 assert.ok(vite.includes(config.d1_databases[0].database_id));
 assert.ok(vite.includes(config.d1_databases[0].database_name));
 assert.equal(config.d1_databases[0].migrations_dir,'drizzle');
 const result=spawnSync(process.execPath,['scripts/local-d1-migrate.mjs','--remote'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/accepts no arguments/);
});

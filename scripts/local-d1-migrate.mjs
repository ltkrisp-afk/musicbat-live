// Local Miniflare D1 only. No remote flag, credentials, deployment or data reset.
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {readMigrationFiles} from 'drizzle-orm/migrator';

if(process.argv.length!==2)throw new Error('This local-only command accepts no arguments.');
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
const files=readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort();
if(JSON.stringify(files)!==JSON.stringify(journal.entries.map(e=>e.tag+'.sql')))throw new Error('Migration journal and SQL files differ; no migrations applied.');
const reference=new DatabaseSync(':memory:');
for(const migration of readMigrationFiles({migrationsFolder:'drizzle'}))for(const sql of migration.sql)reference.exec(sql);
const tableQuery="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name";
const required=reference.prepare(tableQuery).all().map(r=>r.name);
reference.close();
const childEnv={...process.env,CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'};
for(const key of Object.keys(childEnv))if(/^(STRIPE_|CLOUDFLARE_API_|CF_API_)/.test(key))delete childEnv[key];
function wrangler(args,json=false){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args,'--config','wrangler.local.json','--local','--persist-to','.wrangler/state'],{cwd:root,env:childEnv,encoding:'utf8',...(json?{}:{stdio:'inherit'})});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error('Local D1 command failed; no reset or remote fallback attempted.');
 return json?JSON.parse(result.stdout):undefined;
}
function query(sql){return wrangler(['d1','execute','site-creator-d1','--command',sql,'--json'],true).flatMap(r=>r.results??[]);}
const before=query(tableQuery).map(r=>r.name);
if(before.length&&!before.includes('d1_migrations'))throw new Error('Existing schema has no Wrangler migration ledger. Stopped to preserve it; do not replay migrations or delete the database.');
wrangler(['d1','migrations','apply','site-creator-d1']);
const after=query(tableQuery).map(r=>r.name),missing=required.filter(t=>!after.includes(t));
if(missing.length)throw new Error('Required local tables missing: '+missing.join(', '));
const applied=query('SELECT name FROM d1_migrations ORDER BY id').map(r=>r.name);
if(files.some(f=>!applied.includes(f)))throw new Error('Local migration ledger is incomplete.');
console.log(JSON.stringify({localOnly:true,persistTo:'.wrangler/state',migrations:applied.length,requiredTables:required.length,tables:after},null,2));

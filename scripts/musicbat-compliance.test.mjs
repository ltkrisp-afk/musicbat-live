import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../lib/playback-authorization.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {authorizePlayback}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const grant={recording_basis:'direct',recording_evidence:'recording-contract-v1',composition_evidence:'composition-contract-v1',reviewed_by:'reviewer',reviewed_at:100,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:100,expires_at:1000,withdrawn_at:null,territory:'worldwide'};
test('recording and composition evidence and artist authorization are independently mandatory',()=>{
 for(const changes of [{recording_evidence:''},{composition_evidence:''},{reviewed_by:''},{artist_authorized:0}]) assert.equal(authorizePlayback({...grant,...changes},'radio-plus',500,'US').allowed,false);
 assert.equal(authorizePlayback(null,'free-radio',500,'US').allowed,false);
});
test('permission start, expiry, withdrawal, territory and mode changes fail closed',()=>{
 assert.equal(authorizePlayback(grant,'radio-plus',100,'US').allowed,true);
 assert.equal(authorizePlayback(grant,'radio-plus',1000,'US').allowed,false);
 assert.equal(authorizePlayback(grant,'radio-plus',99,'US').allowed,false);
 assert.equal(authorizePlayback({...grant,withdrawn_at:500},'free-radio',500,'US').allowed,false);
 assert.equal(authorizePlayback({...grant,territory:'US'},'free-radio',500,'unknown').allowed,false);
 assert.equal(authorizePlayback({...grant,plus_allowed:0},'free-radio',500,'US').allowed,true);
 assert.equal(authorizePlayback({...grant,plus_allowed:0},'radio-plus',500,'US').allowed,false);
});
test('statutory grants cannot authorize interactive endpoint or unestablished Free Radio',()=>{
 for(const mode of ['free-radio','radio-plus']) assert.equal(authorizePlayback({...grant,recording_basis:'statutory'},mode,500,'US').allowed,false);
});
test('real audio handler denies tiny unlicensed catalog, audits decisions and rechecks withdrawal on ranges',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 for(const f of (await readdir(new URL('../drizzle',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const asset='550e8400-e29b-41d4-a716-446655440000.wav';
 sqlite.prepare("INSERT INTO tracks (artist_id,artist_name,title,audio_url,status,rights_attested) VALUES ('a','Artist','Song',?,'active',1)").run('/api/musicbat/audio/'+asset);
 let reads=0;
 const env={DB:{prepare(sql){const st=sqlite.prepare(sql);return {bind(...v){return {async first(){return st.get(...v)??null},async run(){return st.run(...v)}}}}}},BUCKET:{async head(){return {size:4,httpEtag:'test'}},async get(){reads++;return {body:new Uint8Array(4)}}}};
 globalThis.musicbatComplianceEnv=env;
 let route=(await readFile(new URL('../app/api/musicbat/audio/[assetId]/route.ts',import.meta.url),'utf8')).replace('import { env } from "cloudflare:workers";','const env=globalThis.musicbatComplianceEnv;').replace(/import \{ authorizePlayback, type Permission \} from [^;]+;/,source);
 const compiled=ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const audio=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
 const request=()=>new Request('https://musicbat.audio/api/musicbat/audio/'+asset+'?mode=free-radio');
 assert.equal((await audio.GET(request())).status,403); assert.equal(reads,0);
 sqlite.prepare('INSERT INTO playback_permissions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(1,'direct','recording','composition','reviewer',0,1,1,1,0,Date.now()+60000,null,'worldwide');
 assert.equal((await audio.GET(request())).status,200);
 sqlite.prepare('UPDATE playback_permissions SET withdrawn_at=?').run(Date.now());
 assert.equal((await audio.GET(new Request(request(),{headers:{range:'bytes=0-1'}}))).status,403);
 assert.equal((await audio.HEAD(request())).status,403);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM playback_decisions').get().n,4);
 assert.equal(reads,1); sqlite.close();
});

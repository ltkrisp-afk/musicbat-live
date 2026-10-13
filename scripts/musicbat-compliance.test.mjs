import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
test('legacy track-addressable playback remains closed even with a reviewed direct grant',async()=>{
 const route=await readFile(new URL('../app/api/musicbat/audio/[assetId]/route.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const audio=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
 assert.equal((await audio.GET()).status,410);
 const head=await audio.HEAD();assert.equal(head.status,410);assert.equal(await head.text(),'');
 assert.equal(head.headers.get('cache-control'),'private, no-store');
});

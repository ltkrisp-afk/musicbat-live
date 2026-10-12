import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
async function moduleAt(path, replacements = {}) {
 let source = await readFile(new URL(path, import.meta.url), 'utf8');
 for (const [a,b] of Object.entries(replacements)) source = source.replace(a,b);
 return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
}
const auth = await moduleAt('../lib/playback-authorization.ts');
const compliance = await moduleAt('../lib/radio-compliance.ts',{"'./playback-authorization'":JSON.stringify(auth)});
const {evaluateRadioPlayback, simulateRadioSchedule, PERFORMANCE_WINDOW_MS} = await import(compliance);
const {parseCategoryCommand,simulateCategoryRadio} = await import(await moduleAt('../lib/radio-category.ts',{"'./radio-compliance'":JSON.stringify(compliance)}));
const now=PERFORMANCE_WINDOW_MS * 2;
const evidence={reference:'SYNTHETIC ONLY',verifiedBy:'fixture',verifiedAt:0,expiresAt:now+100000};
const permission={recording_basis:'statutory',recording_evidence:'fixture',composition_evidence:'fixture',reviewed_by:'fixture',reviewed_at:0,artist_authorized:1,free_allowed:1,plus_allowed:1,starts_at:0,expires_at:now+100000,withdrawn_at:null,territory:'US'};
const track={id:'t',artistIds:['artist'],albumId:'album',compilationIds:['comp'],metadataReviewed:true,eligible:true,statutoryEligibility:evidence,permission,category:{genre:'Rock',subgenre:'Punk',style:'Hardcore'}};
const context={execution:'simulation',mode:'radio-plus',territory:'US',channelId:'shared',now,durationMs:1000,gate:Object.fromEntries(['serviceEligibility','noticeAndTiming','royaltiesAndReporting','compositionCoverage','applicableRequirements'].map(k=>[k,evidence])),channelCreatedAt:0,historyComplete:true,history:[],noninteractive:true,requirementsEnforced:true};
const channel={id:'shared',category:track.category,eligibilityReview:{reference:'synthetic legal/channel review',verifiedAt:0,expiresAt:now+100000}};
const event=(t,i)=>({channelId:'shared',track:t,startedAt:now-10000+i*1000,endedAt:now-9000+i*1000});
test('dial accepts Genre → Subgenre → Style; rejects track requests, seeking, replay and signals',()=>{
 assert.deepEqual(parseCategoryCommand(track.category),track.category);
 for(const v of [null,[],{genre:'Rock',style:'Hardcore'},{genre:'Rock',trackId:'t'},{genre:'Rock',seek:10},{genre:'Rock',replay:true},{genre:'Rock',keep:'t'},{genre:''}]) assert.equal(parseCategoryCommand(v),null);
});
test('Radio Plus category scheduling remains noninteractive and independently reviewed',()=>{
 assert.equal(simulateCategoryRadio(track.category,[channel],[track],context).track.id,'t');
 for(const channels of [[],[{...channel,eligibilityReview:null}],[channel,channel]]) assert.equal(simulateCategoryRadio(track.category,channels,[track],context).track,null);
 assert.equal(simulateCategoryRadio(track.category,[channel],[track],{...context,noninteractive:false}).track,null);
 assert.equal(simulateCategoryRadio(track.category,[channel],[track],{...context,gate:null}).track,null);
 assert.equal(simulateCategoryRadio(track.category,[channel],[track],{...context,channelId:'listener-specific'}).track,null);
 assert.equal(simulateCategoryRadio({genre:'Jazz'},[channel],[track],context).track,null);
});
test('all statutory live evaluation and delivery remain disabled including valid synthetic prerequisites',async()=>{
 for(const mode of ['free-radio','radio-plus']) assert.equal(evaluateRadioPlayback(track,{...context,mode,execution:'live'}).reason,'statutory-live-disabled');
 assert.equal(simulateCategoryRadio(track.category,[channel],[track],{...context,execution:'live'}).reason,'offline-only');
 const route=await import(await moduleAt('../app/api/musicbat/statutory-radio/route.ts'));
 for(const verb of ['GET','HEAD','POST']) {const response=await route[verb](); assert.equal(response.status,503); assert.equal(response.headers.get('cache-control'),'no-store');}
});
test('rolling album, artist and compilation caps include repeat performances and stop tiny catalogs',()=>{
 const others=Array.from({length:4},(_,i)=>({...track,id:'other'+i,albumId:'other'+i,compilationIds:[]}));
 assert.equal(evaluateRadioPlayback(track,{...context,history:others.map(event)}).reason,'artist-rolling-limit');
 const sameAlbum=others.slice(0,3).map(t=>({...t,artistIds:[t.id],albumId:'album'}));
 assert.equal(evaluateRadioPlayback(track,{...context,history:sameAlbum.map(event)}).reason,'album-rolling-limit');
 const sameComp=others.map(t=>({...t,artistIds:[t.id],compilationIds:['comp']}));
 assert.equal(evaluateRadioPlayback(track,{...context,history:sameComp.map(event)}).reason,'compilation-rolling-limit');
 const repeats=[event(track,0),event(track,1)];
 assert.equal(simulateRadioSchedule([track],{...context,history:repeats}).track,null);
});
test('consecutive limits, overlapping window boundaries and complete channel history fail closed',()=>{
 assert.equal(evaluateRadioPlayback(track,{...context,history:[event(track,0),event(track,1)]}).reason,'album-consecutive-limit');
 const artists=[0,1,2].map(i=>event({...track,id:'a'+i,albumId:'a'+i,compilationIds:[]},i));
 assert.equal(evaluateRadioPlayback(track,{...context,history:artists}).reason,'artist-consecutive-limit');
 const comp=[0,1,2].map(i=>event({...track,id:'c'+i,albumId:'c'+i,artistIds:['c'+i]},i));
 assert.equal(evaluateRadioPlayback(track,{...context,history:comp}).reason,'compilation-consecutive-limit');
 const old=Array.from({length:4},(_,i)=>({...event({...track,albumId:'old'+i},i),startedAt:now-PERFORMANCE_WINDOW_MS-10000+i*1000,endedAt:now-PERFORMANCE_WINDOW_MS-9000+i*1000}));
 const separator=event({...track,albumId:'separator',artistIds:['separator'],compilationIds:[]},0);
 assert.equal(evaluateRadioPlayback(track,{...context,history:[...old,separator]}).allowed,true);
 for(const changes of [{historyComplete:false},{history:[event(track,1),event(track,0)]},{history:[{...event(track,0),endedAt:now+1}]}]) assert.equal(evaluateRadioPlayback(track,{...context,...changes}).allowed,false);
});
test('missing rights, metadata and expiring prerequisites deny; direct rights never borrow statutory permissions',()=>{
 for(const t of [{...track,permission:{...permission,composition_evidence:''}},{...track,metadataReviewed:false},{...track,statutoryEligibility:null},{...track,eligible:false}]) assert.equal(evaluateRadioPlayback(t,context).allowed,false);
 assert.equal(evaluateRadioPlayback(track,{...context,gate:{...context.gate,serviceEligibility:{...evidence,expiresAt:now+500}}}).allowed,false);
 const direct={...track,permission:{...permission,recording_basis:'direct'}};
 assert.equal(evaluateRadioPlayback(direct,{...context,gate:null}).allowed,true);
 assert.equal(evaluateRadioPlayback({...direct,permission:{...direct.permission,plus_allowed:0}},context).allowed,false);
});

test('each statutory prerequisite is mandatory and rolling history cannot be reset by category tuning',()=>{
 for (const key of Object.keys(context.gate)) assert.equal(evaluateRadioPlayback(track,{...context,gate:{...context.gate,[key]:null}}).allowed,false);
 const boundary = {...event(track,0),startedAt:now-PERFORMANCE_WINDOW_MS-1000,endedAt:now-PERFORMANCE_WINDOW_MS+1};
 const rest=[1,2].map(i=>event({...track,id:'recent'+i,artistIds:['other'+i]},i));
 assert.equal(evaluateRadioPlayback(track,{...context,history:[boundary,...rest]}).reason,'album-rolling-limit');
 assert.equal(simulateCategoryRadio(track.category,[channel],[track],{...context,history:[event(track,0),event(track,1)]}).track,null);
 assert.equal(simulateCategoryRadio(track.category,[channel],[],context).track,null);
});
test('radio UI has no seek control or individual-track catalog selection',async()=>{
 const player=await readFile(new URL('../components/musicbat-player.tsx',import.meta.url),'utf8');
 const ui=await readFile(new URL('../app/musicbat-loop.tsx',import.meta.url),'utf8');
 assert.ok(!player.includes('audio.currentTime ='));
 assert.ok(player.includes('<progress aria-label="Playback position"'));
 assert.ok(!ui.includes('setCurrentIndex(tracks.findIndex((item) => item.id === track.id))'));
 assert.ok(ui.includes('>Tune genre</div>'));
});

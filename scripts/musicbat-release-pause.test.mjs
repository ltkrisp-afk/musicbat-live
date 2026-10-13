import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('release write pause blocks all mutable handlers before auth, processor or storage side effects',async()=>{
 for(const root of ['.']){
  for(const path of ['app/api/musicbat/route.ts','app/api/musicbat/purchase/route.ts','app/api/musicbat/stripe/connect/route.ts','app/api/musicbat/stripe/webhook/route.ts']){
   let source=ts.transpileModule(readFileSync(root+'/'+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
   source=source.replace(/^import[^;]+;\s*/gm,'');
   source='const env={MUSICBAT_RELEASE_PAUSED:"1"};\n'+source;
   const route=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
   const response=await route.POST(new Request('https://musicbat.audio/api/musicbat',{method:'POST'}));assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60');
   if(path.includes('/connect/'))assert.equal((await route.GET()).status,503);
  }
 }
});

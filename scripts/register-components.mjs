import { registerHooks } from 'node:module';
import { readFileSync,existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
 resolve(specifier,context,next){
  if(specifier==='next/link')return next('next/link.js',context);
  const base=specifier.startsWith('@/')?new URL('../'+specifier.slice(2),import.meta.url):specifier.startsWith('.')&&context.parentURL?.startsWith('file:')?new URL(specifier,context.parentURL):null;
  if(base)for(const extension of ['.tsx','.ts']){const candidate=new URL(base.href+extension);if(existsSync(fileURLToPath(candidate)))return {url:candidate.href,shortCircuit:true};}
  return next(specifier,context);
 },
 load(url,context,next){if(url.startsWith('file:')&&/\.tsx?$/.test(url))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText};return next(url,context);}
});

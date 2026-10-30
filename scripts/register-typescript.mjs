import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
// Node runtime/test entrypoints only. The application build still uses Vite.
registerHooks({
  resolve(specifier, context, next) {
    // Handler test doubles are evaluated as data URLs, which have no relative file base.
    if (context.parentURL?.startsWith('data:') && /\/lib\/(artist-rights-declaration|direct-license-draft|direct-license-final|agreement-integrity|recording-use|membership-accounting|membership-ledger|listening-observation|membership-radio-boundary|radio-plus)$/.test(specifier)) {
      return {url:new URL('../lib/'+specifier.split('/').at(-1)+'.ts',import.meta.url).href,shortCircuit:true};
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/i.test(specifier)) {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.ts')) return {
      format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    };
    return next(url, context);
  },
});

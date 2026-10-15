import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test('public UI quotes fees before Checkout, holds selected song through Radio rotation, and preserves player', async()=>{
 const original={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document};
 const requests=[],redirects=[];
 const track={id:5,title:'Unity',artist_name:'The Enucleators',audio_url:'/api/musicbat/audio/unity.mp3',created_at:'2026-09-28',signal_count:0,viewer_qualified:0,sale_enabled:1,sale_price_cents:500,seller_ready:1,can_manage:0,rotation_eligible:true};
 globalThis.window={location:{search:'',pathname:'/',assign:u=>redirects.push(u)},history:{replaceState(){}}};globalThis.document={};
 globalThis.fetch=async(url,init)=>{requests.push({url,init});if(url.includes('view=tracks'))return Response.json({tracks:[track,{...track,id:2,title:'Another song',audio_url:'/api/musicbat/audio/other.mp3'}]});if(url.includes('weight-room'))return Response.json({rows:[]});if(url.includes('stripe/connect'))return Response.json({connected:false,ready:false});if(url==='/api/musicbat/purchase'){const b=JSON.parse(init.body);if(!b.confirmedTotalCents)return Response.json({confirmationRequired:true,quote:{trackId:5,title:'Unity',baseCents:500,processingCents:46,totalCents:546,currency:'usd'}},{status:409});return Response.json({checkoutUrl:'https://checkout.stripe.com/c/pay/test_ui'})}throw new Error('Unexpected fetch '+url)};
 globalThis.publicUiReact=React;
 globalThis.publicUiComponents=Object.fromEntries(['Activity','Disc3','Gauge','Radio','ShieldCheck','Upload','MusicBatPlayer','Button','Checkbox','Input','Tabs','TabsContent','TabsList','TabsTrigger'].map(name=>[name,props=>React.createElement(name,props,props.children)]));
 let source=await readFile(new URL('../app/musicbat-loop.tsx',import.meta.url),'utf8');source=source.replace(/^import \{ ([^}]+) \} from "([^"]+)";/gm,(_,names,from)=>from==='react'?`const {${names.replace('FormEvent, ','')}}=globalThis.publicUiReact;`:from==='./rotation'?'const selectNextTrack=(tracks,current)=>tracks.find(t=>t.id!==current);':`const {${names}}=globalThis.publicUiComponents;`);
 let tree;
 try{const {default:Loop}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule('const React=globalThis.publicUiReact;\n'+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,jsxFactory:'globalThis.publicUiReact.createElement'}}).outputText).toString('base64'));await act(async()=>{tree=create(React.createElement(Loop,{displayName:'Patron'}))});const player=()=>tree.root.findByType('MusicBatPlayer');const initial=player();await act(async()=>{await tree.root.findAllByType('Button').find(b=>b.props['aria-label']==='Buy Unity').props.onClick()});assert.equal(redirects.length,0);assert.match(JSON.stringify(tree.toJSON()),/processing \$0.46/);assert.match(JSON.stringify(tree.toJSON()),/\$5.46 total/);await act(async()=>{player().props.onEnded()});assert.equal(player(),initial);assert.match(player().props.src,/other.mp3/);const confirm=tree.root.findAllByType('Button').find(b=>JSON.stringify(b.props.children).includes('Continue to Stripe'));await act(async()=>{await confirm.props.onClick()});assert.deepEqual(JSON.parse(requests.filter(r=>r.url==='/api/musicbat/purchase').at(-1).init.body),{trackId:5,confirmedTotalCents:546});assert.deepEqual(redirects,['https://checkout.stripe.com/c/pay/test_ui']);}
 finally{if(tree)await act(async()=>tree.unmount());Object.assign(globalThis,original)}
});

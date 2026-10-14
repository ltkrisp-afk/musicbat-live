import './register-components.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {create,act} from 'react-test-renderer';
const {default:MusicBatLoop}=await import('../app/musicbat-loop.tsx');
const {Tabs}=await import('../components/ui/tabs.tsx');

test('payout button shows configuration/sign-in failures beside the control and serializes clicks',async()=>{
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,self:globalThis.self,raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.self=globalThis;globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
 const window=new EventTarget();window.location={search:'',pathname:'/',origin:'http://localhost',href:'http://localhost/',assign:()=>{throw new Error('Unexpected redirect');}};globalThis.window=window;globalThis.document=new EventTarget();
 let tree,calls=0,status=503,eligible=true;
 globalThis.fetch=async(path,init)=>{
  if(String(path).includes('/stripe/connect')&&init?.method==='POST'){calls++;return Response.json({error:status===401?'Sign in to connect artist payouts.':'Stripe credential does not match the configured mode.'},{status});}
  if(String(path).includes('view=artists'))return Response.json({artists:[],canManage:eligible});
  return Response.json({tracks:[],rows:[],connected:false,ready:false});
 };
 const button=()=>tree.root.findAll(node=>node.type==='button'&&['Connect Stripe payouts','Create artist identity & connect payouts'].includes(node.props.children))[0];
 try{
  await act(async()=>{tree=create(React.createElement(MusicBatLoop,{displayName:'Artist',initialTab:'catalog'}));await new Promise(r=>setTimeout(r,10));});
  await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  const clicked=button().props.onClick;
  await act(async()=>{clicked();clicked();});assert.equal(calls,1);
  const alert=tree.root.findByProps({role:'alert'});assert.match(alert.props.children,/credential/);assert.equal(alert.parent.findAll(node=>node.type==='button'&&node.props.children==='Connect Stripe payouts').length,1);
  assert.equal(tree.root.findByType(Tabs).props.value,'catalog');assert.equal(button().props.disabled,false);
  status=401;await act(async()=>button().props.onClick());
  assert.equal(tree.root.findAll(node=>node.type==='a'&&node.props.children==='Sign in to connect artist payouts').length,1);
  await act(async()=>tree.unmount());tree=null;eligible=false;calls=0;
  await act(async()=>{tree=create(React.createElement(MusicBatLoop,{displayName:'New artist',initialTab:'catalog'}));await new Promise(r=>setTimeout(r,10));});
  await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  await act(async()=>button().props.onClick());assert.equal(calls,0);assert.match(tree.root.findByProps({role:'alert'}).props.children,/artist or band name/);
  let identities=0;const request=globalThis.fetch;globalThis.fetch=async(path,init)=>{if(init?.method==='POST'&&String(path)==='/api/musicbat'){identities++;eligible=true;return Response.json({ok:true});}return request(path,init);};
  await act(async()=>tree.root.findAll(node=>node.type==='input'&&node.props.placeholder==='Artist or band name')[0].props.onChange({target:{value:'New Band'}}));
  await act(async()=>button().props.onClick());assert.equal(identities,1);assert.equal(calls,1);
 }finally{if(tree)await act(async()=>tree.unmount());globalThis.window=saved.window;globalThis.document=saved.document;globalThis.fetch=saved.fetch;globalThis.self=saved.self;globalThis.requestAnimationFrame=saved.raf;globalThis.cancelAnimationFrame=saved.caf;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;}
});

test('client route changes select the requested view while local tab changes remain usable',async()=>{
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,self:globalThis.self,raf:globalThis.requestAnimationFrame,caf:globalThis.cancelAnimationFrame,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.self=globalThis;globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
 const window=new EventTarget();window.location={search:'',pathname:'/',origin:'http://localhost',href:'http://localhost/'};globalThis.window=window;
 globalThis.document=new EventTarget();
 globalThis.fetch=async()=>Response.json({artists:[],canManage:false,tracks:[],rows:[]});
 let tree;
 const view=props=>React.createElement(MusicBatLoop,{displayName:'Patron',...props});
 try {
  await act(async()=>{tree=create(view({initialTab:'radio'}));await new Promise(r=>setTimeout(r,10));});
  await act(async()=>tree.root.findByType(Tabs).props.onValueChange('discover'));
  assert.equal(tree.root.findByType(Tabs).props.value,'discover');
  await act(async()=>tree.update(view({initialTab:'discover'})));
  assert.equal(tree.root.findByType(Tabs).props.value,'discover');
  await act(async()=>tree.update(view({initialTab:'radio'})));
  assert.equal(tree.root.findByType(Tabs).props.value,'radio','Open Radio route must leave Discovery');
  await act(async()=>tree.root.findByType(Tabs).props.onValueChange('discover'));
  await act(async()=>window.dispatchEvent(new Event('musicbat:open-radio')));
  assert.equal(tree.root.findByType(Tabs).props.value,'radio','Open Radio must also work when the URL is already Radio');
  await act(async()=>tree.update(view({artistSlug:'alpha'})));
  assert.equal(tree.root.findByType(Tabs).props.value,'discover');
  await act(async()=>tree.root.findByType(Tabs).props.onValueChange('radio'));
  await act(async()=>tree.update(view({artistSlug:'beta'})));
  assert.equal(tree.root.findByType(Tabs).props.value,'discover','a new artist route must show that artist');
 }finally{
  if(tree)await act(async()=>tree.unmount());
  globalThis.window=saved.window;globalThis.document=saved.document;globalThis.fetch=saved.fetch;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;
  globalThis.self=saved.self;globalThis.requestAnimationFrame=saved.raf;globalThis.cancelAnimationFrame=saved.caf;
 }
});

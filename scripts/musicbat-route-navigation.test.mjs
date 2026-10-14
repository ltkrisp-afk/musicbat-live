import './register-components.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {create,act} from 'react-test-renderer';
const {default:MusicBatLoop}=await import('../app/musicbat-loop.tsx');
const {Tabs}=await import('../components/ui/tabs.tsx');

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

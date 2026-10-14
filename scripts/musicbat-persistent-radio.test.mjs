import './register-components.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {create,act} from 'react-test-renderer';
const {PersistentRadioProvider,useRadioCallbacks}=await import('../components/persistent-radio.tsx');
const {RadioPlusMembership}=await import('../components/radio-plus-membership.tsx');

test('one live audio element and volume survive screen replacement and membership dialog',async()=>{
 const saved={document:globalThis.document,window:globalThis.window,self:globalThis.self,fetch:globalThis.fetch,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.self=globalThis;
 const document=new EventTarget();document.visibilityState='visible';globalThis.document=document;
 const window=new EventTarget();window.location={href:'http://localhost:5173/',origin:'http://localhost:5173',pathname:'/',search:''};globalThis.window=window;
 const now=Date.now(),state={snapshot:{channelId:'free',category:null,status:'playing',serverNow:now,simulation:false,performance:{trackId:'1',authorityId:'0:1',startedAt:now,endsAt:now+30000,offsetMs:0}},navigation:[],mediaUrl:'/api/musicbat/channel/audio?channel=free&sequence=0%3A1'};
 globalThis.fetch=async input=>String(input).includes('/subscription')?Response.json({available:false,active:false,paidUntil:0,cancelAtPeriodEnd:false,status:'unavailable'}):Response.json(state);
 const audio={paused:true,muted:false,volume:1,currentTime:0,readyState:0,src:'',pauses:0,loads:0,getAttribute(name){return name==='src'?this.src:null;},removeAttribute(){this.src='';},load(){this.loads++;},play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;this.pauses++;}};
 let audioRefs=0,tree;const heard=[];let opened=false;
 const mocks=node=>node.type==='audio'?(audioRefs++,audio):node.type==='dialog'?{showModal(){opened=true;},close(){opened=false;}}:{};
 function Screen({name}){useRadioCallbacks({onError:()=>{},onPlay:()=>heard.push(name),onProgress:()=>{},onEnded:()=>{}});return React.createElement('div',null,name,React.createElement(RadioPlusMembership));}
 const view=name=>React.createElement(PersistentRadioProvider,null,React.createElement(Screen,{name,key:name}));
 try {
  await act(async()=>{tree=create(view('Radio'),{createNodeMock:mocks});await new Promise(r=>setTimeout(r,10));});
  await act(async()=>{await new Promise(r=>setTimeout(r,10));});
  await act(async()=>{tree.root.findByProps({'aria-label':'Play Radio'}).props.onClick();tree.root.findByType('audio').props.onPlay();});
  assert.equal(audio.paused,false);assert.equal(audioRefs,1);
  await act(async()=>tree.root.findByProps({'aria-label':'Volume'}).props.onChange({target:{value:'0.35'}}));
  await act(async()=>tree.root.findByProps({'aria-label':'Mute Radio'}).props.onClick());assert.equal(audio.muted,true);
  const loads=audio.loads,pauses=audio.pauses,src=audio.src;
  let radioRequested=0;window.addEventListener('musicbat:open-radio',()=>radioRequested++);
  await act(async()=>tree.root.findAllByProps({children:'Open Radio'}).find(node=>node.props.onNavigate).props.onNavigate());
  assert.equal(radioRequested,1);assert.equal(audio.pauses,pauses);assert.equal(audio.loads,loads);
  for(const name of ['Discovery','Artist page','Manage Songs','Radio']){
   await act(async()=>tree.update(view(name)));
   assert.equal(audioRefs,1);assert.equal(tree.root.findAllByType('audio').length,1);assert.equal(audio.volume,0.35);assert.equal(audio.muted,true);assert.equal(audio.paused,false);assert.equal(audio.src,src);assert.equal(audio.loads,loads);assert.equal(audio.pauses,pauses);
  }
  await act(async()=>{tree.root.findByProps({children:'About Radio Plus · planned $3/month'}).props.onClick();});
  assert.equal(opened,true);assert.equal(audio.paused,false);assert.equal(audio.volume,0.35);assert.equal(audioRefs,1);
  await act(async()=>tree.root.findByType('audio').props.onPlay());assert.equal(heard.at(-1),'Radio');
 }finally{if(tree)await act(async()=>tree.unmount());globalThis.self=saved.self;globalThis.document=saved.document;globalThis.window=saved.window;globalThis.fetch=saved.fetch;globalThis.IS_REACT_ACT_ENVIRONMENT=saved.act;}
});

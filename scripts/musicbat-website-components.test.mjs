import './register-components.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {ArtistDiscovery}=await import('../components/artist-discovery.tsx');
const {default:MusicBatLoop}=await import('../app/musicbat-loop.tsx');
const {ArtistRotunda}=await import('../components/artist-rotunda.tsx');
const {RetrofuturaRadio}=await import('../components/retrofutura-radio.tsx');
const artists=[{artist_id:'a',slug:'stable-a',artist_name:'Alpha Band',track_count:1,following:1},{artist_id:'b',slug:'stable-b',artist_name:'Beta Band',track_count:0,following:0}];
const tracks=[{id:42,artist_id:'a',title:'Alpha release',primary_genre:'Rock',subgenre:'Punk',sale_enabled:0,sale_price_cents:null,seller_ready:0}];
const props={artists,tracks,search:'',onSearch:()=>{},followingOnly:false,onFollowingOnly:()=>{},loading:false,error:'',onRetry:()=>{},followBusy:false,onFollow:()=>{},purchaseBusy:false,onBuy:()=>{},onRadio:()=>{},message:''};
const html=p=>renderToStaticMarkup(createElement(ArtistDiscovery,{...props,...p}));
function elements(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(elements)];}
test('discovery search and Following show only matching artists and their own releases',()=>{
 assert.match(html({}),/Alpha release/);assert.match(html({}),/Beta Band/);
 assert.doesNotMatch(html({followingOnly:true}),/Beta Band/);
 assert.doesNotMatch(html({search:'  bETA '}),/Alpha release/);
 assert.match(html({search:'unknown'}),/No artists found/);
});
test('stable artist page filters releases and provides explicit return and Radio navigation',()=>{
 const view=html({artistSlug:'stable-a'});assert.match(view,/href="\/stable-a"/);assert.match(view,/href="\/\?view=discover"/);assert.doesNotMatch(view,/Beta Band|Search artists/);
 let played=false;const tree=ArtistDiscovery({...props,onRadio:()=>{played=true}});elements(tree).find(e=>e.type==='button'&&e.props.children==='Listen through Bat Radio').props.onClick();assert.equal(played,true);
});
test('directory failures and loading cannot be mistaken for an empty catalog and can retry',()=>{
 assert.match(html({artists:[],loading:true}),/Loading artists/);assert.doesNotMatch(html({artists:[],loading:true}),/No artists found/);
 assert.match(html({artists:[],error:'Directory unavailable'}),/role="alert"/);assert.doesNotMatch(html({artists:[],error:'Directory unavailable'}),/No artists found/);
 let retried=false;elements(ArtistDiscovery({...props,error:'Unavailable',onRetry:()=>{retried=true}})).find(e=>e.props?.children==='Retry artists').props.onClick();assert.equal(retried,true);
});
test('follow controls reflect persisted state, serialize UI actions and target the selected artist',()=>{
 let target;const tree=ArtistDiscovery({...props,onFollow:a=>{target=a.artist_id}});const buttons=elements(tree).filter(e=>e.type==='button'&&/follow artist/i.test(e.props.children));
 assert.equal(buttons[0].props['aria-pressed'],true);buttons[1].props.onClick();assert.equal(target,'b');
 const busy=elements(ArtistDiscovery({...props,followBusy:true})).filter(e=>e.type==='button'&&/follow artist/i.test(e.props.children));assert.ok(busy.every(e=>e.props.disabled));
});
test('patron shell excludes artist navigation and direct artist-only tab content',()=>{
 for(const initialTab of ['radio','rotunda','shock']){const rendered=renderToStaticMarkup(createElement(MusicBatLoop,{displayName:'Patron',initialTab}));assert.doesNotMatch(rendered,/Manage Songs|Save identity|Remove Song|Listening is exposure\. Choice is signal/);}
});
test('Manage Songs provides upload control linked to parent navigation',()=>{
 const rendered=renderToStaticMarkup(createElement(ArtistRotunda,{onChange:async()=>{},onUpload:()=>{}}));assert.match(rendered,/>Add Track<\/button>/);assert.doesNotMatch(rendered,/Use Add Music/);
});
test('Retrofutura locks ineligible Plus channels while preserving Free Radio and rotary browsing',()=>{
 const free={category:null,dormant:false,locked:false},plus={category:{genre:'Rock'},dormant:false,locked:true};
 let tree;function Capture(){tree=RetrofuturaRadio({options:[free,plus],snapshot:null,onTune:async()=>{}});return tree;}
 const rendered=renderToStaticMarkup(createElement(Capture)),buttons=elements(tree).filter(e=>e.type==='button');
 assert.equal(buttons.find(e=>e.props['aria-label']==='Push dial to tune category').props.disabled,true);
 assert.equal(buttons.find(e=>e.props.children==='Free Radio · continuous discovery').props.disabled,false);
 assert.equal(buttons.find(e=>e.props['aria-label']==='Turn dial forward').props.disabled,false);
 assert.match(rendered,/BAT RADIO/);assert.match(rendered,/Radio Plus required/);
});

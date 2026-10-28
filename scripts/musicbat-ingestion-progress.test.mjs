import './register-components.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const {ReviewProgress}=await import('../components/ingestion-progress.tsx');
const now=1800000000000;
const html=props=>renderToStaticMarkup(createElement(ReviewProgress,{title:'Test recording',state:'PENDING',now,deadline:now+3600000,...props}));
test('countdown measures time budget and never pretends it is inspection completion',()=>{
 assert.match(html({}),/1h 0m remaining/);assert.match(html({}),/review window elapsed/);assert.match(html({}),/Checks can finish sooner/);
 assert.match(html({deadline:now-1}),/checks are still pending/);assert.doesNotMatch(html({deadline:now-1}),/Technical checks passed/);
 assert.doesNotMatch(html({now:0}),/<progress/);assert.doesNotMatch(html({deadline:null}),/<progress/);
});
test('held, rejected and completed statuses replace countdown without promising rights clearance',()=>{
 assert.match(html({held:true,state:'VERIFIED'}),/Review on hold/);
 assert.match(html({state:'FAILED'}),/Technical checks failed/);
 const complete=html({state:'VERIFIED'});assert.match(complete,/checked separately/);assert.doesNotMatch(complete,/<progress/);
 assert.match(html({state:'CLAIMED'}),/Checking your audio/);
});

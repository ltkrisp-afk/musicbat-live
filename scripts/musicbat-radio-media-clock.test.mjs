import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptRadioPlayEvent,correctRadioMediaOffset} from '../lib/radio-media-clock.ts';

test('slow hosted range seek completes before later guard ticks can replace it',()=>{
 let position=0,seeks=0;
 const media={readyState:1,seeking:false,get currentTime(){return position;},set currentTime(value){position=value;this.seeking=true;seeks++;}};
 correctRadioMediaOffset(media,30);
 assert.equal(seeks,1);
 for(let n=1;n<=20;n++)correctRadioMediaOffset(media,30+n/10);
 assert.equal(seeks,1,'pending range request must not be cancelled by clock correction');
 media.seeking=false;media.readyState=4;
 correctRadioMediaOffset(media,32.1);
 assert.equal(seeks,2,'shared clock correction resumes after seek completion');
 assert.equal(position,32.1);
});

test('clock correction retains the 100 ms drift bound and waits for metadata',()=>{
 const media={readyState:0,seeking:false,currentTime:0};
 correctRadioMediaOffset(media,20);assert.equal(media.currentTime,0);
 media.readyState=4;media.currentTime=10;
 correctRadioMediaOffset(media,10.05);assert.equal(media.currentTime,10);
 correctRadioMediaOffset(media,10.2);assert.equal(media.currentTime,10.2);
});

test('delayed media play event cannot override a newer pause request',async()=>{
 let wanted=true,paused=true;
 const media={pause(){paused=true;}};
 const pendingPlay=Promise.resolve().then(()=>{paused=false;return acceptRadioPlayEvent(media,wanted);});
 wanted=false;media.pause();
 assert.equal(await pendingPlay,false);assert.equal(paused,true);
 wanted=true;assert.equal(acceptRadioPlayEvent(media,wanted),true);
});

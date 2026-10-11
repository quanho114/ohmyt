import assert from 'node:assert/strict';
import {browserBounds} from '../src/browserBounds.ts';
for(let frame=0;frame<=300;frame++){
 const left=690.25-frame*0.413;
 const bounds=browserBounds({left,top:37.4,right:1195.1,bottom:719.2});
 assert.equal(bounds.x+bounds.width,1195);
 assert.equal(bounds.y+bounds.height,719);
 assert(bounds.width>0 && bounds.height>0);
}
for(let frame=0;frame<=300;frame++){
 const left=1400-frame*2.137;
 const bounds=browserBounds({left,top:37.4,right:left+532.9,bottom:719.2},533);
 assert.equal(bounds.width,533,'sliding must not alternate native width at fractional coordinates');
 assert.equal(bounds.x,Math.round(left));
}
console.log('PASS native browser bounds: fixed right/bottom edges across fractional sidebar animation');

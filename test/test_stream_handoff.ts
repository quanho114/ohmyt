import assert from 'node:assert/strict';
import {visibleSavedMessages} from '../src/streamHandoff.ts';
import type {Message} from '../src/types.ts';
const rows: Message[] = [
 {id:'old',session_id:'A',sender:'agent',content:'Same answer',metadata:JSON.stringify({activity:{runId:'old-run'}}),created_at:1},
 {id:'user',session_id:'A',sender:'user',content:'Hello',created_at:2},
 {id:'new',session_id:'A',sender:'agent',content:'Same answer',metadata:JSON.stringify({activity:{runId:'live-run'}}),created_at:3}
];
assert.deepEqual(visibleSavedMessages(rows,'live-run').map(m=>m.id),['old','user']);
assert.equal(visibleSavedMessages(rows,null),rows);
assert.equal(visibleSavedMessages(rows,'other-run').length,3);
console.log('✓ Live/saved handoff avoids duplicate replies without hiding earlier identical answers');

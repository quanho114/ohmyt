import {enqueuePermission,removePermission} from '../src/harness/permissionQueue.ts';
import assert from 'node:assert/strict';
import {ClientRegistry} from '../src/harness/clientRegistry.ts';
import {foldEvents} from '../src/harness/conversationReducer.ts';
const registry=new ClientRegistry();const remove=registry.registerContribution('one',{id:'text',slot:'artifact.renderer',priority:1,render:()=>null});assert.throws(()=>registry.registerContribution('two',{id:'text',slot:'artifact.renderer',priority:2,render:()=>null}));assert.equal(registry.list('artifact.renderer').length,1);remove();assert.equal(registry.list('artifact.renderer').length,0);
const event={sessionId:'s',seq:1,eventId:'e',version:1,type:'artifact/update',payload:{artifactId:'a',version:1},createdAt:1};const state=foldEvents(undefined,[event,event]);assert.equal(state.events.length,1);assert.throws(()=>foldEvents(state,[{...event,seq:3,eventId:'gap'}]),/gap/);console.log('Client registry lifecycle and event dedupe passed');

const requests=enqueuePermission(enqueuePermission([],{requestId:'first'}),{requestId:'second'});assert.deepEqual(removePermission(requests,'first'),[{requestId:'second'}]);assert.equal(enqueuePermission(requests,{requestId:'second'}).length,2);

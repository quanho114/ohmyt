import assert from 'node:assert/strict';
import {validateArguments} from '../server/harness/schema.js';
const schema={type:'object',properties:{rows:{type:'array',maxItems:2,items:{type:'object',properties:{count:{type:'integer',minimum:1}},required:['count'],additionalProperties:false}}},required:['rows'],additionalProperties:false};
assert.doesNotThrow(()=>validateArguments(schema,{rows:[{count:1}]}));
for(const args of [{rows:[{count:0}]},{rows:[{count:'1'}]},{rows:[{count:1,extra:1}]},JSON.parse('{"rows":[],"__proto__":{}}')])assert.throws(()=>validateArguments(schema,args));
console.log('Nested JSON schemas and prototype keys passed');

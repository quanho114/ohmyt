import {parseDocument} from 'yaml';
import {validateArguments} from './schema.js';
export function validateManifest(manifest){
  if(!manifest||typeof manifest.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(manifest.id)||manifest.version!==1||!Array.isArray(manifest.requires)||!Array.isArray(manifest.capabilities))throw new Error('Invalid extension manifest');
  return manifest;
}
const profileSchema={type:'object',properties:{id:{type:'string',pattern:'^[a-zA-Z0-9][a-zA-Z0-9/_-]*$'},version:{const:1},name:{type:'string',maxLength:100},plugins:{type:'array',items:{type:'string'},uniqueItems:true},budgets:{type:'object',properties:Object.fromEntries(['maxSteps','browserMaxSteps','contextTokens','reserveTokens','toolResultTokens'].map(key=>[key,{type:'integer',minimum:1,maximum:key.endsWith('Steps')?100:1000000}])),additionalProperties:false},model:{type:'object',properties:{providerId:{type:'string'},modelId:{type:'string'}},required:['providerId','modelId'],additionalProperties:false},scope:{type:'string'}},required:['id','version'],additionalProperties:false};
export function validateProfile(profile){validateArguments(profileSchema,profile);if(profile.budgets?.reserveTokens>=profile.budgets?.contextTokens)throw new Error('Reserve must be smaller than context');return profile;}
export function parseProfile(text){const doc=parseDocument(text,{uniqueKeys:true,customTags:[]});if(doc.errors.length)throw new Error(doc.errors[0].message);const value=doc.toJS({maxAliasCount:20});if(Object.keys(value || {}).some(key=>!Object.hasOwn(profileSchema.properties,key)))throw new Error('Unknown profile field');return validateProfile(value);}
export function resolveProfile(base,projectPatch={},explicitPatch={}){const result={...base,...projectPatch,...explicitPatch,budgets:{...base.budgets,...projectPatch.budgets,...explicitPatch.budgets}};return validateProfile(result);}

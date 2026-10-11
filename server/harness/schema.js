import Ajv from 'ajv';
const ajv=new Ajv({allErrors:true,strict:false,validateFormats:false,ownProperties:true});
const compiled=new WeakMap();
export function validateArguments(schema,args){
  rejectKeys(args);
  let validate=compiled.get(schema);if(!validate){validate=ajv.compile(schema);compiled.set(schema,validate);}
  if(!validate(args))throw new Error(`Invalid arguments: ${ajv.errorsText(validate.errors,{separator:'; '})}`);
  return args;
}
function rejectKeys(value){
  if(!value||typeof value!=='object')return;
  for(const [key,item]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Unsafe argument key');rejectKeys(item);}
}

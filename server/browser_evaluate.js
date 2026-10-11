import {parseExpressionAt} from 'acorn';
// A bounded JavaScript expression interpreter over a sanitized observation. It
// never executes source in Node or the page; prototype/network/storage access and
// mutations are impossible. This is suitable for DOM-derived calculations.
const denied=new Set(['__proto__','constructor','prototype']);
export function evaluateBrowserExpression(source,page){
  const ast=parseExpressionAt(source,0,{ecmaVersion:2022});
  if(source.slice(ast.end).trim())throw Error('One JavaScript expression required.');
  let budget=5000;
  const evaluate=(node,locals={})=>{
    if(--budget<0)throw Error('Evaluation budget exceeded.');
    switch(node.type){
      case 'Literal':if(node.regex||typeof node.value==='bigint')throw Error('Unsupported literal.');return node.value;
      case 'Identifier':if(node.name==='page')return page;if(Object.hasOwn(locals,node.name))return locals[node.name];throw Error('Unknown evaluation identifier.');
      case 'ArrayExpression':return node.elements.map(item=>evaluate(item,locals));
      case 'ObjectExpression':{const out=Object.create(null);for(const prop of node.properties){if(prop.type!=='Property'||prop.kind!=='init'||prop.method||prop.computed)throw Error('Unsupported object.');const key=prop.key.name??prop.key.value;if(denied.has(key))throw Error('Property denied.');out[key]=evaluate(prop.value,locals);}return out;}
      case 'MemberExpression':{const object=evaluate(node.object,locals),key=node.computed?evaluate(node.property,locals):node.property.name;if(denied.has(String(key))||object===null||object===undefined)throw Error('Property denied.');if(key==='length'&&(Array.isArray(object)||typeof object==='string'))return object.length;if(!Object.hasOwn(Object(object),key))throw Error('Unknown observation property.');return object[key];}
      case 'UnaryExpression':{const value=evaluate(node.argument,locals);if(node.operator==='!')return !value;if(node.operator==='-')return -Number(value);if(node.operator==='+')return Number(value);throw Error('Operator denied.');}
      case 'BinaryExpression':{const a=evaluate(node.left,locals),b=evaluate(node.right,locals);if(!['string','number','boolean'].includes(typeof a)||!['string','number','boolean'].includes(typeof b))throw Error('Scalar operands required.');switch(node.operator){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':return a/b;case '===':return a===b;case '!==':return a!==b;case '>':return a>b;case '<':return a<b;case '>=':return a>=b;case '<=':return a<=b;default:throw Error('Operator denied.');}}
      case 'LogicalExpression':{const left=evaluate(node.left,locals);if(node.operator==='&&')return left&&evaluate(node.right,locals);if(node.operator==='||')return left||evaluate(node.right,locals);if(node.operator==='??')return left??evaluate(node.right,locals);throw Error('Operator denied.');}
      case 'ConditionalExpression':return evaluate(node.test,locals)?evaluate(node.consequent,locals):evaluate(node.alternate,locals);
      case 'CallExpression':{
        if(node.callee.type!=='MemberExpression'||node.callee.computed)throw Error('Function calls denied.');
        const object=evaluate(node.callee.object,locals),method=node.callee.property.name;
        if(Array.isArray(object)&&['map','filter','some','every'].includes(method)){
          const fn=node.arguments[0];if(node.arguments.length!==1||fn?.type!=='ArrowFunctionExpression'||fn.body.type==='BlockStatement'||fn.params.length!==1||fn.params[0].type!=='Identifier')throw Error('One expression callback required.');
          return object[method](item=>evaluate(fn.body,{...locals,[fn.params[0].name]:item}));
        }
        if(typeof object==='string'&&['includes','startsWith','endsWith','toLowerCase','toUpperCase','slice'].includes(method)){
          const args=node.arguments.map(arg=>evaluate(arg,locals));if(args.length>2||args.some(arg=>!['number','string'].includes(typeof arg)))throw Error('Invalid string arguments.');return object[method](...args);
        }
        throw Error('Function calls denied.');
      }
      default:throw Error('JavaScript construct denied.');
    }
  };
  const result=evaluate(ast);const encoded=JSON.stringify(result);
  if(encoded===undefined||encoded.length>100000)throw Error('Evaluation output exceeds limit.');return JSON.parse(encoded);
}

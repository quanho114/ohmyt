import assert from 'node:assert/strict';
import {evaluateBrowserExpression as evaluate} from '../server/browser_evaluate.js';
const page={title:'Fixture',elements:[{tag:'button',text:'Save'},{tag:'input',text:'Message'}]};
assert.equal(evaluate('page.title',page),'Fixture');assert.deepEqual(evaluate('page.elements.filter(e => e.tag === "button").map(e => e.text)',page),['Save']);assert.equal(evaluate('page.elements.length + 2',page),4);
for(const source of ['process.env','page.constructor.constructor("return process")()','page["__proto__"]','fetch("https://example.com")','page.title = "changed"','(()=> {while(true){}})()','page.title; process.env','new Function("return 1")()'])assert.throws(()=>evaluate(source,page));
assert.throws(()=>evaluate('page.elements.map(e => e.text)',{elements:Array(6000).fill({text:'a'})}),/budget/);
console.log('PASS bounded JavaScript: observation calculations, prototype/host/mutation/code denial, execution budget');

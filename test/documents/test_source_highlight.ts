import assert from 'node:assert/strict';
import {highlightSource} from '../../src/documents/sourceHighlight.ts';

for(const [name,code,language] of [
  ['Widget.tsx','export const Widget = () => <button title="Go">Go</button>;','typescript'],
  ['Main.kt','data class User(val name: String)','kotlin'],
  ['app.dart','class User { final String name = "Ada"; }','dart'],
  ['View.swift','struct View { let title = "Hello" }','swift'],
  ['style.scss','$accent: #fff; .card { color: $accent; }','scss'],
  ['Dockerfile','FROM node:24\nWORKDIR /app\nCOPY . .','dockerfile'],
  ['Makefile','build:\n\tnpm run build','makefile'],
  ['Widget.vue','<template><button :title="name">Hello</button></template>','xml'],
] as const){
  const result=await highlightSource(name,code);
  assert.equal(result.language,language,name);
  assert.match(result.html,/hljs-/,name);
}
const escaped=await highlightSource('page.html','<script>window.pwned=true</script>');
assert(!escaped.html.includes('<script>'));
assert(escaped.html.includes('&lt;'));
const large=await highlightSource('big.js','export const x = "hello";\n'.repeat(12000));
assert.match(large.html,/hljs-keyword/);
assert(large.plainTail.length>0,'Large source retains a highlighted prefix instead of losing all color');
assert.equal(large.highlightedCharacters+large.plainTail.length,'export const x = "hello";\n'.repeat(12000).length);
console.log('Source highlighting: extra languages, special filenames, escaped markup and bounded large files passed');

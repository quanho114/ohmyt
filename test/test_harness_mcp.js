import assert from 'node:assert/strict';
import {McpConnection} from '../server/harness/mcp.js';
assert.throws(()=>new McpConnection({id:'x',transport:'stdio',command:'sh',args:['-c','danger']}),/shell/);
assert.throws(()=>new McpConnection({id:'bad space',transport:'http',url:'file:///etc/passwd'}));
const connection=new McpConnection({id:'local',transport:'stdio',command:process.execPath,args:['test/fixtures/harness/mcp-server.js']});await connection.connect();const tools=await connection.listTools();assert.equal(tools[0].name,'echo');const result=await connection.call('echo',{value:'observed'},new AbortController().signal);assert.equal(result.content[0].text,'observed');await connection.close();console.log('Real MCP stdio lifecycle and execution passed');

const cyclic=new McpConnection({id:'cycle',transport:'stdio',command:process.execPath,args:[]});cyclic.client.listTools=async()=>({tools:[],nextCursor:'same'});await assert.rejects(cyclic.listTools(),/pagination/);cyclic.client.listResources=async()=>({resources:[],nextCursor:'same'});await assert.rejects(cyclic.listResources(),/pagination/);

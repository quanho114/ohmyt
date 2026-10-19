import assert from 'node:assert/strict';
import {parseMcpConfig} from '../../shared/mcp_config.ts';
assert.deepEqual(parseMcpConfig('{"mcpServers":{"demo":{"command":"npx","args":["-y","demo"]}}}'),{name:'demo',transport:'stdio',command:'npx',args:'-y\ndemo',url:'',token:''});
assert.equal(parseMcpConfig('{"url":"https://example.com/mcp","type":"streamable-http"}').transport,'http');
for(const value of ['null','[]','{"mcpServers":{}}','{"mcpServers":{"a":{},"b":{}}}','{"command":"npx","env":{"KEY":"secret"}}','{"url":"https://example.com","headers":{"Authorization":"secret"}}','{"type":"sse","url":"https://example.com"}','{"command":"npx","args":[1]}','{"command":"npx","args":["a\\nb"]}'])assert.throws(()=>parseMcpConfig(value));
console.log('MCP JSON import: local, remote and unsupported fields passed');

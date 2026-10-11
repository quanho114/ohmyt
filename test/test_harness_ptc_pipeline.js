import assert from 'node:assert/strict';
import {createDaemon} from '../server/index.js';
const daemon=createDaemon({dbPath:':memory:',port:0});await daemon.harness.ready;assert.equal(typeof daemon.harness.ptc?.execute,'function','PTC must be wired to the host');
await daemon.stop();console.log('PTC host wiring passed');

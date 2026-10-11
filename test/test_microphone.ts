import assert from 'node:assert/strict';
import { openMicrophone } from '../src/microphone.ts';
const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
const fail = (name: string) => Object.assign(new Error(name), { name });
let calls: MediaStreamConstraints[] = [];
assert.equal(await openMicrophone({
  async getUserMedia(constraints) {
    calls.push(constraints!);
    if (calls.length < 3) throw fail('NotFoundError');
    return stream;
  },
  async enumerateDevices() { return [{ kind: 'audioinput', deviceId: 'usb-mic' }] as MediaDeviceInfo[]; },
}), stream);
assert.deepEqual(calls[2], { audio: { deviceId: { exact: 'usb-mic' } } });
let enumerated = false;
await assert.rejects(openMicrophone({
  async getUserMedia() { throw fail('NotAllowedError'); },
  async enumerateDevices() { enumerated = true; return []; },
}), { name: 'NotAllowedError' });
assert.equal(enumerated, false);
await assert.rejects(openMicrophone({
  async getUserMedia() { throw fail('NotFoundError'); },
  async enumerateDevices() { return []; },
}), { name: 'NotFoundError' });
console.log('test_microphone OK');

let stopped = false;
let attempt = 0;
assert.equal(await openMicrophone({
  async getUserMedia() {
    if (++attempt > 1) return stream;
    return { getAudioTracks: () => [{ label: 'Monitor of speakers' }], getTracks: () => [{ stop() { stopped = true; } }] } as unknown as MediaStream;
  },
  async enumerateDevices() { return [{ kind: 'audioinput', deviceId: 'physical', label: 'Internal microphone' }] as MediaDeviceInfo[]; },
}), stream);
assert.equal(stopped, true);

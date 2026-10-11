import assert from 'node:assert/strict';
import { isImageFile, extractImageFiles, mergeImageAttachments } from '../src/imageAttachments.ts';

// Test isImageFile
assert.ok(isImageFile({ type: 'image/png', name: 'test.png' } as File));
assert.ok(isImageFile({ type: 'image/jpeg', name: 'photo.jpg' } as File));
assert.ok(isImageFile({ type: 'image/jpg', name: 'photo' } as File));
assert.ok(isImageFile({ type: 'image/webp', name: 'image.webp' } as File));
assert.ok(isImageFile({ type: 'image/gif', name: 'animation.gif' } as File));
assert.ok(isImageFile({ type: '', name: 'screenshot.png' } as File));
assert.ok(isImageFile({ type: '', name: 'photo.JPEG' } as File));
assert.ok(!isImageFile({ type: 'text/plain', name: 'notes.txt' } as File));
assert.ok(!isImageFile({ type: 'application/pdf', name: 'doc.pdf' } as File));
assert.ok(!isImageFile({ type: '', name: 'script.js' } as File));

// Test extractImageFiles with mock DataTransfer
const mockPng = { name: 'shot.png', size: 1024, lastModified: 100, type: 'image/png' } as File;
const mockJpg = { name: 'pic.jpg', size: 2048, lastModified: 200, type: '' } as File;
const mockTxt = { name: 'a.txt', size: 50, lastModified: 300, type: 'text/plain' } as File;

// Case 1: items with getAsFile
const dt1 = {
  items: [
    { kind: 'file', getAsFile: () => mockPng },
    { kind: 'file', getAsFile: () => mockTxt },
    { kind: 'string', getAsFile: () => null }
  ],
  files: []
} as unknown as DataTransfer;
const res1 = extractImageFiles(dt1);
assert.equal(res1.length, 1);
assert.equal(res1[0].name, 'shot.png');

// Case 2: files list (e.g. copied from OS Explorer or drag dropped)
const dt2 = {
  items: [],
  files: [mockPng, mockJpg, mockTxt]
} as unknown as DataTransfer;
const res2 = extractImageFiles(dt2);
assert.equal(res2.length, 2);
assert.equal(res2[0].name, 'shot.png');
assert.equal(res2[1].name, 'pic.jpg');

// Case 3: both items and files with duplicate
const dt3 = {
  items: [{ kind: 'file', getAsFile: () => mockPng }],
  files: [mockPng]
} as unknown as DataTransfer;
const res3 = extractImageFiles(dt3);
assert.equal(res3.length, 1);

// Clipboard views can wrap the same image with different timestamps/names.
const dt4 = {
  items: [{ kind: 'file', getAsFile: () => mockPng }],
  files: [{ ...mockPng, name: 'image.png', lastModified: 101 }]
} as unknown as DataTransfer;
assert.deepEqual(extractImageFiles(dt4), [mockPng]);

// Preserve multiple actual images from the authoritative items view.
const dt5 = {
  items: [mockPng, mockJpg].map(file => ({ kind: 'file', getAsFile: () => file })),
  files: [{ ...mockPng, lastModified: 101 }, mockJpg]
} as unknown as DataTransfer;
assert.deepEqual(extractImageFiles(dt5), [mockPng, mockJpg]);

// Fall back when items cannot provide an image file.
const dt6 = {
  items: [{ kind: 'file', getAsFile: () => null }],
  files: [mockPng]
} as unknown as DataTransfer;
assert.deepEqual(extractImageFiles(dt6), [mockPng]);

console.log('PASS image extraction: file types, OS clipboard files, deduplication, item filtering');

const imageA = { name: 'screenshot.png', dataUrl: 'data:image/png;base64,AAAA' };
const duplicateA = { ...imageA, name: 'image.png' };
const imageB = { name: 'other.png', dataUrl: 'data:image/png;base64,BBBB' };
assert.deepEqual(mergeImageAttachments([], [imageA, duplicateA]), [imageA]);
assert.deepEqual(mergeImageAttachments([imageA], [duplicateA, imageB]), [imageA, imageB]);
assert.deepEqual(mergeImageAttachments([], [imageA]), [imageA]);
console.log('PASS image content deduplication: duplicate batch, repeated paste, distinct images');

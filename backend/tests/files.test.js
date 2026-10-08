const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

// files.js needs mongoose only for GridFS; stub it so the validation rules can be tested without a DB.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'mongoose') return { mongo: {}, connection: {}, isValidObjectId: () => true, Types: { ObjectId: class {} } };
  return originalLoad.call(this, request, ...rest);
};
const files = require('../services/files');
Module._load = originalLoad;

const pdf = Buffer.from('%PDF-1.7 hello');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(16)]);

test('accepts study material with a matching signature', () => {
  assert.equal(files.validate('notes.pdf', pdf).kind, 'document');
  assert.equal(files.validate('diagram.png', png).kind, 'image');
  assert.equal(files.validate('solution.py', Buffer.from('print(1)')).kind, 'document');
});

test('rejects disallowed, spoofed, empty, oversized and binary-as-text files', () => {
  assert.ok(files.validate('setup.exe', pdf).error);
  assert.ok(files.validate('logo.svg', Buffer.from('<svg/>')).error);          // SVG can carry scripts
  assert.ok(files.validate('fake.png', Buffer.from('MZ-not-a-png')).error);    // extension/content mismatch
  assert.ok(files.validate('empty.txt', Buffer.alloc(0)).error);
  assert.ok(files.validate('big.pdf', Buffer.concat([pdf, Buffer.alloc(11 * 1024 * 1024)])).error);
  assert.ok(files.validate('bin.txt', Buffer.from([65, 0, 66])).error);
});

test('cleanFileName strips path and header-breaking characters', () => {
  assert.equal(files.cleanFileName('../a"b\n.pdf').includes('/'), false);
  assert.equal(/["\n\r]/.test(files.cleanFileName('a"b\n.pdf')), false);
});

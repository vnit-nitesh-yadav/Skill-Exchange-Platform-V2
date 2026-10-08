// Chat attachments are stored in MongoDB GridFS so they survive redeploys on hosts with
// ephemeral disks (e.g. Render). Only a whitelist of study-material types is accepted.
const mongoose = require('mongoose');

const MAX_BYTES = (Number(process.env.MAX_UPLOAD_MB) || 10) * 1024 * 1024;

const TYPES = {
  // documents
  pdf: ['application/pdf', 'document'], doc: ['application/msword', 'document'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
  ppt: ['application/vnd.ms-powerpoint', 'document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'document'],
  xls: ['application/vnd.ms-excel', 'document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document'],
  txt: ['text/plain', 'document'], md: ['text/markdown', 'document'], csv: ['text/csv', 'document'],
  rtf: ['application/rtf', 'document'], odt: ['application/vnd.oasis.opendocument.text', 'document'],
  zip: ['application/zip', 'document'], ipynb: ['application/json', 'document'],
  // source code (always served as a download, never rendered)
  py: ['text/plain', 'document'], js: ['text/plain', 'document'], ts: ['text/plain', 'document'],
  java: ['text/plain', 'document'], c: ['text/plain', 'document'], cpp: ['text/plain', 'document'],
  sql: ['text/plain', 'document'], html: ['text/plain', 'document'], css: ['text/plain', 'document'],
  // images (SVG intentionally excluded: it can carry scripts)
  png: ['image/png', 'image'], jpg: ['image/jpeg', 'image'], jpeg: ['image/jpeg', 'image'],
  gif: ['image/gif', 'image'], webp: ['image/webp', 'image'],
};

const extOf = (name = '') => (String(name).split('.').pop() || '').toLowerCase();

const cleanFileName = (name = 'file') =>
  String(name).replace(/[\\/\0\r\n"]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

// Cheap magic-byte check so "virus.exe" renamed to ".png" is rejected.
const signatureOk = (ext, buf) => {
  const starts = (...bytes) => bytes.every((b, i) => buf[i] === b);
  switch (ext) {
    case 'png': return starts(0x89, 0x50, 0x4e, 0x47);
    case 'jpg': case 'jpeg': return starts(0xff, 0xd8, 0xff);
    case 'gif': return starts(0x47, 0x49, 0x46, 0x38);
    case 'webp': return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    case 'pdf': return buf.slice(0, 5).toString() === '%PDF-';
    case 'zip': case 'docx': case 'pptx': case 'xlsx': case 'odt': return starts(0x50, 0x4b);
    case 'doc': case 'ppt': case 'xls': return starts(0xd0, 0xcf, 0x11, 0xe0);
    default: return !buf.includes(0); // text/code files must not contain NUL bytes
  }
};

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'chat_files' });
const filesCollection = () => mongoose.connection.db.collection('chat_files.files');

const validate = (name, buf) => {
  const ext = extOf(name);
  const type = TYPES[ext];
  if (!type) return { error: `.${ext || '?'} files are not allowed. Share PDFs, Office docs, text, code, zip or images.` };
  if (!buf || !buf.length) return { error: 'The file is empty' };
  if (buf.length > MAX_BYTES) return { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` };
  if (!signatureOk(ext, buf)) return { error: 'File contents do not match its extension' };
  return { ext, mimeType: type[0], kind: type[1] };
};

const store = (ownerId, name, buf, meta) =>
  new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(name, {
      metadata: { owner: String(ownerId), mimeType: meta.mimeType, kind: meta.kind, participants: [] },
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve({ fileId: stream.id, name, size: buf.length, mimeType: meta.mimeType, kind: meta.kind }));
    stream.end(buf);
  });

const getFile = async (fileId) => {
  if (!mongoose.isValidObjectId(fileId)) return null;
  return filesCollection().findOne({ _id: new mongoose.Types.ObjectId(fileId) });
};

// Links an uploaded file to the two people in the conversation (they are the only ones who may download it).
const attachToConversation = (fileId, a, b) =>
  filesCollection().updateOne(
    { _id: new mongoose.Types.ObjectId(fileId) },
    { $set: { 'metadata.participants': [String(a), String(b)] } }
  );

const canAccess = (file, userId) =>
  !!file && (file.metadata?.owner === String(userId) || (file.metadata?.participants || []).includes(String(userId)));

const openDownload = (fileId) => bucket().openDownloadStream(new mongoose.Types.ObjectId(fileId));

module.exports = {
  MAX_BYTES, validate, store, getFile, attachToConversation, canAccess, openDownload, cleanFileName, extOf,
};

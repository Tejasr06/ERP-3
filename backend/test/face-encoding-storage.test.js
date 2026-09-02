const test = require('node:test');
const assert = require('node:assert/strict');

const { FaceEmbedding } = require('../models');

test('face embeddings model stores studentId, name and registration metadata', () => {
  const registrationDate = new Date('2026-09-01T10:00:00Z');
  const doc = new FaceEmbedding({
    studentId: 'S123',
    name: 'Asha Kumar',
    encodings: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
    sampleCount: 2,
    registrationDate,
  });

  assert.equal(doc.studentId, 'S123');
  assert.equal(doc.name, 'Asha Kumar');
  assert.equal(doc.sampleCount, 2);
  assert.ok(Array.isArray(doc.encodings));
  assert.equal(doc.encodings.length, 2);
  assert.equal(doc.registrationDate.toISOString(), registrationDate.toISOString());
});

test('face embeddings schema validates required fields', () => {
  const doc = new FaceEmbedding({});
  const err = doc.validateSync();
  assert.ok(err.errors.studentId);
  assert.ok(err.errors.name);
});

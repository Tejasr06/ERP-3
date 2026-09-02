const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { resolvePythonExecutable } = require('../utils/pythonCommand');

test('face_recognition_service returns multi-face structured schema', () => {
  const python = resolvePythonExecutable();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-face-'));
  
  try {
    // Create a tiny valid dummy 100x100 RGB image using canvas or simple ppm/bmp or script
    const pyScript = path.join(__dirname, '../face_recognition_service.py');
    const dummyKnown = path.join(tempDir, 'known.json');
    fs.writeFileSync(dummyKnown, JSON.stringify([
      { studentId: 'STU001', name: 'Alice', encodings: [new Array(128).fill(0.05)] }
    ]), 'utf8');

    // Create a blank image with python cv2
    const makeImgScript = `
import cv2, numpy as np
img = np.zeros((200, 200, 3), dtype=np.uint8)
cv2.imwrite('${tempDir.replace(/\\/g, '/')}/blank.png', img)
`;
    spawnSync(python.cmd, python.args.concat(['-c', makeImgScript]), { encoding: 'utf8' });

    const blankImg = path.join(tempDir, 'blank.png');
    assert.ok(fs.existsSync(blankImg), 'Blank test image should exist');

    const result = spawnSync(python.cmd, python.args.concat([pyScript, '--recognize', '--image', blankImg, '--known-encodings-file', dummyKnown]), {
      encoding: 'utf8'
    });

    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.recognized, false);
    assert.equal(parsed.faceCount, 0);
    assert.ok(Array.isArray(parsed.faces));
    assert.equal(parsed.imageWidth, 200);
    assert.equal(parsed.imageHeight, 200);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

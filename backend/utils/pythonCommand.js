const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function isPythonWorking(command, args = []) {
  try {
    const result = spawnSync(command, args.concat(['-c', 'import cv2, face_recognition; print("OK")']), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return !result.error && result.status === 0 && /OK/i.test((result.stdout || '').trim());
  } catch {
    return false;
  }
}

function resolvePythonExecutable() {
  const overrides = [
    process.env.FACE_RECOGNITION_PYTHON,
    process.env.PYTHON_PATH,
    process.env.PYTHON_BIN,
  ].filter(Boolean);

  for (const override of overrides) {
    if (isPythonWorking(override)) {
      return { cmd: override, args: [] };
    }
  }

  const venvCandidates = [
    path.join(__dirname, '../../.venv/Scripts/python.exe'),
    path.join(__dirname, '../../.venv/Scripts/python'),
    path.join(__dirname, '../../.venv/bin/python'),
    path.join(__dirname, '../../.venv/bin/python3'),
  ];

  for (const candidate of venvCandidates) {
    if (fs.existsSync(candidate) && isPythonWorking(candidate)) {
      return { cmd: candidate, args: [] };
    }
  }

  const candidates = [
    { cmd: 'python3', args: [] },
    { cmd: 'python', args: [] },
    { cmd: 'py', args: ['-3'] },
  ];

  for (const candidate of candidates) {
    if (isPythonWorking(candidate.cmd, candidate.args)) {
      return candidate;
    }
  }

  // Fallback: Return available system python
  try {
    const checkPy3 = spawnSync('python3', ['--version']);
    if (!checkPy3.error && checkPy3.status === 0) {
      return { cmd: 'python3', args: [] };
    }
  } catch {}

  return { cmd: 'python', args: [] };
}

module.exports = { resolvePythonExecutable };

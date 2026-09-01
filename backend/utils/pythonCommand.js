const { spawnSync } = require('child_process');

function resolvePythonExecutable() {
  const candidates = [
    { cmd: 'python', args: [] },
    { cmd: 'python3', args: [] },
    { cmd: 'py', args: ['-3'] },
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.cmd, candidate.args.concat(['--version']), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!result.error && result.status === 0) {
      return candidate;
    }
  }

  return { cmd: 'python', args: [] };
}

module.exports = { resolvePythonExecutable };

import { spawn } from 'node:child_process';
import http from 'node:http';

const port = 4317;
const host = '127.0.0.1';
const nextBin = process.platform === 'win32' ? 'node_modules/.bin/next.cmd' : 'node_modules/.bin/next';

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: pathname, timeout: 5000 }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => req.destroy(new Error(`HTTP timeout: ${pathname}`)));
    req.on('error', reject);
  });
}

const child = spawn(nextBin, ['start', '-p', String(port), '-H', host], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(port), NEXT_PUBLIC_APP_URL: `http://${host}:${port}` },
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 30000;
  let lastError = 'server not ready';
  while (Date.now() < deadline) {
    try {
      const result = await request('/');
      if (result.status === 200) return result;
      lastError = `root returned ${result.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js did not become ready within 30s: ${lastError}\n${output}`);
}

try {
  const home = await waitForServer();
  if (!home.body.includes('NahaKids')) {
    throw new Error('Home page loaded but did not contain the NahaKids application marker.');
  }

  const invalidGame = await request('/api/games/not-a-uuid');
  if (invalidGame.status !== 404) {
    throw new Error(`Expected invalid game lookup to return 404, got ${invalidGame.status}.`);
  }

  console.log('NahaKids post-build HTTP smoke: PASS');
  console.log(`Home: ${home.status}; invalid game route: ${invalidGame.status}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  child.kill();
}

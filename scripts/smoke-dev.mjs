#!/usr/bin/env node
// Starts `npm run dev` on spare ports with a throwaway PGlite dir, checks the web page and the
// proxied API respond, then shuts everything down. Exit 0 = dev mode works.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = 4100 + Math.floor(Math.random() * 400);
const webPort = 5200 + Math.floor(Math.random() * 400);
const pgDir = mkdtempSync(join(tmpdir(), 'avm-smoke-'));

const child = spawn('npm', ['run', 'dev'], {
  cwd: root,
  detached: true,
  env: { ...process.env, PORT: String(apiPort), WEB_PORT: String(webPort), API_PROXY_TARGET: `http://localhost:${apiPort}`, PGLITE_DIR: pgDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

const stop = (code) => {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  setTimeout(() => {
    rmSync(pgDir, { recursive: true, force: true });
    process.exit(code);
  }, 500);
};

async function poll(url, check, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      const body = await r.text();
      if (r.ok && check(body)) return body;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

try {
  const health = await poll(`http://localhost:${webPort}/api/health`, (b) => b.includes('"status":"ok"'));
  const html = await poll(`http://localhost:${webPort}/`, (b) => b.includes('<title>Abeg Vote Me</title>'));
  // 1,317 seats from President to LG Chairman, plus a councillor and a ward chairman per ward, each held by an NPC
  const summary = await poll(`http://localhost:${webPort}/api/world/summary`, (b) => {
    const s = JSON.parse(b);
    return s.counts.wards >= 774 * 8 && s.counts.seats === 1317 + 2 * s.counts.wards && s.seatsHeldByNpcs === s.counts.seats;
  });
  // Socket.IO through the Vite proxy: an Engine.IO polling handshake answers with an "open" packet ("0{...}")
  const sio = await poll(`http://localhost:${webPort}/socket.io/?EIO=4&transport=polling`, (b) => b.startsWith('0{'));
  console.log('socket.io via proxy:', sio.slice(0, 40));
  console.log('web index ok:', html.includes('id="root"'));
  console.log('api via proxy:', health);
  console.log('world summary:', summary);
  stop(0);
} catch (e) {
  console.error(String(e));
  console.error(output.slice(-3000));
  stop(1);
}

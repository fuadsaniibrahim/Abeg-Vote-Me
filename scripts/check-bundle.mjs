#!/usr/bin/env node
// Builds the web app and checks: game screens are split into lazy chunks, and the initial JS
// (entry chunk) stays under the gzip budget. Exit 0 = pass.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 200);
const LAZY_SCREENS = ['CreateCharacterScreen', 'DashboardScreen', 'ProfileScreen', 'PartyHubScreen', 'ActionsScreen', 'FinanceScreen', 'NewsScreen', 'ChatScreen', 'MapScreen', 'StateMapScreen', 'ConstituencyScreen', 'LgaScreen', 'SeatScreen'];

const b = spawnSync('npm', ['run', 'build', '-w', '@avm/web'], { cwd: root, encoding: 'utf8' });
if (b.status !== 0) {
  console.error(b.stdout, b.stderr);
  process.exit(1);
}
const dist = join(root, 'apps/web/dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script type="module" crossorigin src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
if (!entry) {
  console.error('could not find entry script in index.html');
  process.exit(1);
}
const assets = join(dist, 'assets');
const jsFiles = readdirSync(assets).filter((f) => f.endsWith('.js'));
const entryGz = gzipSync(readFileSync(join(assets, entry))).length / 1024;
const missing = LAZY_SCREENS.filter((s) => !jsFiles.some((f) => f.startsWith(`${s}-`)));
const entrySrc = readFileSync(join(assets, entry), 'utf8');
// a lazy screen's own markup must not be inside the entry chunk
const leaked = ['Start my career', 'Write a story', 'Start business', 'Talk your own', 'Map of Nigeria', 'Seat history', 'Ward chairman'].filter((t) => entrySrc.includes(t));

console.log(`entry ${entry}: ${entryGz.toFixed(1)} KB gzip (budget ${BUDGET_KB} KB)`);
console.log(`js chunks: ${jsFiles.length}; lazy screen chunks found: ${LAZY_SCREENS.length - missing.length}/${LAZY_SCREENS.length}`);
let ok = true;
if (missing.length) {
  console.error(`missing lazy chunks: ${missing.join(', ')}`);
  ok = false;
}
if (leaked.length) {
  console.error(`lazy screen text found in entry chunk: ${leaked.join(', ')}`);
  ok = false;
}
if (entryGz > BUDGET_KB) {
  console.error('entry chunk over budget');
  ok = false;
}
process.exit(ok ? 0 : 1);

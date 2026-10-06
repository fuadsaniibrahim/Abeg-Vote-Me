#!/usr/bin/env node
// Verifies every [x] task in TASKS.md: files exist, tests pass, commands succeed, commits exist.
// Exit code 1 if any [x] task fails verification or TASKS.md is malformed.
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseTasks, staticProblems, summarise, indexVitestReport } from './lib/tasks-parser.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tasksPath = join(root, 'TASKS.md');

function run(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, cwd: root, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, ...opts });
}

const { tasks, errors } = parseTasks(readFileSync(tasksPath, 'utf8'));
const done = tasks.filter((t) => t.status === 'done');
const failures = new Map(); // id -> string[]
const fail = (id, msg) => {
  if (!failures.has(id)) failures.set(id, []);
  failures.get(id).push(msg);
};

// 1. Static rules + files + commits
for (const t of done) {
  for (const p of staticProblems(t)) fail(t.id, p);
  for (const f of t.evidence.files) if (!existsSync(join(root, f))) fail(t.id, `file not found: ${f}`);
  for (const c of t.evidence.commits) {
    const r = run(`git cat-file -e ${c}^{commit}`);
    if (r.status !== 0) fail(t.id, `commit not found in git: ${c}`);
  }
}

// 2. Tests: run every referenced test file once with the JSON reporter
const testFiles = [...new Set(done.flatMap((t) => t.evidence.tests.map((x) => x.file)))];
let testIndex = new Map();
if (testFiles.length) {
  const missing = testFiles.filter((f) => !existsSync(join(root, f)));
  for (const t of done) for (const x of t.evidence.tests) if (missing.includes(x.file)) fail(t.id, `test file not found: ${x.file}`);
  const present = testFiles.filter((f) => !missing.includes(f));
  if (present.length) {
    const dir = mkdtempSync(join(tmpdir(), 'verify-tasks-'));
    const out = join(dir, 'vitest.json');
    console.log(`Running ${present.length} test file(s) referenced by done tasks...`);
    run(`npx vitest run ${present.map((f) => JSON.stringify(f)).join(' ')} --reporter=json --outputFile=${JSON.stringify(out)}`, {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (existsSync(out)) testIndex = indexVitestReport(JSON.parse(readFileSync(out, 'utf8')), root);
    rmSync(dir, { recursive: true, force: true });
  }
  for (const t of done) {
    for (const x of t.evidence.tests) {
      const key = `${x.file} > ${x.name}`;
      const status = testIndex.get(key);
      if (status === undefined) {
        if (existsSync(join(root, x.file))) fail(t.id, `test not found in run: ${key}`);
      } else if (status !== 'passed') fail(t.id, `test ${status}: ${key}`);
    }
  }
}

// 3. Commands: each unique command once
const cmdResults = new Map();
for (const t of done) {
  for (const c of t.evidence.cmds) {
    if (!cmdResults.has(c)) {
      console.log(`Running: ${c}`);
      const r = run(c, { stdio: ['ignore', 'pipe', 'pipe'] });
      cmdResults.set(c, r.status === 0 ? null : `exit ${r.status ?? r.signal}\n${(r.stderr || r.stdout || '').slice(-1500)}`);
    }
    const err = cmdResults.get(c);
    if (err) fail(t.id, `command failed: ${c} (${err.split('\n')[0]})`);
  }
}

// 4. Report
const s = summarise(tasks);
console.log('\n=== TASKS.md verification report ===');
console.log(`Total tasks:  ${s.total}`);
console.log(`Done [x]:     ${s.done}`);
console.log(`In progress:  ${s.in_progress}`);
console.log(`Blocked:      ${s.blocked}`);
console.log(`Not started:  ${s.not_started}`);
if (errors.length) {
  console.log(`\nMalformed TASKS.md lines (${errors.length}):`);
  for (const e of errors) console.log(`  - ${e}`);
}
if (failures.size) {
  console.log(`\nFAILED verification (${failures.size} done task(s)):`);
  for (const [id, msgs] of failures) {
    console.log(`  ${id}`);
    for (const m of msgs) console.log(`    - ${m}`);
  }
} else {
  console.log(`\nAll ${s.done} done task(s) passed verification.`);
}
process.exit(failures.size || errors.length ? 1 : 0);

// Integration tests: run the real verify-tasks script against fixture TASKS files.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..');
const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();

function verify(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'vt-'));
  const file = join(dir, 'TASKS.md');
  writeFileSync(file, `# fixture\n${lines.join('\n')}\n`);
  const r = spawnSync('node', ['scripts/verify-tasks.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, TASKS_FILE: file }, timeout: 120000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

describe('verify-tasks script', () => {
  it('passes a done task whose files exist, command succeeds and commit exists', () => {
    const r = verify([`- [x] P1-T01 | ok | Evidence: file:package.json ; cmd:node -e "process.exit(0)" ; commit:${head}`]);
    expect(r.out).toContain('All 1 done task(s) passed verification.');
    expect(r.code).toBe(0);
  });

  it('fails a done task with a missing file', () => {
    const r = verify([`- [x] P1-T01 | bad | Evidence: file:does/not/exist.ts ; cmd:node -e "0" ; commit:${head}`]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('file not found: does/not/exist.ts');
  });

  it('fails a done task whose command exits non-zero', () => {
    const r = verify([`- [x] P1-T01 | bad | Evidence: file:package.json ; cmd:node -e "process.exit(3)" ; commit:${head}`]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/command failed: .*exit 3/);
  });

  it('fails a done task citing a commit that does not exist', () => {
    const r = verify(['- [x] P1-T01 | bad | Evidence: file:package.json ; cmd:node -e "0" ; commit:deadbee']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('commit not found in git: deadbee');
  });

  it('fails a done task with empty evidence', () => {
    const r = verify(['- [x] P1-T01 | bad | Evidence:']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('evidence is empty');
  });

  it('runs referenced tests: passes a real passing test and fails a missing test name', () => {
    const good = verify([`- [x] P1-T01 | ok | Evidence: file:package.json ; test:scripts/lib/tasks-parser.test.mjs > summarise > counts tasks by status ; commit:${head}`]);
    expect(good.code).toBe(0);
    const bad = verify([`- [x] P1-T01 | bad | Evidence: file:package.json ; test:scripts/lib/tasks-parser.test.mjs > summarise > no such test ; commit:${head}`]);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('test not found in run');
  });

  it('reports counts for every status and ignores evidence on unfinished tasks', () => {
    const r = verify([
      '- [ ] P1-T01 | a | Evidence:',
      '- [~] P1-T02 | b | Evidence: note: half done',
      '- [!] P1-T03 | c | Evidence: note: blocked',
      `- [x] P1-T04 | d | Evidence: file:package.json ; cmd:node -e "0" ; commit:${head}`,
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Total tasks:\s+4/);
    expect(r.out).toMatch(/Done \[x\]:\s+1/);
    expect(r.out).toMatch(/In progress:\s+1/);
    expect(r.out).toMatch(/Blocked:\s+1/);
    expect(r.out).toMatch(/Not started:\s+1/);
  });

  it('fails on malformed task lines', () => {
    const r = verify(['- [x] P1-T01 no pipes here']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('Malformed TASKS.md lines');
  });
});

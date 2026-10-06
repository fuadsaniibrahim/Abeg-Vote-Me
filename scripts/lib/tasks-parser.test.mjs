import { describe, expect, it } from 'vitest';
import { parseTasks, parseEvidence, staticProblems, summarise, indexVitestReport } from './tasks-parser.mjs';

const md = `
# heading
- [ ] P1-T01 | Not started task | Evidence:
- [~] P1-T02 | Partial | Evidence: file:a.ts ; note: missing UI
- [x] P1-T03 | Done task | Evidence: file:a.ts, b.ts ; test:pkg/x.test.ts > suite > works ; cmd:npm run typecheck ; commit:abc1234
- [!] P1-T04 | Blocked | Evidence: note: no docker
`;

describe('parseTasks', () => {
  it('parses status, id, description and line number', () => {
    const { tasks, errors } = parseTasks(md);
    expect(errors).toEqual([]);
    expect(tasks.map((t) => [t.id, t.status])).toEqual([
      ['P1-T01', 'not_started'],
      ['P1-T02', 'in_progress'],
      ['P1-T03', 'done'],
      ['P1-T04', 'blocked'],
    ]);
    expect(tasks[2].description).toBe('Done task');
    expect(tasks[0].lineNo).toBe(3);
  });

  it('reports malformed lines and duplicate ids', () => {
    const { errors } = parseTasks('- [x] P1-T01 missing pipes\n- [ ] P1-T02 | a | Evidence:\n- [ ] P1-T02 | b | Evidence:\n- [?] P1-T03 | c | Evidence:');
    expect(errors.some((e) => e.includes('malformed'))).toBe(true);
    expect(errors.some((e) => e.includes('duplicate task id P1-T02'))).toBe(true);
    expect(errors.some((e) => e.includes('unknown status marker'))).toBe(true);
  });
});

describe('parseEvidence', () => {
  it('splits files, tests, commands, commits and notes', () => {
    const ev = parseEvidence(' file:a.ts, b.ts ; test:pkg/x.test.ts > suite > works ; cmd:npm run typecheck ; commit:abc1234 ; note: hi');
    expect(ev.files).toEqual(['a.ts', 'b.ts']);
    expect(ev.tests).toEqual([{ file: 'pkg/x.test.ts', name: 'suite > works' }]);
    expect(ev.cmds).toEqual(['npm run typecheck']);
    expect(ev.commits).toEqual(['abc1234']);
    expect(ev.notes).toEqual(['hi']);
  });

  it('keeps semicolons inside commands that are not space-padded', () => {
    const ev = parseEvidence('cmd:node -e "a;b" ; commit:abc1234');
    expect(ev.cmds).toEqual(['node -e "a;b"']);
  });

  it('flags unknown prefixes and malformed test refs', () => {
    const ev = parseEvidence('foo:bar ; test:no-separator');
    expect(ev.unknown).toEqual(['foo:bar', 'test:no-separator']);
  });
});

describe('staticProblems', () => {
  const done = (evidence) => ({ id: 'X', status: 'done', evidence: parseEvidence(evidence) });

  it('accepts complete evidence', () => {
    expect(staticProblems(done('file:a.ts ; cmd:true ; commit:abc1234'))).toEqual([]);
  });

  it('rejects empty evidence on a done task', () => {
    expect(staticProblems(done(''))).toEqual(['evidence is empty']);
  });

  it('requires files, a proof and a commit', () => {
    const p = staticProblems(done('note: trust me'));
    expect(p).toContain('no file: paths in evidence');
    expect(p).toContain('no test: or cmd: proving it works');
    expect(p).toContain('no commit: hash');
  });

  it('rejects bad commit hashes and recursive verify commands', () => {
    const p = staticProblems(done('file:a ; cmd:npm run verify-tasks ; commit:XYZ'));
    expect(p.some((x) => x.includes('bad commit hash'))).toBe(true);
    expect(p.some((x) => x.includes('recursively'))).toBe(true);
  });

  it('ignores tasks that are not done', () => {
    expect(staticProblems({ id: 'X', status: 'in_progress', evidence: parseEvidence('') })).toEqual([]);
  });
});

describe('summarise', () => {
  it('counts tasks by status', () => {
    expect(summarise(parseTasks(md).tasks)).toEqual({ total: 4, done: 1, in_progress: 1, blocked: 1, not_started: 1 });
  });
});

describe('indexVitestReport', () => {
  it('indexes assertions by relative file and full name', () => {
    const report = {
      testResults: [
        {
          name: '/repo/pkg/x.test.ts',
          assertionResults: [
            { ancestorTitles: ['suite'], title: 'works', status: 'passed' },
            { ancestorTitles: ['suite', 'nested'], title: 'fails', status: 'failed' },
          ],
        },
      ],
    };
    const idx = indexVitestReport(report, '/repo');
    expect(idx.get('pkg/x.test.ts > suite > works')).toBe('passed');
    expect(idx.get('pkg/x.test.ts > suite > nested > fails')).toBe('failed');
  });
});

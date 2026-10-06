// Pure parsing + rule checking for TASKS.md. No I/O here so it can be unit tested.

export const STATUS = {
  ' ': 'not_started',
  '~': 'in_progress',
  x: 'done',
  '!': 'blocked',
};

const TASK_LINE = /^- \[(.)\] (P\d+-T\d+) \| (.+?) \| Evidence:(.*)$/;
const ANY_TASK_LINE = /^- \[.\] P\d+-T\d+/;

/**
 * Parse TASKS.md content.
 * @returns {{ tasks: Task[], errors: string[] }}
 */
export function parseTasks(content) {
  const tasks = [];
  const errors = [];
  const seen = new Set();
  content.split(/\r?\n/).forEach((line, idx) => {
    const lineNo = idx + 1;
    if (!ANY_TASK_LINE.test(line)) return;
    const m = TASK_LINE.exec(line);
    if (!m) {
      errors.push(`line ${lineNo}: malformed task line: ${line}`);
      return;
    }
    const [, mark, id, description, evidenceRaw] = m;
    const status = STATUS[mark];
    if (!status) {
      errors.push(`line ${lineNo}: unknown status marker [${mark}] on ${id}`);
      return;
    }
    if (seen.has(id)) errors.push(`line ${lineNo}: duplicate task id ${id}`);
    seen.add(id);
    tasks.push({ id, status, description: description.trim(), evidence: parseEvidence(evidenceRaw), lineNo });
  });
  return { tasks, errors };
}

/**
 * Evidence items are separated by " ; ". Each item is prefix:value.
 * file: values may be comma separated.
 */
export function parseEvidence(raw) {
  const ev = { files: [], tests: [], cmds: [], commits: [], notes: [], unknown: [] };
  const text = raw.trim();
  if (!text) return ev;
  for (const part of text.split(/\s;\s/)) {
    const item = part.trim();
    if (!item) continue;
    const colon = item.indexOf(':');
    const key = colon === -1 ? '' : item.slice(0, colon).trim();
    const value = colon === -1 ? item : item.slice(colon + 1).trim();
    switch (key) {
      case 'file':
        ev.files.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case 'test': {
        const t = parseTestRef(value);
        if (t) ev.tests.push(t);
        else ev.unknown.push(item);
        break;
      }
      case 'cmd':
        ev.cmds.push(value);
        break;
      case 'commit':
        ev.commits.push(value);
        break;
      case 'note':
        ev.notes.push(value);
        break;
      default:
        ev.unknown.push(item);
    }
  }
  return ev;
}

/** "path/to/x.test.ts > describe > name" -> { file, name } */
export function parseTestRef(value) {
  const sep = value.indexOf(' > ');
  if (sep === -1) return null;
  const file = value.slice(0, sep).trim();
  const name = value.slice(sep + 3).trim();
  if (!file || !name) return null;
  return { file, name };
}

const FORBIDDEN_CMD = /verify-tasks/;

/** Static rules every [x] task must satisfy before anything is executed. */
export function staticProblems(task) {
  const p = [];
  const ev = task.evidence;
  if (task.status !== 'done') return p;
  if (!ev.files.length && !ev.tests.length && !ev.cmds.length && !ev.commits.length && !ev.notes.length && !ev.unknown.length) {
    p.push('evidence is empty');
    return p;
  }
  if (!ev.files.length) p.push('no file: paths in evidence');
  if (!ev.tests.length && !ev.cmds.length) p.push('no test: or cmd: proving it works');
  if (!ev.commits.length) p.push('no commit: hash');
  for (const c of ev.commits) if (!/^[0-9a-f]{7,40}$/.test(c)) p.push(`bad commit hash "${c}"`);
  for (const c of ev.cmds) if (FORBIDDEN_CMD.test(c)) p.push(`cmd may not call verify-tasks recursively: ${c}`);
  for (const u of ev.unknown) p.push(`unrecognised evidence item "${u}"`);
  return p;
}

export function summarise(tasks) {
  const counts = { total: tasks.length, done: 0, in_progress: 0, blocked: 0, not_started: 0 };
  for (const t of tasks) counts[t.status]++;
  return counts;
}

/**
 * Given a Vitest JSON report, index passing/failing tests by "file > full name".
 * Names are ancestorTitles + title joined by " > ".
 */
export function indexVitestReport(report, rootDir) {
  const index = new Map();
  for (const file of report.testResults ?? []) {
    let rel = file.name;
    if (rootDir && rel.startsWith(rootDir)) rel = rel.slice(rootDir.length).replace(/^[/\\]/, '');
    rel = rel.split('\\').join('/');
    for (const a of file.assertionResults ?? []) {
      const name = [...(a.ancestorTitles ?? []), a.title].join(' > ');
      index.set(`${rel} > ${name}`, a.status);
    }
  }
  return index;
}

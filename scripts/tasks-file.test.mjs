// Checks on the real TASKS.md, PROGRESS_LOG.md and KNOWN_GAPS.md.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTasks } from './lib/tasks-parser.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');

describe('TASKS.md', () => {
  const { tasks, errors } = parseTasks(read('TASKS.md'));

  it('is well formed with 300+ uniquely numbered tasks', () => {
    expect(errors).toEqual([]);
    expect(tasks.length).toBeGreaterThanOrEqual(300);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
  });

  it('covers all 13 build phases', () => {
    const phases = new Set(tasks.map((t) => Number(/^P(\d+)-/.exec(t.id)[1])));
    expect([...phases].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('gives every blocked or in-progress task a note saying why', () => {
    const missing = tasks.filter((t) => (t.status === 'blocked' || t.status === 'in_progress') && t.evidence.notes.length === 0).map((t) => t.id);
    expect(missing).toEqual([]);
  });
});

describe('PROGRESS_LOG.md', () => {
  it('has at least one dated session entry with a commit hash', () => {
    const log = read('PROGRESS_LOG.md');
    expect(log).toMatch(/^## \d{4}-\d{2}-\d{2}/m);
    expect(log).toMatch(/[Cc]ommit[^\n]*\b[0-9a-f]{7}\b/);
  });
});

describe('KNOWN_GAPS.md', () => {
  it('lists environment gaps', () => {
    expect(read('KNOWN_GAPS.md')).toMatch(/Docker/);
  });
});

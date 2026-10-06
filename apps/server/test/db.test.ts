import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPgliteDb, type Db } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';

describe('db adapter (PGlite)', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createPgliteDb('memory');
  });
  afterAll(() => db.close());

  it('runs parameterised queries and parses bigint as number', async () => {
    const r = await db.query<{ n: number; s: string }>('SELECT $1::bigint AS n, $2::text AS s', [9007199254740, 'abeg']);
    expect(r.rows[0]).toEqual({ n: 9007199254740, s: 'abeg' });
  });

  it('commits a successful transaction', async () => {
    await db.exec('CREATE TABLE t_ok (v int)');
    await db.transaction(async (tx) => {
      await tx.query('INSERT INTO t_ok VALUES (1)');
    });
    expect((await db.query('SELECT * FROM t_ok')).rows).toHaveLength(1);
  });

  it('rolls back a failed transaction', async () => {
    await db.exec('CREATE TABLE t_rb (v int)');
    await expect(
      db.transaction(async (tx) => {
        await tx.query('INSERT INTO t_rb VALUES (1)');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await db.query('SELECT * FROM t_rb')).rows).toHaveLength(0);
  });
});

describe('migrate', () => {
  it('applies migrations once and is idempotent', async () => {
    const db = await createPgliteDb('memory');
    const first = await migrate(db);
    expect(first).toContain('001_init.sql');
    expect(await migrate(db)).toEqual([]);
    const r = await db.query<{ name: string }>('SELECT name FROM schema_migrations');
    expect(r.rows.map((x) => x.name)).toEqual(first);
    await db.close();
  });

  it('rolls back a broken migration and does not record it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '001_ok.sql'), 'CREATE TABLE ok_t (v int);');
    writeFileSync(join(dir, '002_bad.sql'), 'CREATE TABLE bad_t (v int); SELECT * FROM does_not_exist;');
    const db = await createPgliteDb('memory');
    await expect(migrate(db, dir)).rejects.toThrow();
    const names = (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name);
    expect(names).toEqual(['001_ok.sql']);
    const bad = await db.query("SELECT to_regclass('bad_t') AS t");
    expect(bad.rows[0]).toEqual({ t: null });
    await db.close();
  });
});

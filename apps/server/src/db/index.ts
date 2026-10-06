// One database interface over two drivers: node-postgres (real server) and PGlite (embedded Postgres).
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run one or more statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  readonly driver: 'pg' | 'pglite';
  /** Runs fn inside BEGIN/COMMIT; rolls back if fn throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// int8 (bigint) as JS number: money values stay far below 2^53.
const INT8_OID = 20;
const NUMERIC_OID = 1700;
pg.types.setTypeParser(INT8_OID, (v: string) => Number(v));
pg.types.setTypeParser(NUMERIC_OID, (v: string) => Number(v));

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const wrap = (c: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await c.query(sql, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
    async exec(sql: string) {
      await c.query(sql);
    },
  });
  return {
    driver: 'pg',
    ...wrap(pool),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const parsers = { [INT8_OID]: (v: string) => Number(v), [NUMERIC_OID]: (v: string) => Number(v) };
  const lite = dataDir && dataDir !== 'memory' ? new PGlite(dataDir, { parsers }) : new PGlite({ parsers });
  await lite.waitReady;
  type LiteTx = Pick<PGlite, 'query' | 'exec'>;
  const wrap = (c: LiteTx): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await c.query<T>(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    async exec(sql: string) {
      await c.exec(sql);
    },
  });
  return {
    driver: 'pglite',
    ...wrap(lite),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) => lite.transaction((tx) => fn(wrap(tx as unknown as LiteTx))),
    close: () => lite.close(),
  };
}

export async function createDb(opts: { databaseUrl?: string; pgliteDir?: string }): Promise<Db> {
  return opts.databaseUrl ? createPgDb(opts.databaseUrl) : createPgliteDb(opts.pgliteDir);
}

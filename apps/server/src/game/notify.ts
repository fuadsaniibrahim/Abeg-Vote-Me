import type { Queryable } from '../db/index.js';

export interface NotificationRow {
  id: number;
  character_id: string;
  kind: string;
  title: string;
  body: string;
  read_at: Date | null;
  created_at: Date;
}

/** Live delivery hook. Socket.IO registers one; without it notifications are still stored. */
export interface Realtime {
  toCharacter(characterId: string, event: string, payload: unknown): void;
}

export const noRealtime: Realtime = { toCharacter: () => undefined };

/** Store a notification. Returns the row so the caller can deliver it live after commit. */
export async function notify(db: Queryable, characterId: string, kind: string, title: string, body = ''): Promise<NotificationRow> {
  const r = await db.query<NotificationRow>('INSERT INTO notifications (character_id, kind, title, body) VALUES ($1, $2, $3, $4) RETURNING *', [characterId, kind, title, body]);
  return r.rows[0] as NotificationRow;
}

export function deliver(rt: Realtime, rows: NotificationRow[]) {
  for (const n of rows) rt.toCharacter(n.character_id, 'notification', n);
}

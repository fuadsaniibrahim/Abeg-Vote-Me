import type { Queryable } from './db/index.js';

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  actorCharacterId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

/** Append an entry to the audit log. Pass a transaction so the entry commits or rolls back with the action. */
export async function audit(db: Queryable, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO audit_log (action, actor_user_id, actor_character_id, target_type, target_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [e.action, e.actorUserId ?? null, e.actorCharacterId ?? null, e.targetType ?? null, e.targetId ?? null, JSON.stringify(e.details ?? {}), e.ip ?? null],
  );
}

import type { Queryable } from './db/index.js';

export interface Mail {
  to: string;
  subject: string;
  body: string;
}

/**
 * Outbox mailer: every email is written to outbox_emails. No SMTP delivery yet (see KNOWN_GAPS.md);
 * in development the message is also logged so the verification link can be clicked.
 */
export async function sendMail(db: Queryable, mail: Mail, log?: (msg: string) => void): Promise<void> {
  await db.query('INSERT INTO outbox_emails (to_email, subject, body) VALUES ($1, $2, $3)', [mail.to, mail.subject, mail.body]);
  log?.(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.body}`);
}

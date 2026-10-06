# Known Gaps

An honest list of everything stubbed, mocked, hardcoded, simplified, untested or skipped.
If something is fake, it is listed here. Entries are removed only when the gap is actually closed (and the closing is noted in PROGRESS_LOG.md).

## Environment

- **No Docker, PostgreSQL or Redis on the development machine.** `docker compose up` cannot be run here, so Docker tasks stay `[!]` until someone runs them on a machine with Docker.
  - Mitigation: the server talks to the database through one adapter (`apps/server/src/db/`). With `DATABASE_URL` set it uses real Postgres via `pg`. Without it, it uses **PGlite** (real Postgres compiled to WASM, in-process). All server tests and `npm run dev` run on PGlite, so SQL, constraints, triggers and transactions are exercised against real Postgres semantics. They are not exercised against a networked Postgres server.
  - Redis: optional. Without `REDIS_URL` an in-memory fallback is used (single process only).

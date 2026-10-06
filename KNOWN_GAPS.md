# Known Gaps

An honest list of everything stubbed, mocked, hardcoded, simplified, untested or skipped.
If something is fake, it is listed here. Entries are removed only when the gap is actually closed (and the closing is noted in PROGRESS_LOG.md).

## Environment

- **No Docker, PostgreSQL or Redis on the development machine.** `docker compose up` has never been run. `apps/server/Dockerfile`, `apps/web/Dockerfile`, `apps/web/nginx.conf` and `docker-compose.yml` are written but **never built**. P1-T55..T57 are `[~]`, P1-T58 is `[!]`.
- **Postgres via `pg` is untested.** The server uses one DB adapter (`apps/server/src/db/index.ts`). Every test and `npm run dev` use **PGlite** (real Postgres 17 compiled to WASM, in-process), so the SQL, constraints, partial unique indexes, triggers and transactions are tested against real Postgres semantics. The `pg` Pool branch (used when `DATABASE_URL` is set) has never connected to a server. Concurrency under a real connection pool (several transactions at once) is untested: PGlite runs one connection.
- **Redis is untested.** `apps/server/src/redis.ts` has an in-memory fallback (tested) and an ioredis branch (never run). The in-memory fallback only works for a single server process.
- **Rate limiting uses an in-memory store**, even when Redis is configured. With several server instances, limits would apply per instance.

## Auth

- **No real email delivery.** Verification emails are written to the `outbox_emails` table and logged in development. Nothing sends them over SMTP (P11-T19). In development, `GET /api/dev/outbox` shows them; this route is disabled when `NODE_ENV=production`.
- **Login does not require a verified email.** Unverified users can log in; the plan is to gate game actions (character creation, Phase 3) on verification. Not enforced anywhere yet because no game actions exist.
- **No OAuth** (P1-T60, not started). Email + password only.
- **No password reset** (P11-T18).
- **No CSRF token.** Session cookies are `SameSite=Lax` and the API takes JSON only, which blocks the usual cross-site form posts, but there is no explicit CSRF token (P11-T20).
- **The age gate is a checkbox** ("I am 18 or older") sent as `acceptTerms`. There is no date-of-birth check (P11-T11).

## World data and generation

- **Senatorial districts and federal constituencies are generated, not real.** Counts are correct (109 and 360, per-state reps counts match official numbers), but they are built by grouping LGAs in list order (mostly alphabetical), so they are **not geographically accurate**. District names are generic ("Kano North/Central/South"). Constituency names come from their LGAs.
- **Lagos has more constituencies (24) than LGAs (20).** The four most populous generated LGAs are split into "I" and "II" halves, each with 0.5 of the population. Real splits differ.
- **Populations, wealth, insecurity, issue weights, party leanings and voter blocs are game-flavour numbers.** State populations are rough projections. Everything below state level is generated from a seed with random noise. None of it is real statistics.
- **Capital LGA detection is a name match** against the capital city name. It fails for some states (e.g. Edo/Benin City, FCT/Abuja), which then have no LGA flagged as capital. Only the population boost depends on it.
- **LGA name spellings were written from memory.** Per-state counts are verified against the official totals by test, but individual spellings have not been checked against an official list.
- **NPC names** combine common given names and surnames from regional pools. Surnames of well-known real politicians are blocked (`BLOCKED_SURNAMES`), but a generated full name could still coincide with a real person.
- **Ward / councillor seats do not exist yet** (P4-T10). Only the 1,317 seats from President down to LG Chairman are generated.

## Server

- The production server runs TypeScript through `tsx`. There is no compiled JS build step yet.
- `GET /api/world/summary` is public and counts rows on every call. It is uncached.

## Web

- The signed-in home screen is a placeholder: it shows the email, verification status and logout. Character creation, the dashboard and every game screen come in later phases.
- Sound, reduced-motion toggle (CSS honours the OS setting; there is no in-game switch yet), tutorial and the other UI/UX items in Phase 12 are not done.

## Engine (Phase 2)

- **Every tuning number is invented** and has not been balanced against play: economy targets (15% inflation baseline, ₦650 fuel, ₦1,450/$ start), voter-utility weights, bribe prices, detection odds, insecurity sensitivities, approval weights, legacy formula. They are tested for *direction* (e.g. "insecurity lowers turnout") and *bounds*, not for realism. Balancing is Phase 13.
- **Background perks are labels only.** The 10 backgrounds have stats and starting money, but no game system reads the perks yet (P2-T04 is `[~]`).
- **President rule follows the spec**, not the constitution: winner needs ≥25% in 24 of the 37 units (36 states + FCT), which is configurable. The real rule (two-thirds of states *and* FCT) is different.
- **Run-off runner-up is my interpretation**: the other candidate with ≥25% in the most units, ties broken by votes. The governor rule uses the same run-off logic. The real constitution words this differently.
- **Ties**: default is a fresh election (`rerun`). A seeded "draw lots" option exists. Neither is wired to anything yet.
- **Voter model simplifications**: each bloc matches candidate issues against its own fixed top-issue list; the unit-level issue weights are not used in voting yet. Regional alignment is binary (same zone / same state). No ethnicity or religion is modelled in voting.
- **Bribery "blackmail back"** is only an outcome value; nothing acts on it yet (Phase 8).
- **Calendar**: every game month has 30 days.
- **World tick** covers economy, per-state insecurity and the president's approval only. Governors' approval, state economies, NPC politics and scheduled events are not in it yet.

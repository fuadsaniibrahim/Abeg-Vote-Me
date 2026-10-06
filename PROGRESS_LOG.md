# Progress Log

Append-only. Each entry: date, what was done, commands run with real (trimmed) output, commit hash.
Corrections are made by adding a new entry, never by editing an old one.

## 2026-10-06 — Session 1: task tracking + Phase 1

### What was done
- Created `TASKS.md` (365 tasks across 13 phases), `PROGRESS_LOG.md`, `KNOWN_GAPS.md`.
- `scripts/verify-tasks.mjs` (+ `scripts/lib/tasks-parser.mjs`): parses TASKS.md, checks every `[x]` task's files, runs its referenced Vitest tests (one JSON-reporter run) and commands, checks commit hashes, prints a report, exits 1 on any failure. Evidence format is documented at the top of TASKS.md. `TASKS_FILE` env var lets tests point it at fixtures.
- Monorepo: npm workspaces `apps/web`, `apps/server`, `packages/engine`, `packages/data`. Strict TS (TypeScript 7.0.2), Vitest 4.1.11 with one project per workspace plus `scripts`.
- `packages/data`: 36 states + FCT, all 774 LGAs, official reps counts (sum 360), fictional parties (PUP, NDA, PRM, LF, IND), NPC name pools with a blocked list of real politicians' surnames. While writing the pools I caught and removed several surnames that matched real politicians (Atiku-, Ikpeazu-, Igbinedion-, Okonjo-, Lamido).
- `packages/engine`: seeded RNG (sfc32/cyrb128, forkable, save/restore), deterministic world generator: 109 senatorial districts, 360 constituencies (Lagos splits), unit profiles (population, wealth, insecurity by type, issues, party leanings, 7 voter blocs), 1,317 seats, one NPC per seat.
- `apps/server`: Fastify 5; DB adapter over `pg` or PGlite; SQL migration runner; schema `001_init.sql` (users, sessions, verification tokens, outbox, geography, parties, memberships, characters, NPCs, seats, `seat_tenures` with partial unique indexes for one-holder-per-seat and one-seat-per-holder, append-only `audit_log` trigger, `world_state`); idempotent transactional seeder; auth (register, verify email, login, logout, me, resend) with scrypt hashes, hashed tokens, httpOnly session cookies, per-route rate limits, audit entries.
- `apps/web`: Vite 8 + React 19 + Tailwind 4 + Zustand + framer-motion. Start screen with disclaimer and live world stats, register/login/verify/home screens, dark mode toggle.
- Docker: server + web Dockerfiles, nginx config, `docker-compose.yml`. **Not built or run** (no Docker here).
- Moved P2-T01, P2-T02 (RNG) and P2-T33 (engine purity) to done early because world generation needed them; they have their own tests.

### Decisions
- No Docker/Postgres/Redis on this machine, so PGlite (real Postgres in WASM) backs tests and `npm run dev`. Recorded in KNOWN_GAPS.md.
- `npm i -w <workspace> <deps>` silently failed to save runtime deps the first time for a freshly created workspace package.json; re-running fixed it. Worth knowing if it recurs.
- Login is allowed before email verification; game actions will require it (Phase 3).

### Commits
- Commit `7532602`: Phase 1 implementation (scaffold, data, engine, server, web, Docker files)
- Commit `dbf9dc5`: verify-tasks integration tests, TASKS.md checks, `npm run dev` smoke script

### Issues found while verifying
- First full `npm test`: `scripts/verify-tasks.test.mjs > runs referenced tests` timed out at Vitest's default 5s. It spawns a nested Vitest run, which is slower when every project runs in parallel (it passed alone). Raised `testTimeout` for the scripts project to 120s.

### End-of-phase verification (real output, trimmed)

```
$ npm test
 Test Files  18 passed (18)
      Tests  123 passed (123)
npm test exit: 0

$ npm run typecheck        # tsc in data, engine, server, web
typecheck exit: 0

$ npm run build -w @avm/web
dist/index.html                   0.66 kB │ gzip:   0.38 kB
dist/assets/index-BonQ7Xnu.css   21.13 kB │ gzip:   5.03 kB
dist/assets/index-RTLWmiaE.js   401.90 kB │ gzip: 128.70 kB

$ node scripts/smoke-dev.mjs      # runs `npm run dev`, probes through the Vite proxy
web index ok: true
api via proxy: {"status":"ok","db":"pglite","dbOk":true,"kv":"memory"}
world summary: {"seeded":true,...,"counts":{"states":37,"lgas":774,"senatorial_districts":109,"federal_constituencies":360,"parties":5,"seats":1317,"npcs":1317,"seat_tenures":1317},"seatsHeldByNpcs":1317,"seatsHeldByPlayers":0}
smoke exit: 0

$ npm run seed     # second run on the same .pglite dir
"seeded": false    # idempotent

$ npm run verify-tasks
Running 17 test file(s) referenced by done tasks...
Running: npm ls --workspaces --depth=0
Running: npm run typecheck
Running: npm test
Running: npm run build -w @avm/web
Running: node scripts/smoke-dev.mjs

=== TASKS.md verification report ===
Total tasks:  365
Done [x]:     56
In progress:  5
Blocked:      1
Not started:  303

All 56 done task(s) passed verification.
verify exit: 0
```

Negative check: a copy of TASKS.md with P1-T60 (OAuth) faked as `[x]` was rejected:
`file not found: apps/server/src/auth/oauth.ts` and `test not found in run: ... > oauth > logs in with provider`.

`docker compose up`: **NOT verified.** Docker is not installed on this machine (P1-T58 `[!]`).

### Phase 1 status
56 / 365 done (53 Phase 1 + 3 early Phase 2). Phase 1 not fully done: P1-T23 and P1-T59 `[~]` (pg and Redis branches never ran), P1-T55..T57 `[~]` (Docker files never built), P1-T58 `[!]` (no Docker), P1-T60 `[ ]` (OAuth, optional).

- Correction: P1-T02 evidence now cites commit `1880601`, the commit that added the first log entry its test checks (it previously cited `dbf9dc5`, where the log was still empty).

## 2026-10-06 — Session 1 (continued): Phase 2 engine

### What was done
New pure modules in `packages/engine/src`: `stats.ts`, `character.ts` (10 backgrounds, 12 traits, 3 incompatible pairs, name/age/LGA validation), `money.ts` (₦ formatting, wallet vs war chest), `calendar.ts`, `approval.ts`, `economy.ts`, `voters.ts` (bloc utility, turnout, NPC vote simulation, player votes added at full weight), `elections.ts` (plurality, governor 25%-in-⅔-of-LGAs, president 25%-in-24-of-37, run-off selection, ties), `text.ts` (templates with variables, inline variations, named pools), `events/` (types, condition evaluator, weighted selection with cooldowns, choice outcomes and effects, follow-up chains, JSON validator), `bribery.ts`, `insecurity.ts`, `legacy.ts`, `zoning.ts`, `tick.ts` (deterministic monthly world tick). One test file per module.

### Problems found and fixed while testing
- 2 failures were **my own wrong test data**, not code bugs: the plurality test and the governor test had vote numbers where the candidate I expected to win actually had fewer votes (b 55 vs a 50; b 160 vs a 140). The code was right; I corrected the numbers.
- 1 real imbalance: background stat totals ranged 365 (civil servant) to 435 (entertainer). Adjusted civil servant up and entertainer down; range is now 385-420 and the test bound tightened from 60 to 50.
- The test "runner-up is chosen by spread first, not by votes" passed but did not prove its claim: in my data the chosen runner-up also had more votes. Rewrote it so the other candidate has more votes, and the test now asserts that precondition.

### Mutation check (do the election tests catch real bugs?)
Temporarily broke `elections.ts` three ways, ran its tests, restored the file:
```
--- mutation: two-thirds rounds down instead of up        Tests  1 failed | 13 passed (14)
--- mutation: president needs 23 units instead of 24      Tests  1 failed | 13 passed (14)
--- mutation: runner-up chosen by votes before spread     Tests  1 failed | 13 passed (14)
```
Restoration confirmed by grepping the original lines and re-running: `Tests 144 passed (144)` (engine).

### Verification (real output, trimmed)
```
$ npm run typecheck
typecheck exit 0

$ npm test
 Test Files  32 passed (32)
      Tests  238 passed (238)
npm test exit: 0

$ npm run verify-tasks
=== TASKS.md verification report ===
Total tasks:  365
Done [x]:     85
In progress:  6
Blocked:      1
Not started:  273

All 85 done task(s) passed verification.
verify exit: 0
```
- Commit `26b74ea`: Phase 2 engine code and tests.

### Phase 2 status
32 of 33 Phase 2 tasks done. P2-T04 is `[~]`: background perks are labels with no mechanical effect yet. Engine assumptions and invented numbers are listed in KNOWN_GAPS.md under "Engine (Phase 2)".
`docker compose up` still not verifiable (no Docker). `npm run dev` verified by `scripts/smoke-dev.mjs` inside verify-tasks.

## 2026-10-06 — Session 1 (continued): Phase 3 citizen role

### What was done
- Migration `002_citizen.sql`: ledger (`transactions`), action cooldown log, volunteer roles, civic groups, petitions + signatures, protests + participants, businesses, news items, journalist stories, chat (groups, messages, blocks), reports, notifications; `energy`, `journalist_rep`, `avatar_seed` on characters; `muted_until` on users; `last_tick_turn` on world state.
- Engine: `citizen.ts` (energy regen, rally/protest outcomes, business income, economy factor), `filter.ts` (profanity masking with leetspeak, incitement rejection, real-politician mention check).
- Server (`apps/server/src/game/`): characters (create needs verified email; one per account; engine-validated; never trusts client stats), parties (join/leave with rejoin cooldown), citizen actions (donate to party or candidate war chest, rally, volunteer, petitions, protests, civic groups), finance (businesses, ledger, wallet↔war chest transfers with diversion flag), media (news feed, Naija Daily templates, journalist stories checked against game records), notifications, chat REST, Socket.IO realtime (session-cookie auth, channel access, blocks, mutes, rate limit, filter, live notifications), world tick (catch-up, idempotent turn claims, business income, monthly headlines). Every money move is a single conditional UPDATE so balances can never go negative; every action is audited.
- Web: character wizard, app shell (lazy-loaded screens, header with in-game date, wallet, notification bell), dashboard, profile (with logout), party hub, actions, finance, news + story composer, chat; generated SVG avatars; Socket.IO proxy in Vite.
- `scripts/check-bundle.mjs`: builds the web app, checks all 8 game screens are separate chunks and the entry chunk is within budget. `scripts/smoke-dev.mjs` now also checks Socket.IO through the dev proxy.

### Problems found and fixed while testing
- The tick report counted all businesses while the audit counted paid owners; both now count businesses that actually earned income.
- A wallet↔war chest transfer line I first wrote could throw the engine's error instead of a clean game error; reordered so the DB debit checks the balance first.
- The overdraft donation test only asserted inside an `if`; rewritten to be unconditional.
- Two web e2e failures were my test code, not the app: (1) the logout test clicked before the lazily loaded screen rendered; (2) my cookie-jar `fetch` wrapper overwrote an explicitly passed cookie, so the "other player" donation was sent as the same player and the server correctly answered `self_donation`. Fixed the wrapper to respect an explicit cookie.
- Removed the character preview avatar: it was seeded from the name, but the server assigns a random avatar seed, so it would have shown the wrong face.
- Verified players had no logout after `/home` started redirecting into the game; added logout to the profile screen (also resets game state and closes the socket).

### Mutation checks
- Made `DashboardScreen` an eager import: `check-bundle` failed (`missing lazy chunks: DashboardScreen`, exit 1). Restored; passes again (exit 0).

### Verification (real output, trimmed)
```
$ npm run typecheck
typecheck exit 0

$ npm test   (run 3 times to look for flakiness)
 Test Files  42 passed (42)
      Tests  317 passed (317)
      Tests  317 passed (317)
      Tests  317 passed (317)

$ node scripts/check-bundle.mjs
entry index-BDXnsz2R.js: 83.2 KB gzip (budget 200 KB)
js chunks: 15; lazy screen chunks found: 8/8

$ node scripts/smoke-dev.mjs
socket.io via proxy: 0{"sid":"I99658MfhN0gPIVwAAAA","upgrades
web index ok: true
api via proxy: {"status":"ok","db":"pglite","dbOk":true,"kv":"memory"}
smoke exit 0

$ npm run verify-tasks
=== TASKS.md verification report ===
Total tasks:  365
Done [x]:     117
In progress:  8
Blocked:      1
Not started:  239

All 117 done task(s) passed verification.
verify exit: 0
```
- Commit `8489b6c`: Phase 3 server.
- Commit `1a5bbb8`: Phase 3 web and bundle check.

### Phase 3 status
32 of 35 done. P3-T05 `[~]` (dashboard has no countdowns/promises/approval until Phases 5/7), P3-T20 `[~]` (in-process scheduler only, no BullMQ; the interval loop itself is untested), P3-T33 `[ ]` (web push not started).
`docker compose up` still not verifiable (no Docker). Not tested in a real browser: all UI tests run in jsdom against the real in-process server.


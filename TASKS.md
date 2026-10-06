# Abeg Vote Me — Master Task List

Status markers: `[ ]` not started · `[~]` in progress / partial (see `note:`) · `[x]` done AND verified · `[!]` blocked (see `note:`)

Line format: `- [ ] P3-T07 | Short description | Evidence: <items>`

Evidence items are separated by ` ; ` and each has a prefix that `npm run verify-tasks` checks:

| Prefix | Meaning | How it is verified |
|---|---|---|
| `file:` | path(s) implementing the task, comma separated | each path must exist |
| `test:` | `path/to/file.test.ts > describe > test name` | test must run and pass (Vitest JSON report) |
| `cmd:` | a shell command run from repo root | must exit 0 |
| `commit:` | short commit hash | must exist in `git` history |
| `note:` | free text (what is missing / why blocked) | not checked |

A `[x]` task needs at least one `file:`, at least one `test:` or `cmd:`, and a `commit:`.

---

## Phase 1 — Tracking, scaffold, Docker, DB schema, auth, seeded world

- [ ] P1-T01 | Create TASKS.md master checklist (300+ tasks, all phases) | Evidence:
- [ ] P1-T02 | Create append-only PROGRESS_LOG.md | Evidence:
- [ ] P1-T03 | Create KNOWN_GAPS.md honesty list | Evidence:
- [ ] P1-T04 | verify-tasks: parse TASKS.md lines, statuses and evidence items | Evidence:
- [ ] P1-T05 | verify-tasks: check file paths in evidence exist | Evidence:
- [ ] P1-T06 | verify-tasks: run referenced Vitest tests and check they pass | Evidence:
- [ ] P1-T07 | verify-tasks: run referenced commands and check exit code 0 | Evidence:
- [ ] P1-T08 | verify-tasks: check commit hashes exist in git | Evidence:
- [ ] P1-T09 | verify-tasks: print report (totals by status, failing tasks) and exit non-zero on failure | Evidence:
- [ ] P1-T10 | verify-tasks: unit tests for parser and evidence rules | Evidence:
- [ ] P1-T11 | Root npm workspaces monorepo (apps/*, packages/*) | Evidence:
- [ ] P1-T12 | Shared strict tsconfig base and per-package tsconfigs | Evidence:
- [ ] P1-T13 | Root typecheck script passes across all workspaces | Evidence:
- [ ] P1-T14 | Root Vitest config with projects; npm test runs every workspace | Evidence:
- [ ] P1-T15 | packages/engine scaffold (pure TS, no DB/UI deps) | Evidence:
- [ ] P1-T16 | packages/data scaffold | Evidence:
- [ ] P1-T17 | apps/server scaffold (Fastify + TypeScript) with health endpoint | Evidence:
- [ ] P1-T18 | apps/web scaffold (Vite + React + TS) builds | Evidence:
- [ ] P1-T19 | Tailwind configured with green-white-green theme tokens and dark mode | Evidence:
- [ ] P1-T20 | Zustand and Framer Motion installed and used by the web shell | Evidence:
- [ ] P1-T21 | Server config loader with validation and .env.example | Evidence:
- [ ] P1-T22 | Game timers and calendar config file (config/game.json) loaded and validated | Evidence:
- [ ] P1-T23 | DB adapter: pg (Postgres) or PGlite fallback behind one interface with transactions | Evidence:
- [ ] P1-T24 | SQL migration runner with schema_migrations tracking (idempotent) | Evidence:
- [ ] P1-T25 | Schema: users, sessions, email verification tokens, outbox | Evidence:
- [ ] P1-T26 | Schema: states, LGAs, senatorial districts, federal constituencies (with LGA links) | Evidence:
- [ ] P1-T27 | Schema: parties and party memberships | Evidence:
- [ ] P1-T28 | Schema: characters (player profiles) and NPCs | Evidence:
- [ ] P1-T29 | Schema: seats and seat_tenures with partial unique index (one active holder per seat) | Evidence:
- [ ] P1-T30 | Schema: one active seat per player character (partial unique index) | Evidence:
- [ ] P1-T31 | Schema: append-only audit_log (DB trigger blocks update/delete) | Evidence:
- [ ] P1-T32 | Schema: world_state (clock, seed, national metrics) | Evidence:
- [ ] P1-T33 | Data: 36 states + FCT with zone and capital | Evidence:
- [ ] P1-T34 | Data: all 774 LGAs with per-state counts matching official totals | Evidence:
- [ ] P1-T35 | Data: federal constituency counts per state summing to 360 | Evidence:
- [ ] P1-T36 | Data: fictional parties (PUP, NDA, PRM, Labour Front, independent) | Evidence:
- [ ] P1-T37 | Generator: 109 senatorial districts (3 per state + 1 FCT) | Evidence:
- [ ] P1-T38 | Generator: 360 federal constituencies built from LGAs (splits when constituencies exceed LGAs) | Evidence:
- [ ] P1-T39 | Generator: per-unit population, wealth, insecurity, issue priorities, party leanings, voter blocs (seeded, deterministic) | Evidence:
- [ ] P1-T40 | Generator: full seat list (1 President, 1 VP, 36 Gov, 36 Deputy Gov, 109 Senate, 360 Reps, 774 LG Chairmen) | Evidence:
- [ ] P1-T41 | Generator: NPC placeholder holder for every seat with fictional names | Evidence:
- [ ] P1-T42 | Seed script writes generated world to DB in one transaction, idempotent | Evidence:
- [ ] P1-T43 | Auth: register with email + password (scrypt hash, normalised unique email) | Evidence:
- [ ] P1-T44 | Auth: email verification token issued, stored hashed, sent via outbox mailer | Evidence:
- [ ] P1-T45 | Auth: verify-email endpoint consumes token once and expires | Evidence:
- [ ] P1-T46 | Auth: login creates httpOnly session cookie; wrong password rejected | Evidence:
- [ ] P1-T47 | Auth: logout revokes session; /me returns current user | Evidence:
- [ ] P1-T48 | Auth: one account per email enforced (case-insensitive) | Evidence:
- [ ] P1-T49 | Auth: rate limiting on auth routes | Evidence:
- [ ] P1-T50 | Auth: audit log entries for register, verify, login, logout | Evidence:
- [ ] P1-T51 | Web: start screen with satire/fiction disclaimer | Evidence:
- [ ] P1-T52 | Web: register, login, verify-email screens wired to API | Evidence:
- [ ] P1-T53 | Web: API client hook with typed responses and error handling | Evidence:
- [ ] P1-T54 | npm run dev starts server (PGlite) and web together | Evidence:
- [ ] P1-T55 | Server Dockerfile | Evidence:
- [ ] P1-T56 | Web Dockerfile (static build served by nginx) | Evidence:
- [ ] P1-T57 | docker-compose.yml with postgres, redis, server, web | Evidence:
- [ ] P1-T58 | docker compose up verified end to end | Evidence:
- [ ] P1-T59 | Redis client wrapper with in-memory fallback | Evidence:
- [ ] P1-T60 | OAuth login provider (optional sign-in path) | Evidence:

## Phase 2 — Engine package (pure, seeded, unit tested)

- [ ] P2-T01 | Seeded RNG (deterministic, forkable streams) | Evidence:
- [ ] P2-T02 | RNG helpers: int range, chance, weighted pick, shuffle, gaussian | Evidence:
- [ ] P2-T03 | Stat model: 8 stats clamped 0-100 with modifiers | Evidence:
- [ ] P2-T04 | Backgrounds (10) with starting stats and perks | Evidence:
- [ ] P2-T05 | Traits catalogue (12+) with effects; pick exactly 2; incompatible pairs rejected | Evidence:
- [ ] P2-T06 | Character creation validation (age 25-60, home state/LGA valid, name rules) | Evidence:
- [ ] P2-T07 | Naira formatting (₦1,500,000) and compact form (₦1.5m) | Evidence:
- [ ] P2-T08 | Money ledger ops: personal wealth vs war chest kept separate, no negative balances | Evidence:
- [ ] P2-T09 | Calendar: real time to in-game date conversion (configurable rate) | Evidence:
- [ ] P2-T10 | Approval model: drivers, decay toward baseline, clamp | Evidence:
- [ ] P2-T11 | Economy tick: inflation, fuel price, exchange rate, food prices | Evidence:
- [ ] P2-T12 | Voter bloc preference scoring (issues, party loyalty, region, incumbency, money, charisma) | Evidence:
- [ ] P2-T13 | Turnout model (insecurity, enthusiasm, weather events) | Evidence:
- [ ] P2-T14 | NPC vote simulation per unit with seeded randomness | Evidence:
- [ ] P2-T15 | Real player votes added on top of simulated votes | Evidence:
- [ ] P2-T16 | Plurality rule for Reps, Senate, LG Chairman | Evidence:
- [ ] P2-T17 | Governor rule: most votes + 25% in two-thirds of LGAs | Evidence:
- [ ] P2-T18 | President rule: most votes + 25% in 24 of 37 units, else run-off | Evidence:
- [ ] P2-T19 | Run-off candidate selection (top + best qualifying runner-up) | Evidence:
- [ ] P2-T20 | Tie handling (deterministic seeded tiebreak then rerun flag) | Evidence:
- [ ] P2-T21 | Event engine: condition evaluator (stats, career, phase, flags, metrics) | Evidence:
- [ ] P2-T22 | Event engine: weighted selection with repeat cooldown history | Evidence:
- [ ] P2-T23 | Event engine: choice outcomes applied as effects | Evidence:
- [ ] P2-T24 | Event engine: follow-up chains scheduled with delay | Evidence:
- [ ] P2-T25 | Event JSON schema validator (rejects malformed events) | Evidence:
- [ ] P2-T26 | Template text system with variables and variation pools | Evidence:
- [ ] P2-T27 | Bribery: price by target personality and detection probability | Evidence:
- [ ] P2-T28 | Bribery: refusal, insult and blackmail-back outcomes | Evidence:
- [ ] P2-T29 | Insecurity model tick (per-type levels driven by policy inputs) | Evidence:
- [ ] P2-T30 | Legacy score calculation (Impact, Integrity, Popularity, Wealth, Power) | Evidence:
- [ ] P2-T31 | Zoning expectation modifier on ticket odds | Evidence:
- [ ] P2-T32 | Engine determinism test: same seed gives identical world tick | Evidence:
- [ ] P2-T33 | Engine has no DB/UI imports (lint check) | Evidence:

## Phase 3 — Citizen role

- [ ] P3-T01 | API: create character (one per account) using engine validation | Evidence:
- [ ] P3-T02 | Web: character creation wizard (name, gender, age, state/LGA, background, traits) | Evidence:
- [ ] P3-T03 | Web: generated SVG avatar from character seed | Evidence:
- [ ] P3-T04 | API + Web: profile screen with stats and wallet/war chest | Evidence:
- [ ] P3-T05 | Web: dashboard (office/aspiration, date, approval, money, stats, countdowns) | Evidence:
- [ ] P3-T06 | Web: app shell navigation with lazy-loaded screens | Evidence:
- [ ] P3-T07 | API: list parties with membership counts | Evidence:
- [ ] P3-T08 | API: join party (one party at a time) | Evidence:
- [ ] P3-T09 | API: leave party with cooldown | Evidence:
- [ ] P3-T10 | Web: Party Hub screen (browse, join, leave) | Evidence:
- [ ] P3-T11 | API: donate to party or candidate (money moves atomically, audited) | Evidence:
- [ ] P3-T12 | API: attend rally (stamina cost, small stat gain) | Evidence:
- [ ] P3-T13 | API: volunteer as ward agent or delegate | Evidence:
- [ ] P3-T14 | API: create and sign petitions | Evidence:
- [ ] P3-T15 | API: join a protest (risk and reward) | Evidence:
- [ ] P3-T16 | API: join labour, student, trade or community watch groups | Evidence:
- [ ] P3-T17 | API: start a business (cost, sector, monthly income) | Evidence:
- [ ] P3-T18 | Business income applied on world tick | Evidence:
- [ ] P3-T19 | Web: Finance screen (balances, transactions, businesses) | Evidence:
- [ ] P3-T20 | World tick scheduler (BullMQ when Redis present, in-process fallback) | Evidence:
- [ ] P3-T21 | News items generated from player actions and world events | Evidence:
- [ ] P3-T22 | Naija Daily headline generator using template system | Evidence:
- [ ] P3-T23 | Web: News Feed / Home screen | Evidence:
- [ ] P3-T24 | Journalist: publish story with accuracy tracking and reputation | Evidence:
- [ ] P3-T25 | Socket.IO server with session auth | Evidence:
- [ ] P3-T26 | Chat: global, state and party channels with persistence | Evidence:
- [ ] P3-T27 | Chat: private and group messages | Evidence:
- [ ] P3-T28 | Chat: rate limiting per user | Evidence:
- [ ] P3-T29 | Chat: profanity / hate filter | Evidence:
- [ ] P3-T30 | Chat: mute, block and report | Evidence:
- [ ] P3-T31 | Web: Chat screen with live updates | Evidence:
- [ ] P3-T32 | In-app notifications (persisted + live) | Evidence:
- [ ] P3-T33 | Web push notifications (service worker + subscription) | Evidence:
- [ ] P3-T34 | Light/dark mode toggle persisted | Evidence:
- [ ] P3-T35 | Game clock shown in header (in-game date) | Evidence:

## Phase 4 — Seats and offices

- [ ] P4-T01 | Atomic seat takeover: end current tenure, start new one in one transaction | Evidence:
- [ ] P4-T02 | Concurrent takeover attempts cannot produce two holders (test) | Evidence:
- [ ] P4-T03 | NPC placeholder replaced when a player wins the seat | Evidence:
- [ ] P4-T04 | Resign from seat creates vacancy | Evidence:
- [ ] P4-T05 | Vacancy triggers by-election scheduling | Evidence:
- [ ] P4-T06 | Term start/end tracked; term expiry handled | Evidence:
- [ ] P4-T07 | Term limits: Governor and President max 2 terms | Evidence:
- [ ] P4-T08 | Name deputy / chief of staff to act while offline | Evidence:
- [ ] P4-T09 | Inactivity: autopilot after N days, vacancy after M days (config) | Evidence:
- [ ] P4-T10 | Ward seats (councillor, ward chairman) generated per LGA | Evidence:
- [ ] P4-T11 | API: browse seats by state/kind with current holders | Evidence:
- [ ] P4-T12 | Web: stylized clickable SVG Nigeria map (country) | Evidence:
- [ ] P4-T13 | Web: state view with LGA grid map | Evidence:
- [ ] P4-T14 | Web: constituency view with seat and holder details | Evidence:
- [ ] P4-T15 | Office eligibility rules (age, prior office, membership) | Evidence:
- [ ] P4-T16 | NPC office holders act on world tick (basic decisions) | Evidence:
- [ ] P4-T17 | Office salary paid on world tick | Evidence:
- [ ] P4-T18 | Seat history (past holders) endpoint and UI | Evidence:
- [ ] P4-T19 | Deputy succession when governor/president seat vacated | Evidence:
- [ ] P4-T20 | Audit log on every tenure change | Evidence:

## Phase 5 — Elections, primaries, campaigns, tribunal

- [ ] P5-T01 | Election cycle model with 9 phases and real deadlines | Evidence:
- [ ] P5-T02 | Scheduler advances phases on deadlines (survives restart) | Evidence:
- [ ] P5-T03 | Phase countdowns exposed via API and shown in UI | Evidence:
- [ ] P5-T04 | Party registration and membership window enforced | Evidence:
- [ ] P5-T05 | Declare candidacy for a seat (eligibility + fee) | Evidence:
- [ ] P5-T06 | Primaries: delegate pool per seat (players + NPC personalities) | Evidence:
- [ ] P5-T07 | Primaries: lobby delegates | Evidence:
- [ ] P5-T08 | Primaries: give "logistics" to delegates (bribe path, detection) | Evidence:
- [ ] P5-T09 | Primaries: promise appointments (tracked obligations) | Evidence:
- [ ] P5-T10 | Primaries: delegate speech (stat-weighted) | Evidence:
- [ ] P5-T11 | Primaries: delegate voting and result | Evidence:
- [ ] P5-T12 | Primary outcomes: step down for consensus deal | Evidence:
- [ ] P5-T13 | Primary outcomes: splinter ticket or go independent | Evidence:
- [ ] P5-T14 | Web: Primaries screen | Evidence:
- [ ] P5-T15 | Nomination and screening phase (disqualification checks) | Evidence:
- [ ] P5-T16 | Campaign budget allocation across 11 channels | Evidence:
- [ ] P5-T17 | Campaign spending converts to bloc influence with diminishing returns | Evidence:
- [ ] P5-T18 | Manifesto: pick 5 promises from issue list | Evidence:
- [ ] P5-T19 | Promise tracker; broken promises cost approval | Evidence:
- [ ] P5-T20 | Rally planner: venue, tactics, security risk, topic | Evidence:
- [ ] P5-T21 | Rally random events (hostile crowd, rain, celebrity, heckler) | Evidence:
- [ ] P5-T22 | Campaign director selection | Evidence:
- [ ] P5-T23 | Running mate / deputy selection with balance scoring | Evidence:
- [ ] P5-T24 | Web: Campaign HQ screen | Evidence:
- [ ] P5-T25 | Voting window 24-48h; one vote per account per election | Evidence:
- [ ] P5-T26 | Vote casting API with rate limit and audit | Evidence:
- [ ] P5-T27 | NPC voter simulation at close using engine voter model | Evidence:
- [ ] P5-T28 | Collation by LGA and state stored as result rows | Evidence:
- [ ] P5-T29 | Result declaration applies correct rule per office | Evidence:
- [ ] P5-T30 | Presidential run-off election created when needed | Evidence:
- [ ] P5-T31 | Winner takes seat atomically on swearing in | Evidence:
- [ ] P5-T32 | Withdrawals and disqualifications handled mid-cycle | Evidence:
- [ ] P5-T33 | Election day morning event cards | Evidence:
- [ ] P5-T34 | Web: Election Centre with TV-style tally and animated counters | Evidence:
- [ ] P5-T35 | Web: results map filling with party colours | Evidence:
- [ ] P5-T36 | Election day actions: send agents, urge calm, accept or challenge | Evidence:
- [ ] P5-T37 | Tribunal petition (evidence, lawyers, cost, probability) | Evidence:
- [ ] P5-T38 | Tribunal multi-turn wait and ruling (may annul, order rerun) | Evidence:
- [ ] P5-T39 | Concession and victory speech screens | Evidence:
- [ ] P5-T40 | Swearing-in animation and inaugural speech choice | Evidence:
- [ ] P5-T41 | By-election cycle (shortened phases) | Evidence:
- [ ] P5-T42 | Web: "How elections work" help panel | Evidence:
- [ ] P5-T43 | Party founding (registration cost and member threshold) | Evidence:
- [ ] P5-T44 | Party executives, treasury and constitution rules | Evidence:
- [ ] P5-T45 | Party discipline: suspension and expulsion | Evidence:
- [ ] P5-T46 | Defection consequences (loyalty, network, media) | Evidence:
- [ ] P5-T47 | Godfather system: funding offers with expectations | Evidence:
- [ ] P5-T48 | Godfather break-up triggers dramatic events | Evidence:
- [ ] P5-T49 | Zoning and rotation deals between parties/players | Evidence:
- [ ] P5-T50 | Coalitions and party mergers | Evidence:

## Phase 6 — Press room and debates

- [ ] P6-T01 | Fictional media outlets data with journalist personalities | Evidence:
- [ ] P6-T02 | Question generator from game state (scandals, promises, insecurity, defections, rivals) | Evidence:
- [ ] P6-T03 | Player journalist question queue (NPCs fill gaps) | Evidence:
- [ ] P6-T04 | Response styles resolver (Honest, Deflect, Attack, Charm, Promise, No comment) | Evidence:
- [ ] P6-T05 | Free-text response scored by keyword + stats | Evidence:
- [ ] P6-T06 | Press conference session state on server | Evidence:
- [ ] P6-T07 | Web: Press Room (podium, mics, journalist row) | Evidence:
- [ ] P6-T08 | Animated meters: Public Image, Approval, Media Favour | Evidence:
- [ ] P6-T09 | Trending ticker with generated reactions | Evidence:
- [ ] P6-T10 | Gaffe system: viral clips persist and affect polls | Evidence:
- [ ] P6-T11 | Press releases | Evidence:
- [ ] P6-T12 | TV interviews and radio call-ins | Evidence:
- [ ] P6-T13 | Social media posts | Evidence:
- [ ] P6-T14 | Hire spokesperson (cost, skill bonus) | Evidence:
- [ ] P6-T15 | Rumour fighting: fact check, lawsuit, counter-narrative | Evidence:
- [ ] P6-T16 | Debate room: timed rounds (opening, topics, rebuttal, closing) | Evidence:
- [ ] P6-T17 | Debate: live audience reaction meters via Socket.IO | Evidence:
- [ ] P6-T18 | Debate result shifts undecided blocs | Evidence:
- [ ] P6-T19 | Skipping a debate applies penalty | Evidence:
- [ ] P6-T20 | Web: Debate Hall | Evidence:
- [ ] P6-T21 | Naija Daily newspaper page with front page and sections | Evidence:

## Phase 7 — Legislature and executive

- [ ] P7-T01 | Bills: sponsor, first reading, committee, floor vote | Evidence:
- [ ] P7-T02 | Real players vote on bills; NPC members vote per profile and bribes | Evidence:
- [ ] P7-T03 | Committees and chairmanships | Evidence:
- [ ] P7-T04 | Speaker and Senate President elections by members | Evidence:
- [ ] P7-T05 | Floor debate contributions | Evidence:
- [ ] P7-T06 | Oversight hearings and summons | Evidence:
- [ ] P7-T07 | Confirmation hearings for appointees | Evidence:
- [ ] P7-T08 | Constituency projects | Evidence:
- [ ] P7-T09 | Budget defence sessions | Evidence:
- [ ] P7-T10 | Web: Legislature Floor | Evidence:
- [ ] P7-T11 | Executive: sign or veto bills; veto override by two-thirds | Evidence:
- [ ] P7-T12 | Executive orders | Evidence:
- [ ] P7-T13 | State of emergency declaration | Evidence:
- [ ] P7-T14 | Appointments: aides, commissioners, ministers (player or NPC) | Evidence:
- [ ] P7-T15 | Appointee attributes: competence, loyalty, region, integrity | Evidence:
- [ ] P7-T16 | Budget screen by sector (10 sectors) | Evidence:
- [ ] P7-T17 | Budget effects on national/state metrics | Evidence:
- [ ] P7-T18 | Policies (subsidy removal, minimum wage, tax reform, etc.) | Evidence:
- [ ] P7-T19 | Governor: state budget, IGR, federal relations | Evidence:
- [ ] P7-T20 | President: cabinet, foreign policy, summits, national broadcast | Evidence:
- [ ] P7-T21 | Crisis events (strikes, floods, protests, epidemics, naira swings, grid collapse) with 3-4 options | Evidence:
- [ ] P7-T22 | National metrics (7) computed and shown | Evidence:
- [ ] P7-T23 | Monthly opinion poll | Evidence:
- [ ] P7-T24 | Relationship meters (exec vs legislature, party) | Evidence:
- [ ] P7-T25 | Impeachment motion and two-thirds vote | Evidence:
- [ ] P7-T26 | Vote of no confidence | Evidence:
- [ ] P7-T27 | Web: Executive Office | Evidence:
- [ ] P7-T28 | Laws registry and new-law notifications | Evidence:

## Phase 8 — Corruption, manipulation, investigation, courts

- [ ] P8-T01 | Bribe targets: delegates, voters, officials, judges, journalists, executives, chairmen, probe officers | Evidence:
- [ ] P8-T02 | Target personalities and prices from DB/NPC profile | Evidence:
- [ ] P8-T03 | Cash vs bank transfer trails | Evidence:
- [ ] P8-T04 | Budget siphoning and contract inflation | Evidence:
- [ ] P8-T05 | Ghost workers and constituency project scams | Evidence:
- [ ] P8-T06 | Kickbacks and crony contracts | Evidence:
- [ ] P8-T07 | Laundering via businesses, foundations, relatives (skill + cost) | Evidence:
- [ ] P8-T08 | Hidden truth vs public perception reputation model | Evidence:
- [ ] P8-T09 | Propaganda, fake news, paid attackers, bots | Evidence:
- [ ] P8-T10 | Smear stories and doctored scandals (flagged in-game) | Evidence:
- [ ] P8-T11 | Kompromat collection and blackmail | Evidence:
- [ ] P8-T12 | Vote rigging actions (implied) with detection | Evidence:
- [ ] P8-T13 | Intimidation / area boys / sabotage (text only, implied) | Evidence:
- [ ] P8-T14 | Last-minute delegate defections | Evidence:
- [ ] P8-T15 | Impeachment plots and "settling" a legislature | Evidence:
- [ ] P8-T16 | Federal Anti-Graft Bureau: investigations build evidence over real time | Evidence:
- [ ] P8-T17 | Bureau head can be player appointee or NPC; capture by bribe | Evidence:
- [ ] P8-T18 | Dodge/delay investigation options | Evidence:
- [ ] P8-T19 | Interrogation, lawyer choice, plea options | Evidence:
- [ ] P8-T20 | Outcomes: cleared, fined, jailed, plea deal, "sudden health recovery" | Evidence:
- [ ] P8-T21 | Journalist evidence-backed stories; fabricated stories risk libel | Evidence:
- [ ] P8-T22 | Citizen leaks | Evidence:
- [ ] P8-T23 | Lawsuits filed by players | Evidence:
- [ ] P8-T24 | Courts with player or NPC judges and real timers | Evidence:
- [ ] P8-T25 | Prison mode: limited actions comeback storyline | Evidence:
- [ ] P8-T26 | Asset seizure and exile option | Evidence:
- [ ] P8-T27 | Party expulsion from scandal | Evidence:
- [ ] P8-T28 | Gap-exposure events when hidden truth surfaces | Evidence:
- [ ] P8-T29 | Web: Intel / Dirty Tricks screen (hidden until contacts unlocked) | Evidence:
- [ ] P8-T30 | Web: Courts screen | Evidence:
- [ ] P8-T31 | Audit log entries for bribes, transfers, rigging attempts | Evidence:
- [ ] P8-T32 | Balance test: dirty play strong short term, risky long term | Evidence:

## Phase 9 — Banditry and insecurity

- [ ] P9-T01 | Per-region insecurity types (banditry, kidnapping, farmer-herder, communal, militancy, urban crime) | Evidence:
- [ ] P9-T02 | Fictional armed group names data | Evidence:
- [ ] P9-T03 | Server tick evolves insecurity from policy inputs | Evidence:
- [ ] P9-T04 | Governor/President security levers (budget, deployment, intelligence, vigilantes, policing, amnesty, youth, borders) | Evidence:
- [ ] P9-T05 | Insecurity effects: farm output, food prices, school attendance, investment | Evidence:
- [ ] P9-T06 | Insecurity effects: turnout, approval, rally safety | Evidence:
- [ ] P9-T07 | Recurring security crises with tradeoff choices | Evidence:
- [ ] P9-T08 | Corrupt security options (diverting vote, equipment contracts, ghost soldiers, quiet deals) | Evidence:
- [ ] P9-T09 | Journalists can expose security corruption | Evidence:
- [ ] P9-T10 | Legislators: summon service chiefs, security bills, projects | Evidence:
- [ ] P9-T11 | Citizens: community watch, report incidents, fundraise for victims | Evidence:
- [ ] P9-T12 | Security contracts for citizens | Evidence:
- [ ] P9-T13 | Web: Security Briefing screen (stats, headlines, no graphic content) | Evidence:
- [ ] P9-T14 | Content review: insecurity text is non-graphic | Evidence:

## Phase 10 — Economy, contracts, assets, laundering

- [ ] P10-T01 | Shared economy state (naira, inflation, fuel, FX, food, allocations) updated on tick | Evidence:
- [ ] P10-T02 | Player decisions, insecurity and corruption feed economy | Evidence:
- [ ] P10-T03 | State revenues and federal allocation | Evidence:
- [ ] P10-T04 | Income sources: salaries, businesses, contracts, donations, godfather funding | Evidence:
- [ ] P10-T05 | Assets: houses, businesses, farms, media houses, foundations | Evidence:
- [ ] P10-T06 | Media house boosts Media meter; foundation boosts Public Image | Evidence:
- [ ] P10-T07 | Asset upkeep costs | Evidence:
- [ ] P10-T08 | Contracts marketplace: listing and bids | Evidence:
- [ ] P10-T09 | Contract award fair or crooked with consequences | Evidence:
- [ ] P10-T10 | Contract delivery and quality affecting metrics | Evidence:
- [ ] P10-T11 | Money sinks: taxes, legal fees, campaign costs | Evidence:
- [ ] P10-T12 | Wealth caps and anti-farming guard | Evidence:
- [ ] P10-T13 | Laundering skill progression | Evidence:
- [ ] P10-T14 | Web: Finance and Assets screen complete | Evidence:
- [ ] P10-T15 | Economy simulation test: no runaway inflation over 10 years | Evidence:

## Phase 11 — Moderation, anti-cheat, admin

- [ ] P11-T01 | Report player, chat message or content | Evidence:
- [ ] P11-T02 | Admin role and protected admin routes | Evidence:
- [ ] P11-T03 | Admin: mute and ban users | Evidence:
- [ ] P11-T04 | Admin: void actions and votes with logged reason | Evidence:
- [ ] P11-T05 | Admin: rerun a ward result with logged reason | Evidence:
- [ ] P11-T06 | Admin: audit log viewer with filters | Evidence:
- [ ] P11-T07 | Admin: live game config tuning | Evidence:
- [ ] P11-T08 | Web: Admin dashboard | Evidence:
- [ ] P11-T09 | Name filter (no real politicians/parties, slurs) | Evidence:
- [ ] P11-T10 | Chat content filter rules (hate speech, sexual content) | Evidence:
- [ ] P11-T11 | Age gate and terms acceptance at registration | Evidence:
- [ ] P11-T12 | Device fingerprint + IP heuristics for multi-accounting | Evidence:
- [ ] P11-T13 | Suspicious vote pattern detection | Evidence:
- [ ] P11-T14 | Global API rate limiting | Evidence:
- [ ] P11-T15 | Harassment action cooldowns | Evidence:
- [ ] P11-T16 | Limit repeated targeting of the same player | Evidence:
- [ ] P11-T17 | Rookie shield for new players (config days) | Evidence:
- [ ] P11-T18 | Password reset flow | Evidence:
- [ ] P11-T19 | Real SMTP mail delivery when configured | Evidence:
- [ ] P11-T20 | Security headers, CSRF protection for cookie auth | Evidence:

## Phase 12 — Practice Mode, tutorial, achievements, endings, polish

- [ ] P12-T01 | Practice Mode world runs the engine fully client-side (NPC-only) | Evidence:
- [ ] P12-T02 | Practice difficulty levels: Easy (Story), Normal, Hard, Real Naija | Evidence:
- [ ] P12-T03 | Practice Mode autosave | Evidence:
- [ ] P12-T04 | Practice save export/import with validation | Evidence:
- [ ] P12-T05 | Corrupted save handled gracefully | Evidence:
- [ ] P12-T06 | Skippable tutorial: vote, join a party, donate, run for a ward post | Evidence:
- [ ] P12-T07 | 200+ unique events in JSON (all categories) | Evidence:
- [ ] P12-T08 | Event content validated by schema and test | Evidence:
- [ ] P12-T09 | Persistent NPC cast with loyalty, trust, ambition, secrets | Evidence:
- [ ] P12-T10 | NPC betrayals, whistleblowers, defections, family events | Evidence:
- [ ] P12-T11 | 30+ achievements defined and awarded | Evidence:
- [ ] P12-T12 | Web: Achievements screen | Evidence:
- [ ] P12-T13 | Endings and titles (8) computed from legacy | Evidence:
- [ ] P12-T14 | Web: Profile and Legacy screen | Evidence:
- [ ] P12-T15 | Hall of fame and leaderboards | Evidence:
- [ ] P12-T16 | Season system with end-of-season results | Evidence:
- [ ] P12-T17 | Sound effects via Web Audio synth (off by default) | Evidence:
- [ ] P12-T18 | Reduced motion option | Evidence:
- [ ] P12-T19 | Keyboard navigation and ARIA labels audit | Evidence:
- [ ] P12-T20 | Contrast check for light and dark themes | Evidence:
- [ ] P12-T21 | Tooltips and help drawer | Evidence:
- [ ] P12-T22 | Web: Settings screen | Evidence:
- [ ] P12-T23 | Web: Help screen | Evidence:
- [ ] P12-T24 | Page transitions and number counters | Evidence:
- [ ] P12-T25 | Bundle size budget check (initial JS under 200KB gzip) | Evidence:
- [ ] P12-T26 | No crash on refresh (state rehydration) | Evidence:
- [ ] P12-T27 | Server restart resumes scheduled jobs | Evidence:

## Phase 13 — Balance, load test, docs, deployment

- [ ] P13-T01 | Simulation script auto-plays 500 Practice runs per career path | Evidence:
- [ ] P13-T02 | Win-rate report logged per path and difficulty | Evidence:
- [ ] P13-T03 | Tune Normal to 30-45% success per path | Evidence:
- [ ] P13-T04 | Load test with 1000 simulated players | Evidence:
- [ ] P13-T05 | README: setup | Evidence:
- [ ] P13-T06 | README: how to play | Evidence:
- [ ] P13-T07 | README: architecture | Evidence:
- [ ] P13-T08 | README: how to add events | Evidence:
- [ ] P13-T09 | Deployment guide (VPS, Render/Railway/Fly.io) | Evidence:
- [ ] P13-T10 | Final full verification run | Evidence:

# Known Gaps

An honest list of everything stubbed, mocked, hardcoded, simplified, untested or skipped.
If something is fake, it is listed here. Entries are removed only when the gap is actually closed (and the closing is noted in PROGRESS_LOG.md).

## Environment

- **No Docker, PostgreSQL or Redis on the development machine.** `docker compose up` has never been run. `apps/server/Dockerfile`, `apps/web/Dockerfile`, `apps/web/nginx.conf` and `docker-compose.yml` are written but **never built**. P1-T55..T57 are `[~]`, P1-T58 is `[!]`.
- **Postgres via `pg` is untested.** The server uses one DB adapter (`apps/server/src/db/index.ts`). Every test and `npm run dev` use **PGlite** (real Postgres 17 compiled to WASM, in-process), so the SQL, constraints, partial unique indexes, triggers and transactions are tested against real Postgres semantics. The `pg` Pool branch (used when `DATABASE_URL` is set) has never connected to a server. Concurrency under a real connection pool (several transactions at once) is untested: PGlite runs one connection.
- **Redis is untested.** `apps/server/src/redis.ts` has an in-memory fallback (tested) and an ioredis branch (never run). The in-memory fallback only works for a single server process.
- **Rate limiting uses an in-memory store**, even when Redis is configured. With several server instances, limits would apply per instance.

## Auth

- **No real email delivery.** (Email is optional now.) Verification emails are written to the `outbox_emails` table and logged in development. Nothing sends them over SMTP (P11-T19). In development, `GET /api/dev/outbox` shows them; this route is disabled when `NODE_ENV=production`.
- **Accounts are username + password; email is optional** (changed at the user's request, 2026-10-06). Nothing in the game needs a confirmed email. Consequences:
  - **No account recovery without an email.** A player who forgets their password and gave no email cannot get back in (and password reset, P11-T18, does not exist yet for anyone).
  - **"One account per person" is no longer backed by anything.** Email was the only check; now anyone can make many accounts. Multi-account detection belongs to anti-cheat (Phase 11).
  - Usernames are only used to log in and are not shown to other players, so they are not run through the chat filter.
- **Staying signed in** relies on the 30-day httpOnly session cookie (`SameSite=Lax`, `Secure` in production). There is no "remember me" choice and no sliding renewal: a session ends 30 days after login even if the player is active.
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
- **Wards are generated, not real.** Each LGA gets 8-14 wards from the seed (8,383 for the default seed; the real national total is 8,809), named "<LGA> Ward N". Every ward has a Councillor and a Ward Chairman seat, so the world has 18,000+ seats. Ward Chairman is treated as an elected seat here; in reality it is a party office.

## Server

- The production server runs TypeScript through `tsx`. There is no compiled JS build step yet.
- `GET /api/world/summary` is public and counts rows on every call. It is uncached.

## Web

- `/home` is now only the "confirm your email" page for unverified accounts; verified players are redirected into the game.
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
- **World tick** covers economy, per-state insecurity, the president's approval, office salaries and basic NPC office-holder decisions (Phase 4). Governors' approval, state economies, NPC party politics and scheduled events are not in it yet.

## Citizen role (Phase 3)

- **No web push** (P3-T33 not started). Live notifications only reach open tabs over Socket.IO; they are also stored and shown in the bell.
- **World tick scheduler is in-process only** (`setInterval` in the server). BullMQ is not implemented. With several server instances, each would run the loop; turns are still claimed atomically in the DB, so a turn cannot run twice, but this has only been tested on PGlite's single connection (the "concurrent" tick test really runs one after another).
- **Policy inputs to the tick**: since Phase 4, NPC governors set their state's security policy and an NPC President sets corruption and spending. Everything else is fixed (no fuel subsidy, no oil shock), and player-held offices get neutral inputs because players cannot set policy yet (Phase 7).
- **Dashboard has no countdowns, promises or approval** (P3-T05 `[~]`): those systems do not exist until Phases 5 and 7.
- **Energy** (new, not in the spec): actions cost energy that regenerates 5-15 per real hour depending on Stamina. Added so citizens cannot spam actions; numbers are untuned.
- **Journalist stories** are limited to 4 claim types that the server can check against records (party membership, party donation, owning a business, joining a protest). Free-text investigative stories, libel cases and evidence come in Phase 8. Reputation moves +5 for a true story and -12 for a false one.
- **The web can only donate to parties.** Donating to a candidate works through the API (and is tested) but has no screen yet.
- **Rally, protest and story outcomes** are simple stat nudges; no venues, crowds or events yet (Phase 5 campaign rallies).
- **Chat word lists are tiny** (`packages/data/src/moderation.ts`): 9 profanity words and 5 incitement patterns. They need a curated list, including Nigerian-language slurs, which I did not want to invent. Masking also over-matches some names that contain a listed word as a whole word.
- **Chat rate limit uses fixed 10-second windows**, so a burst across a window boundary can send up to 2× the limit. The rate-limit test could in theory flake if its 8 messages straddle a boundary (it has passed in every run so far).
- **Chat fan-out** fetches every socket in a channel and checks blocks per message. Fine for now; it will not scale to thousands in one channel (Phase 13 load test).
- **State chat** is limited to your home state. Party chat follows current membership; history from before you joined is visible.
- **Reports** are stored with status `open`; nobody can review them until the admin dashboard (Phase 11).
- **Web tests run against the real server in-process** (real HTTP, WebSocket, PGlite), but in jsdom, not a real browser. Layout, CSS and mobile rendering are not tested; no screenshot or browser automation was run.

## Seats and offices (Phase 4)

- **The seat row lock is untested.** `takeSeat`/`vacateSeat` lock the seat row (`SELECT ... FOR UPDATE`) so concurrent changes to one seat queue up. Tests run on PGlite, which runs transactions one at a time, so the lock never matters there: a mutation that removed it was **not** detected. What *is* tested is the real guarantee: the partial unique indexes reject a second active holder per seat (and a second seat per holder), even for a raw insert that skips the application. Behaviour under a real `pg` pool (lock waits, which request gets the clean error and which gets a constraint error) is untested.
- **No elections run yet.** Vacancies schedule a by-election (`scheduled_elections`, 72 h later) and expired player terms schedule a general election, but nothing holds them until Phase 5. Until then: a vacant seat stays vacant; a player whose term has ended "holds over" indefinitely; an NPC whose term ends is automatically returned for another term, or replaced by a fresh NPC (party drawn from state leanings) once term-limited. That automatic NPC return is a stand-in for elections, not a simulation of one.
- **Whole-world term renewal** happens all at once when the first term ends (48 real days by default): about 18,000 NPC tenures end and restart in one transaction, writing ~36,000 audit rows. Measured at ~1.6 s on PGlite; not measured on a real Postgres server.
- **Eligibility is checked and shown, not enforced.** `GET /api/seats/:id/eligibility` explains which rules a player fails, but there is no candidacy yet (P5-T05), so nothing gates on it. Term limits are the exception: `takeSeat` refuses an election win past the limit.
- **Eligibility rules are game choices.** Minimum ages roughly follow the current constitution (35 for President, Governor and Senate; 25 for Reps); LG and ward ages vary by state law and are invented. "Prior office" requirements (President needs Governor/Deputy/Senate/Reps/VP experience; Governor needs any elected office) are game design, not law.
- **Term counting is simplified.** Every tenure counts as one term, including a remainder served after succession. Governor terms are counted across all states, not per state.
- **The chief of staff has nothing to do yet** (P4-T08 `[~]`). A holder can name one and the seat shows who is acting while they are on autopilot, but there are no office actions to delegate until Phase 7.
- **Deputies are always appointed NPCs.** When a deputy steps up, or a deputy seat falls vacant, a new NPC deputy of the principal's party is appointed automatically. Players cannot choose a deputy yet (running mates come in P5-T23).
- **Activity means signed-in HTTP requests.** Socket.IO traffic (for example, chatting) does not mark a player active. Each signed-in request runs one conditional `UPDATE characters ... WHERE last_active_at < now() - 1 minute`, so most requests write nothing, but the query still runs on every request.
- **Inactivity and term expiry run in the in-process scheduler**, with the same caveats as the world tick (one process; no BullMQ).
- **NPC decisions are basic.** NPC governors set their state's security policy and an NPC President sets corruption and spending; these feed the monthly tick. LG chairmen may "commission a project" or "divert funds", but that only produces a headline and an `npc_decisions` row: there are no LGA metrics for it to change, and diverted money goes nowhere. Legislators make no decisions. Player-held governor and president offices use neutral policy until players get levers (Phase 7).
- **Office salaries are invented numbers** (₦60,000 to ₦3.5m a month in `config/game.json`).
- **The map is a tile cartogram**, one square per state roughly placed, not real borders. The LGA grid is in data order (roughly alphabetical), not geographic. Neither has been looked at in a real browser; the web tests run in jsdom.
- **`GET /api/map/country` is uncached** and aggregates every active tenure on each call.
- **Seat history shows a party only for NPCs.** A player's party at the time of their tenure is not recorded.

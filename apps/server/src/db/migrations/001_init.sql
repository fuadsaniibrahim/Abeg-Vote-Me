-- 001_init: accounts, world geography, parties, characters, NPCs, seats, audit log, world state.

-- ============ Accounts ============
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  -- lower-cased, trimmed; one account per address
  email_normalized text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  banned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Outgoing email queue. The dev mailer only writes here; a real SMTP sender is a known gap.
CREATE TABLE outbox_emails (
  id bigserial PRIMARY KEY,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- ============ Geography ============
CREATE TABLE states (
  code text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  capital text NOT NULL,
  zone text NOT NULL CHECK (zone IN ('NC', 'NE', 'NW', 'SE', 'SS', 'SW')),
  is_fct boolean NOT NULL DEFAULT false,
  -- UnitProfile from the engine: population, wealth, insecurity, issues, leanings, blocs
  profile jsonb NOT NULL
);

CREATE TABLE lgas (
  id text PRIMARY KEY,
  state_code text NOT NULL REFERENCES states(code),
  name text NOT NULL,
  is_capital boolean NOT NULL DEFAULT false,
  profile jsonb NOT NULL,
  UNIQUE (state_code, name)
);

CREATE TABLE senatorial_districts (
  id text PRIMARY KEY,
  state_code text NOT NULL REFERENCES states(code),
  name text NOT NULL,
  profile jsonb NOT NULL
);

CREATE TABLE district_lgas (
  district_id text NOT NULL REFERENCES senatorial_districts(id),
  -- an LGA belongs to exactly one senatorial district
  lga_id text NOT NULL UNIQUE REFERENCES lgas(id),
  PRIMARY KEY (district_id, lga_id)
);

CREATE TABLE federal_constituencies (
  id text PRIMARY KEY,
  state_code text NOT NULL REFERENCES states(code),
  name text NOT NULL,
  profile jsonb NOT NULL
);

CREATE TABLE constituency_lgas (
  constituency_id text NOT NULL REFERENCES federal_constituencies(id),
  lga_id text NOT NULL REFERENCES lgas(id),
  -- fraction of the LGA in this constituency (LGAs split into I/II have 0.5 each)
  share numeric NOT NULL CHECK (share > 0 AND share <= 1),
  PRIMARY KEY (constituency_id, lga_id)
);

-- ============ Parties ============
CREATE TABLE parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  slogan text NOT NULL DEFAULT '',
  color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  ideology text NOT NULL,
  is_independent boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  founded_by uuid,
  treasury bigint NOT NULL DEFAULT 0 CHECK (treasury >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Characters and NPCs ============
CREATE TABLE characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- one character per account
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  age int NOT NULL CHECK (age BETWEEN 25 AND 120),
  home_state_code text NOT NULL REFERENCES states(code),
  home_lga_id text NOT NULL REFERENCES lgas(id),
  background text NOT NULL,
  traits text[] NOT NULL,
  stats jsonb NOT NULL,
  -- personal wealth and campaign war chest are separate balances (naira)
  wallet bigint NOT NULL DEFAULT 0 CHECK (wallet >= 0),
  war_chest bigint NOT NULL DEFAULT 0 CHECK (war_chest >= 0),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE parties ADD CONSTRAINT parties_founded_by_fk FOREIGN KEY (founded_by) REFERENCES characters(id);

CREATE TABLE party_memberships (
  id bigserial PRIMARY KEY,
  party_id uuid NOT NULL REFERENCES parties(id),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);
-- a character is a current member of at most one party
CREATE UNIQUE INDEX party_memberships_one_active ON party_memberships(character_id) WHERE left_at IS NULL;

CREATE TABLE npcs (
  id text PRIMARY KEY,
  name text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female')),
  age int NOT NULL,
  state_code text NOT NULL REFERENCES states(code),
  party_id uuid REFERENCES parties(id),
  personality jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Seats ============
CREATE TABLE seats (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('PRESIDENT', 'VICE_PRESIDENT', 'GOVERNOR', 'DEPUTY_GOVERNOR', 'SENATOR', 'REP', 'LG_CHAIRMAN')),
  name text NOT NULL,
  state_code text REFERENCES states(code),
  district_id text REFERENCES senatorial_districts(id),
  constituency_id text REFERENCES federal_constituencies(id),
  lga_id text REFERENCES lgas(id)
);
CREATE INDEX seats_kind_state_idx ON seats(kind, state_code);

-- Every holding of a seat. The active holder is the row with ended_at IS NULL.
CREATE TABLE seat_tenures (
  id bigserial PRIMARY KEY,
  seat_id text NOT NULL REFERENCES seats(id),
  holder_type text NOT NULL CHECK (holder_type IN ('npc', 'player')),
  character_id uuid REFERENCES characters(id),
  npc_id text REFERENCES npcs(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  CHECK (
    (holder_type = 'npc' AND npc_id IS NOT NULL AND character_id IS NULL) OR
    (holder_type = 'player' AND character_id IS NOT NULL AND npc_id IS NULL)
  ),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
-- ONE SEAT, ONE HOLDER: at most one active tenure per seat
CREATE UNIQUE INDEX seat_tenures_one_active_per_seat ON seat_tenures(seat_id) WHERE ended_at IS NULL;
-- a player character or NPC holds at most one seat at a time
CREATE UNIQUE INDEX seat_tenures_one_active_per_character ON seat_tenures(character_id) WHERE ended_at IS NULL AND character_id IS NOT NULL;
CREATE UNIQUE INDEX seat_tenures_one_active_per_npc ON seat_tenures(npc_id) WHERE ended_at IS NULL AND npc_id IS NOT NULL;

-- ============ Audit log (append-only) ============
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_character_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text
);
CREATE INDEX audit_log_action_idx ON audit_log(action, at);
CREATE INDEX audit_log_actor_idx ON audit_log(actor_user_id, at);

CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- ============ World state ============
CREATE TABLE world_state (
  id int PRIMARY KEY CHECK (id = 1),
  seed text NOT NULL,
  -- real time at which in-game time started
  clock_epoch timestamptz NOT NULL DEFAULT now(),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  economy jsonb NOT NULL DEFAULT '{}'::jsonb,
  seeded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

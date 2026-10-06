-- 003_seats: wards and ward seats, terms, autopilot, chief of staff, scheduled elections, NPC decisions,
-- and an audit trigger that records every tenure change.

-- ============ Wards ============
CREATE TABLE wards (
  id text PRIMARY KEY,
  lga_id text NOT NULL REFERENCES lgas(id),
  state_code text NOT NULL REFERENCES states(code),
  number int NOT NULL CHECK (number > 0),
  name text NOT NULL,
  UNIQUE (lga_id, number)
);

ALTER TABLE seats DROP CONSTRAINT seats_kind_check;
ALTER TABLE seats ADD CONSTRAINT seats_kind_check
  CHECK (kind IN ('PRESIDENT', 'VICE_PRESIDENT', 'GOVERNOR', 'DEPUTY_GOVERNOR', 'SENATOR', 'REP', 'LG_CHAIRMAN', 'COUNCILLOR', 'WARD_CHAIRMAN'));
ALTER TABLE seats ADD COLUMN ward_id text REFERENCES wards(id);
CREATE INDEX seats_lga_idx ON seats(lga_id);
CREATE INDEX seats_ward_idx ON seats(ward_id);

-- ============ Tenures ============
ALTER TABLE seat_tenures
  -- how the holder got the seat: seeded | election | by_election | succession | appointed | npc_returned | npc_replaced | takeover
  ADD COLUMN start_reason text NOT NULL DEFAULT 'seeded',
  -- when the current term ends (real time). A holder past this date is "holding over" until a successor takes the seat.
  ADD COLUMN term_ends_at timestamptz,
  -- set while the (player) holder is inactive; cleared when they come back
  ADD COLUMN autopilot_since timestamptz,
  -- player named to act for the holder while they are offline
  ADD COLUMN chief_of_staff_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD CONSTRAINT seat_tenures_cos_not_self CHECK (chief_of_staff_id IS NULL OR chief_of_staff_id <> character_id);
CREATE INDEX seat_tenures_seat_history_idx ON seat_tenures(seat_id, started_at DESC, id DESC);
CREATE INDEX seat_tenures_character_idx ON seat_tenures(character_id) WHERE character_id IS NOT NULL;
CREATE INDEX seat_tenures_npc_idx ON seat_tenures(npc_id) WHERE npc_id IS NOT NULL;
CREATE INDEX seat_tenures_term_idx ON seat_tenures(term_ends_at) WHERE ended_at IS NULL;

-- ============ Elections scheduled by vacancies and expired terms (run by Phase 5) ============
CREATE TABLE scheduled_elections (
  id bigserial PRIMARY KEY,
  seat_id text NOT NULL REFERENCES seats(id),
  kind text NOT NULL CHECK (kind IN ('by_election', 'general')),
  reason text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
-- at most one open election per seat
CREATE UNIQUE INDEX scheduled_elections_one_open ON scheduled_elections(seat_id) WHERE status = 'scheduled';

-- ============ NPC office-holder decisions (one row per notable decision per turn) ============
CREATE TABLE npc_decisions (
  id bigserial PRIMARY KEY,
  turn int NOT NULL,
  npc_id text NOT NULL REFERENCES npcs(id),
  seat_id text NOT NULL REFERENCES seats(id),
  decision text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turn, seat_id)
);

-- ============ Audit every tenure change ============
-- Actor comes from transaction-local settings (set_config('avm.actor_user_id', ..., true)) when the app sets them.
-- Seeded placeholder tenures are not audited one by one (world.seeded covers them).
CREATE FUNCTION seat_tenure_audit() RETURNS trigger AS $$
DECLARE
  actor_user uuid := nullif(current_setting('avm.actor_user_id', true), '')::uuid;
  actor_char uuid := nullif(current_setting('avm.actor_character_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.start_reason = 'seeded' THEN
      RETURN NEW;
    END IF;
    INSERT INTO audit_log (action, actor_user_id, actor_character_id, target_type, target_id, details)
    VALUES ('tenure.start', actor_user, actor_char, 'seat', NEW.seat_id, jsonb_build_object(
      'tenureId', NEW.id, 'holderType', NEW.holder_type, 'characterId', NEW.character_id, 'npcId', NEW.npc_id,
      'reason', NEW.start_reason, 'termEndsAt', NEW.term_ends_at));
  ELSIF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
    INSERT INTO audit_log (action, actor_user_id, actor_character_id, target_type, target_id, details)
    VALUES ('tenure.end', actor_user, actor_char, 'seat', NEW.seat_id, jsonb_build_object(
      'tenureId', NEW.id, 'holderType', NEW.holder_type, 'characterId', NEW.character_id, 'npcId', NEW.npc_id,
      'reason', NEW.end_reason));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER seat_tenures_audit
  AFTER INSERT OR UPDATE ON seat_tenures
  FOR EACH ROW EXECUTE FUNCTION seat_tenure_audit();

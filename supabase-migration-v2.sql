-- ============================================================
-- FarmCore FMIS — Schema migration v1 → v2
-- Run the WHOLE file in Supabase Dashboard → SQL Editor.
--
-- Idempotent: safe to run more than once.
-- Non-destructive: no DROP TABLE, no data loss.
--
-- What this fixes
--   1. Sync columns (deleted_at / updated_at / sync_status) missing on
--      many tables, which made incremental pull error out on them.
--   2. updated_at triggers missing on 9 tables — their rows silently
--      never appeared in an incremental pull.
--   3. Seven tables that exist on the device but had no cloud table at
--      all, so that data could never leave the phone.
--   4. Schema drift: columns the app already writes but that were never
--      created (profiles.email, farm_users.user_code/is_active/status).
--   5. create_farm_with_license() — called by the app, never defined.
--   6. RLS: every farm member, including 'viewer', had full write access
--      to payroll and finance. Now role-aware.
--   7. Indexes on (farm_id, updated_at) — without them, incremental pull
--      does a sequential scan of the whole table on every 60s tick.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ════════════════════════════════════════════════════════════
-- 0. ENUMS (idempotent guards — v1 may already have created them)
-- ════════════════════════════════════════════════════════════
-- Note: sync_status is a purely client-side concept. The sync engine
-- strips it before pushing, so the server copy only ever holds the
-- default. We create the type if it is missing (fresh projects) but
-- deliberately do NOT ALTER it — that would need to run outside this
-- transaction, and nothing here depends on the extra member.
DO $$ BEGIN CREATE TYPE sync_status AS ENUM ('synced','pending','conflict');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('owner','admin','manager','worker','vet','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════
-- 1. MISSING TABLES
--    These exist in the device database but had no cloud counterpart,
--    so pens, feed logs, formulas, invoices, fuel and agrochemical
--    records were stranded on whichever handset created them.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  species     TEXT,
  capacity    INTEGER,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS shearing_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  weight      NUMERIC(8,2),
  unit        TEXT DEFAULT 'kg',
  grade       TEXT,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS feed_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  feed_id     UUID,
  date        DATE NOT NULL,
  quantity    NUMERIC(10,2),
  unit        TEXT DEFAULT 'kg',
  species     TEXT,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS feed_formulas (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  species     TEXT,
  ingredients JSONB DEFAULT '[]',
  cost_per_kg NUMERIC(10,2),
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invoices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  buyer_id    UUID,
  buyer_name  TEXT,
  date        DATE NOT NULL,
  due_date    DATE,
  items       JSONB DEFAULT '[]',
  total       NUMERIC(12,2),
  amount_paid NUMERIC(12,2) DEFAULT 0,
  status      TEXT DEFAULT 'unpaid',
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fuel_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  asset_id    UUID REFERENCES assets(id),
  date        DATE NOT NULL,
  litres      NUMERIC(8,2),
  cost        NUMERIC(10,2),
  odometer    NUMERIC(10,1),
  operator    TEXT,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agrochemicals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  plot_id       UUID REFERENCES plots(id),
  date          DATE NOT NULL,
  product       TEXT,
  category      TEXT,
  rate          NUMERIC(10,2),
  unit          TEXT,
  cost          NUMERIC(10,2),
  applied_by    TEXT,
  phi_days      INTEGER DEFAULT 0,   -- pre-harvest interval
  safe_harvest  DATE,
  notes         TEXT,
  sync_status   sync_status DEFAULT 'synced',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- Custom per-farm roles. Team Management reads and writes farm_roles in
-- four places, but the table was never created — the "custom roles" tab
-- failed with "relation does not exist" on every farm.
CREATE TABLE IF NOT EXISTS farm_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '[]',
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(farm_id, name)          -- the UI already reports a duplicate-name error
);

-- (RLS policies and the updated_at trigger for farm_roles are applied in
--  sections 4 and 6, once the helper functions exist.)

-- ════════════════════════════════════════════════════════════
-- 2. SCHEMA DRIFT — columns the app already writes
-- ════════════════════════════════════════════════════════════

-- api/create-user.js queries profiles.email and upserts it.
ALTER TABLE profiles    ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email ON profiles(LOWER(email)) WHERE email IS NOT NULL;

-- api/create-user.js inserts these three into farm_users.
ALTER TABLE farm_users  ADD COLUMN IF NOT EXISTS user_code TEXT;
ALTER TABLE farm_users  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE farm_users  ADD COLUMN IF NOT EXISTS status    TEXT DEFAULT 'active';

-- animals.pen_id — the device indexes penId; only free-text `pen` existed.
ALTER TABLE animals     ADD COLUMN IF NOT EXISTS pen_id UUID REFERENCES pens(id);

-- ════════════════════════════════════════════════════════════
-- 3. SYNC COLUMNS ON EVERY SYNCED TABLE
--    attendance, lab_tests, notifications and calendar_events had no
--    updated_at at all, so `.gt('updated_at', …)` threw 42703 and those
--    four tables NEVER incrementally synced.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'animals','pens','milk_logs','egg_logs','weight_logs','shearing_logs',
    'treatments','vaccinations','mortality','lab_tests','heat_logs',
    'breeding_logs','pregnancy_checks','births','feed_inventory','feed_logs',
    'feed_formulas','transactions','invoices','employees','attendance',
    'tasks','payroll','suppliers','purchase_orders','grns','assets',
    'maintenance','fuel_logs','plots','crop_plans','harvests','agrochemicals',
    'notifications','calendar_events','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sync_status sync_status DEFAULT ''synced''', t);
    -- Backfill so pre-existing rows are visible to the first pull.
    EXECUTE format('UPDATE %I SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL', t);
  END LOOP;
END $$;

-- audit_log used `table_name`; the device calls it tableName → table_name. OK.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- ════════════════════════════════════════════════════════════
-- 4. updated_at TRIGGERS ON EVERY SYNCED TABLE
--    v1 applied these to only 23 tables. mortality, heat_logs, births
--    and grns HAD an updated_at column but no trigger, so editing one
--    of those rows never bumped the timestamp and the change was
--    invisible to every other device — forever.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'farms','profiles','licenses','animals','pens','milk_logs','egg_logs',
    'weight_logs','shearing_logs','treatments','vaccinations','mortality',
    'lab_tests','heat_logs','breeding_logs','pregnancy_checks','births',
    'feed_inventory','feed_logs','feed_formulas','transactions','invoices',
    'employees','attendance','tasks','payroll','suppliers','purchase_orders',
    'grns','assets','maintenance','fuel_logs','plots','crop_plans','harvests',
    'agrochemicals','notifications','calendar_events','audit_log','farm_roles'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_%s_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER set_%s_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- 5. INDEXES FOR INCREMENTAL PULL
--    Every sync tick runs `WHERE farm_id = $1 AND updated_at > $2
--    ORDER BY updated_at`. Without a matching index that is a full scan
--    per table per device per minute.
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'animals','pens','milk_logs','egg_logs','weight_logs','shearing_logs',
    'treatments','vaccinations','mortality','lab_tests','heat_logs',
    'breeding_logs','pregnancy_checks','births','feed_inventory','feed_logs',
    'feed_formulas','transactions','invoices','employees','attendance',
    'tasks','payroll','suppliers','purchase_orders','grns','assets',
    'maintenance','fuel_logs','plots','crop_plans','harvests','agrochemicals',
    'notifications','calendar_events','audit_log'
  ] LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_sync ON %I (farm_id, updated_at)', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- 6. ROLE-AWARE RLS
--    v1 gave every farm member FOR ALL access to every table. A 'viewer'
--    or a seasonal 'worker' could read and rewrite payroll, salaries and
--    the whole finance ledger. Split into three tiers.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_farm_ids()
RETURNS SETOF UUID AS $$
  SELECT farm_id FROM farm_users WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_super_admin FROM profiles WHERE id = auth.uid()), FALSE);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Can this user see the farm at all?
CREATE OR REPLACE FUNCTION can_read_farm(f UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM farm_users WHERE farm_id = f AND user_id = auth.uid())
      OR is_super_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Operational write access — everyone except 'viewer'.
CREATE OR REPLACE FUNCTION can_write_farm(f UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_users
    WHERE farm_id = f AND user_id = auth.uid()
      AND role IN ('owner','admin','manager','worker','vet')
  ) OR is_super_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Money and staff records — management only.
CREATE OR REPLACE FUNCTION can_manage_farm(f UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM farm_users
    WHERE farm_id = f AND user_id = auth.uid()
      AND role IN ('owner','admin','manager')
  ) OR is_super_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable RLS everywhere (new tables included).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'farms','profiles','farm_users','animals','pens','milk_logs','egg_logs',
    'weight_logs','shearing_logs','treatments','vaccinations','mortality',
    'lab_tests','heat_logs','breeding_logs','pregnancy_checks','births',
    'feed_inventory','feed_logs','feed_formulas','transactions','invoices',
    'employees','attendance','tasks','payroll','suppliers','purchase_orders',
    'grns','assets','maintenance','fuel_logs','plots','crop_plans','harvests',
    'agrochemicals','notifications','calendar_events','audit_log','farm_roles'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- farm_roles — members read, management writes.
DROP POLICY IF EXISTS "farm_roles_read"  ON farm_roles;
DROP POLICY IF EXISTS "farm_roles_write" ON farm_roles;
CREATE POLICY "farm_roles_read"  ON farm_roles FOR SELECT USING (can_read_farm(farm_id));
CREATE POLICY "farm_roles_write" ON farm_roles FOR ALL
  USING (can_manage_farm(farm_id)) WITH CHECK (can_manage_farm(farm_id));

-- Operational tables — any non-viewer member may write.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'animals','pens','milk_logs','egg_logs','weight_logs','shearing_logs',
    'treatments','vaccinations','mortality','lab_tests','heat_logs',
    'breeding_logs','pregnancy_checks','births','feed_inventory','feed_logs',
    'feed_formulas','tasks','suppliers','purchase_orders','grns','assets',
    'maintenance','fuel_logs','plots','crop_plans','harvests','agrochemicals',
    'notifications','calendar_events'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_farm_access" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_read"  ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write" ON %I', t, t);

    EXECUTE format(
      'CREATE POLICY "%s_read" ON %I FOR SELECT USING (can_read_farm(farm_id))', t, t);
    -- WITH CHECK is what actually stops a member writing a row tagged
    -- with somebody else''s farm_id. v1 omitted it.
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL
       USING (can_write_farm(farm_id)) WITH CHECK (can_write_farm(farm_id))', t, t);
  END LOOP;
END $$;

-- Financial / HR tables — management only.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions','invoices','employees','attendance','payroll'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_farm_access" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_read"  ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write" ON %I', t, t);

    EXECUTE format(
      'CREATE POLICY "%s_read" ON %I FOR SELECT USING (can_manage_farm(farm_id))', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_write" ON %I FOR ALL
       USING (can_manage_farm(farm_id)) WITH CHECK (can_manage_farm(farm_id))', t, t);
  END LOOP;
END $$;

-- Audit log — append-only. Nobody edits history.
DROP POLICY IF EXISTS "audit_log_farm_access" ON audit_log;
DROP POLICY IF EXISTS "audit_log_read"   ON audit_log;
DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_read"   ON audit_log FOR SELECT USING (can_manage_farm(farm_id));
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT WITH CHECK (can_read_farm(farm_id));

-- farms — members read, owners/admins update.
DROP POLICY IF EXISTS "Farm owners can update their farm" ON farms;
DROP POLICY IF EXISTS "farms_update" ON farms;
CREATE POLICY "farms_update" ON farms FOR UPDATE
  USING (can_manage_farm(id)) WITH CHECK (can_manage_farm(id));

-- ════════════════════════════════════════════════════════════
-- 7. create_farm_with_license()
--    AuthContext.createFarm() calls this RPC. It was never defined, so
--    farm creation failed with "function does not exist" — which is why
--    the wizard is currently parked behind a feature flag.
--
--    SECURITY DEFINER so the three inserts (farm, membership, license)
--    happen atomically without tripping the very RLS policies the new
--    farm does not yet have a membership row for.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_farm_with_license(
  p_farm_name TEXT,
  p_country   TEXT DEFAULT 'Kenya',
  p_county    TEXT DEFAULT NULL,
  p_currency  TEXT DEFAULT 'KES',
  p_species   JSONB DEFAULT '["cattle","pigs","goats","sheep","poultry"]'
)
RETURNS JSON AS $$
DECLARE
  v_user UUID := auth.uid();
  v_farm UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_farm_name IS NULL OR btrim(p_farm_name) = '' THEN
    RAISE EXCEPTION 'Farm name is required';
  END IF;

  INSERT INTO farms (name, country, county, currency, active_species)
  VALUES (btrim(p_farm_name), COALESCE(p_country,'Kenya'), p_county,
          COALESCE(p_currency,'KES'), COALESCE(p_species,'["cattle"]'::jsonb))
  RETURNING id INTO v_farm;

  INSERT INTO farm_users (farm_id, user_id, role, is_active, status)
  VALUES (v_farm, v_user, 'owner', TRUE, 'active');

  -- Licensing is disabled in the app, but the table is NOT NULL-linked
  -- to farms, so seed a permanently-active row to keep it consistent.
  INSERT INTO licenses (farm_id, tier, status, animal_limit, user_limit)
  VALUES (v_farm, 'enterprise', 'active', 2147483647, 2147483647)
  ON CONFLICT (farm_id) DO NOTHING;

  RETURN json_build_object('farm_id', v_farm);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_farm_with_license(TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_farm_with_license(TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated;

-- ════════════════════════════════════════════════════════════
-- 8. TOMBSTONE REAPING
--    Soft-deleted rows are kept long enough for every device to see the
--    deletion, then removed for good. Schedule with pg_cron if enabled:
--      SELECT cron.schedule('reap', '0 3 * * *', 'SELECT reap_tombstones()');
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reap_tombstones(p_older_than INTERVAL DEFAULT '90 days')
RETURNS INTEGER AS $$
DECLARE t TEXT; n INTEGER := 0; c INTEGER;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'animals','pens','milk_logs','egg_logs','weight_logs','shearing_logs',
    'treatments','vaccinations','mortality','lab_tests','heat_logs',
    'breeding_logs','pregnancy_checks','births','feed_inventory','feed_logs',
    'feed_formulas','transactions','invoices','employees','attendance',
    'tasks','payroll','suppliers','purchase_orders','grns','assets',
    'maintenance','fuel_logs','plots','crop_plans','harvests','agrochemicals',
    'notifications','calendar_events'
  ] LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - $1', t)
      USING p_older_than;
    GET DIAGNOSTICS c = ROW_COUNT;
    n := n + c;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════
-- POST-MIGRATION CHECK — every synced table should report 't'
-- ════════════════════════════════════════════════════════════
-- SELECT table_name,
--        bool_and(column_name = ANY(ARRAY['updated_at','deleted_at'])) FILTER (
--          WHERE column_name IN ('updated_at','deleted_at')) AS has_sync_cols
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
-- GROUP BY table_name ORDER BY table_name;

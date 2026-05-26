-- ============================================================
-- FarmCore FMIS — Supabase Schema v1.0
-- Run this entire file in Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── ENUMS ────────────────────────────────────────────────────
CREATE TYPE license_tier   AS ENUM ('trial','starter','professional','enterprise');
CREATE TYPE license_status AS ENUM ('active','expired','suspended','cancelled');
CREATE TYPE sync_status    AS ENUM ('synced','pending','conflict');
CREATE TYPE user_role      AS ENUM ('owner','admin','manager','worker','vet','viewer');

-- ── FARMS ────────────────────────────────────────────────────
CREATE TABLE farms (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  country       TEXT DEFAULT 'Kenya',
  county        TEXT,
  currency      TEXT DEFAULT 'KES',
  language      TEXT DEFAULT 'en',
  active_species JSONB DEFAULT '["cattle","pigs","goats","sheep","poultry"]',
  timezone      TEXT DEFAULT 'Africa/Nairobi',
  logo_url      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROFILES (extends Supabase auth.users) ───────────────────
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  is_super_admin BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── FARM USERS (junction — multi-user per farm) ──────────────
CREATE TABLE farm_users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       user_role DEFAULT 'worker',
  invited_by UUID REFERENCES auth.users(id),
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(farm_id, user_id)
);

-- ── LICENSES ─────────────────────────────────────────────────
CREATE TABLE licenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id         UUID NOT NULL UNIQUE REFERENCES farms(id) ON DELETE CASCADE,
  tier            license_tier DEFAULT 'trial',
  status          license_status DEFAULT 'active',
  animal_limit    INTEGER DEFAULT 50,
  user_limit      INTEGER DEFAULT 2,
  trial_ends_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  amount_kes      INTEGER DEFAULT 0,
  billing_cycle   TEXT DEFAULT 'monthly',
  activated_by    UUID REFERENCES auth.users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── LICENSE EVENTS (audit log) ───────────────────────────────
CREATE TABLE license_events (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id    UUID NOT NULL REFERENCES farms(id),
  event_type TEXT NOT NULL, -- 'trial_start','activated','renewed','suspended','cancelled','upgraded'
  old_tier   license_tier,
  new_tier   license_tier,
  amount_kes INTEGER,
  notes      TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── ANIMALS ──────────────────────────────────────────────────
CREATE TABLE animals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  local_id    INTEGER, -- Dexie local ID for sync reference
  species     TEXT NOT NULL,
  name        TEXT NOT NULL,
  tag         TEXT NOT NULL,
  breed       TEXT,
  color       TEXT,
  sex         CHAR(1) DEFAULT 'F',
  dob         DATE,
  stage       TEXT,
  pen         TEXT,
  origin      TEXT DEFAULT 'purchased',
  dam         TEXT,
  sire        TEXT,
  milk_lock   BOOLEAN DEFAULT FALSE,
  lock_expiry DATE,
  lock_reason TEXT,
  notes       TEXT,
  status      TEXT DEFAULT 'active',
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(farm_id, tag)
);

-- ── MILK LOGS ─────────────────────────────────────────────────
CREATE TABLE milk_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  shift       TEXT,
  amount      NUMERIC(8,2),
  unit        TEXT DEFAULT 'liters',
  status      TEXT DEFAULT 'Sold',
  fat         NUMERIC(4,2),
  protein     NUMERIC(4,2),
  scc         INTEGER,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── EGG LOGS ─────────────────────────────────────────────────
CREATE TABLE egg_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id    UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  total       INTEGER,
  cracked     INTEGER DEFAULT 0,
  grade_a     INTEGER DEFAULT 0,
  grade_b     INTEGER DEFAULT 0,
  feed_intake NUMERIC(8,2),
  feed_unit   TEXT DEFAULT 'kg',
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── WEIGHT LOGS ──────────────────────────────────────────────
CREATE TABLE weight_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  weight      NUMERIC(8,2),
  unit        TEXT DEFAULT 'kg',
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── TREATMENTS ───────────────────────────────────────────────
CREATE TABLE treatments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id     UUID REFERENCES animals(id),
  date          DATE NOT NULL,
  diagnosis     TEXT,
  symptoms      TEXT,
  vet           TEXT,
  treatment     TEXT,
  cost          NUMERIC(10,2),
  withdrawal    INTEGER DEFAULT 0,
  withdrawal_end DATE,
  status        TEXT DEFAULT 'Active',
  notes         TEXT,
  sync_status   sync_status DEFAULT 'synced',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── VACCINATIONS ─────────────────────────────────────────────
CREATE TABLE vaccinations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  vaccine     TEXT,
  batch_no    TEXT,
  dose        TEXT,
  vet         TEXT,
  next_due    DATE,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── MORTALITY ────────────────────────────────────────────────
CREATE TABLE mortality (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  cause       TEXT,
  disposal    TEXT,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── HEAT LOGS ────────────────────────────────────────────────
CREATE TABLE heat_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  signs       JSONB DEFAULT '[]',
  intensity   TEXT,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── BREEDING LOGS ────────────────────────────────────────────
CREATE TABLE breeding_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  method      TEXT DEFAULT 'AI',
  sire_id     TEXT,
  straw_batch TEXT,
  technician  TEXT,
  cost        NUMERIC(10,2),
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PREGNANCY CHECKS ─────────────────────────────────────────
CREATE TABLE pregnancy_checks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id      UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id    UUID REFERENCES animals(id),
  date         DATE NOT NULL,
  result       TEXT,
  method       TEXT,
  vet          TEXT,
  expected_due DATE,
  notes        TEXT,
  sync_status  sync_status DEFAULT 'synced',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── BIRTHS ───────────────────────────────────────────────────
CREATE TABLE births (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  dam_id      UUID REFERENCES animals(id),
  date        DATE NOT NULL,
  calves      JSONB DEFAULT '[]',
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── FEED INVENTORY ───────────────────────────────────────────
CREATE TABLE feed_inventory (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id        UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  feed_type      TEXT NOT NULL,
  supplier       TEXT,
  quantity       NUMERIC(10,2),
  unit           TEXT DEFAULT 'kg',
  min_stock      NUMERIC(10,2),
  cost_per_unit  NUMERIC(10,2),
  species        TEXT,
  last_restocked DATE,
  sync_status    sync_status DEFAULT 'synced',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── TRANSACTIONS ─────────────────────────────────────────────
CREATE TABLE transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id        UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  type           TEXT NOT NULL, -- 'income' | 'expense'
  date           DATE NOT NULL,
  category       TEXT,
  description    TEXT,
  species        TEXT,
  amount         NUMERIC(12,2),
  payment_method TEXT,
  sync_status    sync_status DEFAULT 'synced',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── EMPLOYEES ────────────────────────────────────────────────
CREATE TABLE employees (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT,
  phone       TEXT,
  national_id TEXT,
  hire_date   DATE,
  section     TEXT,
  salary      NUMERIC(10,2),
  status      TEXT DEFAULT 'active',
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ATTENDANCE ───────────────────────────────────────────────
CREATE TABLE attendance (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  date        DATE NOT NULL,
  clock_in    TEXT,
  clock_out   TEXT,
  status      TEXT DEFAULT 'present',
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── TASKS ────────────────────────────────────────────────────
CREATE TABLE tasks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  assigned_to UUID REFERENCES employees(id),
  due_date    DATE,
  due_time    TEXT,
  priority    TEXT DEFAULT 'medium',
  status      TEXT DEFAULT 'pending',
  species     TEXT,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYROLL ──────────────────────────────────────────────────
CREATE TABLE payroll (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  month       TEXT NOT NULL,
  status      TEXT DEFAULT 'pending',
  paid_date   DATE,
  mpesa_ref   TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUPPLIERS ────────────────────────────────────────────────
CREATE TABLE suppliers (
  id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id  UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  contact  TEXT,
  location TEXT,
  terms    TEXT,
  mpesa    TEXT,
  rating   NUMERIC(3,1),
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PURCHASE ORDERS ──────────────────────────────────────────
CREATE TABLE purchase_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  supplier_id   UUID REFERENCES suppliers(id),
  po_number     TEXT,
  items         JSONB DEFAULT '[]',
  total_cost    NUMERIC(12,2),
  status        TEXT DEFAULT 'pending',
  raised_by     TEXT,
  date          DATE,
  delivery_date DATE,
  approved_by   TEXT,
  notes         TEXT,
  sync_status   sync_status DEFAULT 'synced',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── GRNS ─────────────────────────────────────────────────────
CREATE TABLE grns (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  po_id       UUID REFERENCES purchase_orders(id),
  date        DATE,
  received_by TEXT,
  items       JSONB DEFAULT '[]',
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ASSETS ───────────────────────────────────────────────────
CREATE TABLE assets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT,
  make          TEXT,
  serial        TEXT,
  purchase_date DATE,
  purchase_cost NUMERIC(12,2),
  condition     TEXT,
  next_service  DATE,
  status        TEXT DEFAULT 'active',
  sync_status   sync_status DEFAULT 'synced',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── MAINTENANCE ──────────────────────────────────────────────
CREATE TABLE maintenance (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id        UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  asset_id       UUID REFERENCES assets(id),
  date           DATE,
  work_done      TEXT,
  technician     TEXT,
  parts          TEXT,
  cost           NUMERIC(10,2),
  downtime_hours NUMERIC(5,1),
  sync_status    sync_status DEFAULT 'synced',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── PLOTS ────────────────────────────────────────────────────
CREATE TABLE plots (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  size        NUMERIC(8,2),
  unit        TEXT DEFAULT 'acres',
  gps         TEXT,
  soil_type   TEXT,
  current_use TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CROP PLANS ───────────────────────────────────────────────
CREATE TABLE crop_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id          UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  plot_id          UUID REFERENCES plots(id),
  crop_type        TEXT,
  variety          TEXT,
  planting_date    DATE,
  expected_harvest DATE,
  seed_rate        NUMERIC(8,2),
  seed_unit        TEXT,
  notes            TEXT,
  sync_status      sync_status DEFAULT 'synced',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── HARVESTS ─────────────────────────────────────────────────
CREATE TABLE harvests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id       UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  plot_id       UUID REFERENCES plots(id),
  date          DATE,
  crop          TEXT,
  quantity      NUMERIC(10,2),
  unit          TEXT,
  quality_grade TEXT,
  notes         TEXT,
  sync_status   sync_status DEFAULT 'synced',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── LAB TESTS ────────────────────────────────────────────────
CREATE TABLE lab_tests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  animal_id   UUID REFERENCES animals(id),
  test_type   TEXT,
  date        DATE,
  result      TEXT,
  notes       TEXT,
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS ────────────────────────────────────────────
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id    UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  type       TEXT,
  priority   TEXT DEFAULT 'info',
  title      TEXT,
  body       TEXT,
  read       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── CALENDAR EVENTS ──────────────────────────────────────────
CREATE TABLE calendar_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id     UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  type        TEXT,
  title       TEXT,
  species     TEXT,
  related_id  UUID,
  priority    TEXT DEFAULT 'info',
  sync_status sync_status DEFAULT 'synced',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_id    UUID REFERENCES farms(id),
  user_id    UUID REFERENCES auth.users(id),
  action     TEXT NOT NULL,
  table_name TEXT,
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════
CREATE INDEX idx_animals_farm           ON animals(farm_id);
CREATE INDEX idx_animals_species        ON animals(farm_id, species);
CREATE INDEX idx_milk_logs_farm_date    ON milk_logs(farm_id, date DESC);
CREATE INDEX idx_milk_logs_animal       ON milk_logs(animal_id);
CREATE INDEX idx_egg_logs_farm_date     ON egg_logs(farm_id, date DESC);
CREATE INDEX idx_treatments_farm        ON treatments(farm_id);
CREATE INDEX idx_treatments_animal      ON treatments(animal_id);
CREATE INDEX idx_vaccinations_farm      ON vaccinations(farm_id);
CREATE INDEX idx_transactions_farm_date ON transactions(farm_id, date DESC);
CREATE INDEX idx_employees_farm         ON employees(farm_id);
CREATE INDEX idx_attendance_farm_date   ON attendance(farm_id, date);
CREATE INDEX idx_notifications_farm     ON notifications(farm_id, read);
CREATE INDEX idx_calendar_farm_date     ON calendar_events(farm_id, date);
CREATE INDEX idx_farm_users_user        ON farm_users(user_id);
CREATE INDEX idx_farm_users_farm        ON farm_users(farm_id);
CREATE INDEX idx_licenses_farm          ON licenses(farm_id);

-- ════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER FUNCTION
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'farms','profiles','licenses','animals','milk_logs','egg_logs','weight_logs',
    'treatments','vaccinations','feed_inventory','transactions','employees',
    'tasks','payroll','suppliers','purchase_orders','assets','maintenance',
    'plots','crop_plans','harvests','breeding_logs','pregnancy_checks'
  ]
  LOOP
    EXECUTE format('
      CREATE TRIGGER set_%s_updated_at
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    ', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- AUTO-CREATE PROFILE ON SIGNUP
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════

-- Helper function: get user's farm IDs
CREATE OR REPLACE FUNCTION get_user_farm_ids()
RETURNS SETOF UUID AS $$
  SELECT farm_id FROM farm_users WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE farms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE animals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE egg_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccinations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mortality      ENABLE ROW LEVEL SECURITY;
ALTER TABLE heat_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE breeding_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pregnancy_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE births         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll        ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE grns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crop_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_tests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;

-- FARMS policies
CREATE POLICY "Farm members can view their farm"
  ON farms FOR SELECT USING (id IN (SELECT get_user_farm_ids()) OR is_super_admin());
CREATE POLICY "Farm owners can update their farm"
  ON farms FOR UPDATE USING (id IN (SELECT get_user_farm_ids()));
CREATE POLICY "Authenticated users can create farms"
  ON farms FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- PROFILES policies
CREATE POLICY "Users can view and edit own profile"
  ON profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT USING (is_super_admin());

-- FARM USERS policies
CREATE POLICY "Farm members can view farm users"
  ON farm_users FOR SELECT USING (farm_id IN (SELECT get_user_farm_ids()) OR is_super_admin());
CREATE POLICY "Farm admins can manage farm users"
  ON farm_users FOR ALL USING (
    farm_id IN (SELECT farm_id FROM farm_users WHERE user_id = auth.uid() AND role IN ('owner','admin'))
    OR is_super_admin()
  );

-- LICENSES — super admin manages, farm members can view
CREATE POLICY "Farm members can view license"
  ON licenses FOR SELECT USING (farm_id IN (SELECT get_user_farm_ids()) OR is_super_admin());
CREATE POLICY "Super admins can manage licenses"
  ON licenses FOR ALL USING (is_super_admin());
CREATE POLICY "System can insert license on farm creation"
  ON licenses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- LICENSE EVENTS
CREATE POLICY "Farm members view license events"
  ON license_events FOR SELECT USING (farm_id IN (SELECT get_user_farm_ids()) OR is_super_admin());
CREATE POLICY "Super admins manage license events"
  ON license_events FOR ALL USING (is_super_admin());

-- Generic farm data policy (applies to all data tables)
-- Farm members: full access to their farm data
-- Super admins: read all
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'animals','milk_logs','egg_logs','weight_logs','treatments','vaccinations',
    'mortality','heat_logs','breeding_logs','pregnancy_checks','births',
    'feed_inventory','transactions','employees','attendance','tasks','payroll',
    'suppliers','purchase_orders','grns','assets','maintenance','plots',
    'crop_plans','harvests','lab_tests','notifications','calendar_events','audit_log'
  ]
  LOOP
    EXECUTE format('
      CREATE POLICY "%s_farm_access"
      ON %s FOR ALL
      USING (farm_id IN (SELECT get_user_farm_ids()) OR is_super_admin());
    ', t, t);
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- ADMIN VIEWS (for super admin dashboard)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW admin_farms_overview AS
SELECT
  f.id,
  f.name,
  f.country,
  f.created_at,
  l.tier,
  l.status AS license_status,
  l.trial_ends_at,
  l.current_period_end,
  l.amount_kes,
  l.animal_limit,
  l.user_limit,
  COUNT(DISTINCT a.id) AS animal_count,
  COUNT(DISTINCT fu.user_id) AS user_count,
  MAX(ml.created_at) AS last_milk_log,
  MAX(t.created_at) AS last_transaction
FROM farms f
LEFT JOIN licenses l ON l.farm_id = f.id
LEFT JOIN animals a ON a.farm_id = f.id
LEFT JOIN farm_users fu ON fu.farm_id = f.id
LEFT JOIN milk_logs ml ON ml.farm_id = f.id
LEFT JOIN transactions t ON t.farm_id = f.id
GROUP BY f.id, f.name, f.country, f.created_at, l.tier, l.status, l.trial_ends_at, l.current_period_end, l.amount_kes, l.animal_limit, l.user_limit;

-- Grant super admins access to view
GRANT SELECT ON admin_farms_overview TO authenticated;

-- ════════════════════════════════════════════════════════════
-- SAMPLE: Set your account as super admin
-- Replace with your actual user UUID from auth.users table
-- ════════════════════════════════════════════════════════════
-- UPDATE profiles SET is_super_admin = TRUE WHERE id = 'YOUR-USER-UUID-HERE';

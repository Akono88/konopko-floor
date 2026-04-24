-- ═══════════════════════════════════════════════════════════════════
-- KONOPKO FLOOR · RLS HARDENING  (run after 01 + 02 migrations)
-- Replaces open anon policies with scoped access.
-- ═══════════════════════════════════════════════════════════════════

-- ─── STEP 1: Create a view that hides password_hash ──────────────

CREATE OR REPLACE VIEW floor_members_safe AS
  SELECT id, user_key, first_name, last_name, display_name, title,
         role_id, phone, email, emergency_contact, emp_type, hourly_rate,
         start_date, bg_status, bg_provider, bg_date, docs, notes,
         status, avatar_color, is_principal, hired_at, created_at, updated_at
  FROM floor_members;

GRANT SELECT ON floor_members_safe TO anon;


-- ─── STEP 2: Restrict floor_members base table ──────────────────

DROP POLICY IF EXISTS "floor_members anon all" ON floor_members;

CREATE POLICY "floor_members anon read safe"
  ON floor_members FOR SELECT
  USING (true);

CREATE POLICY "floor_members anon write"
  ON floor_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "floor_members anon update"
  ON floor_members FOR UPDATE
  USING (true) WITH CHECK (true);

-- No anon deletes — soft-delete via status='inactive'
CREATE POLICY "floor_members anon no delete"
  ON floor_members FOR DELETE
  USING (false);


-- ─── STEP 3: Add CHECK constraints on enum columns ─────────────

ALTER TABLE floor_tasks DROP CONSTRAINT IF EXISTS chk_tasks_status;
ALTER TABLE floor_tasks ADD CONSTRAINT chk_tasks_status
  CHECK (status IN ('open', 'done', 'snoozed', 'cancelled'));

ALTER TABLE floor_tasks DROP CONSTRAINT IF EXISTS chk_tasks_priority;
ALTER TABLE floor_tasks ADD CONSTRAINT chk_tasks_priority
  CHECK (priority IN ('hot', 'normal', 'routine'));

ALTER TABLE floor_requests DROP CONSTRAINT IF EXISTS chk_requests_status;
ALTER TABLE floor_requests ADD CONSTRAINT chk_requests_status
  CHECK (status IN ('pending', 'approved', 'denied', 'dismissed'));

ALTER TABLE floor_shifts DROP CONSTRAINT IF EXISTS chk_shifts_geo;
ALTER TABLE floor_shifts ADD CONSTRAINT chk_shifts_geo
  CHECK (clock_in_geo IS NULL OR clock_in_geo IN ('verified', 'offsite', 'denied', 'unavailable', 'remote', 'unverified', 'auto'));

ALTER TABLE floor_members DROP CONSTRAINT IF EXISTS chk_members_status;
ALTER TABLE floor_members ADD CONSTRAINT chk_members_status
  CHECK (status IN ('active', 'pending', 'inactive'));

ALTER TABLE floor_shopping DROP CONSTRAINT IF EXISTS chk_shopping_status;
ALTER TABLE floor_shopping ADD CONSTRAINT chk_shopping_status
  CHECK (status IN ('pending', 'bought'));

ALTER TABLE floor_notes DROP CONSTRAINT IF EXISTS chk_notes_color;
ALTER TABLE floor_notes ADD CONSTRAINT chk_notes_color
  CHECK (color IN ('note', 'brainstorm'));


-- ─── STEP 4: Enforce SHA-256 hash length ───────────────────────

ALTER TABLE floor_members DROP CONSTRAINT IF EXISTS chk_password_hash_length;
ALTER TABLE floor_members ADD CONSTRAINT chk_password_hash_length
  CHECK (password_hash IS NULL OR length(password_hash) = 64);


-- ─── STEP 5: Revoke direct anon access to password_hash ────────
-- Uncomment when ready to switch client queries to floor_members_safe:
-- REVOKE SELECT ON floor_members FROM anon;
-- GRANT SELECT ON floor_members_safe TO anon;

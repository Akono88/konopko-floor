-- ═══════════════════════════════════════════════════════════════════
-- KONOPKO FLOOR · MULTI-ASSIGN MIGRATION
-- Adds assignees[] column, backfills from metadata.assignees + assignee
-- ═══════════════════════════════════════════════════════════════════

-- 1. Add the column
ALTER TABLE floor_tasks
  ADD COLUMN IF NOT EXISTS assignees text[] DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_floor_tasks_assignees
  ON floor_tasks USING GIN (assignees);

-- 2. Backfill from metadata.assignees first, then single assignee column
UPDATE floor_tasks
SET assignees = CASE
  WHEN metadata->'assignees' IS NOT NULL
    AND jsonb_typeof(metadata->'assignees') = 'array'
    AND jsonb_array_length(metadata->'assignees') > 0
  THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'assignees'))

  WHEN assignee IS NOT NULL AND assignee != ''
  THEN ARRAY[assignee]

  ELSE ARRAY[]::text[]
END
WHERE assignees = ARRAY[]::text[] OR assignees IS NULL;

-- 3. Verify (uncomment to check):
-- SELECT id, title, assignee, metadata->'assignees' as meta_assignees, assignees
-- FROM floor_tasks LIMIT 20;

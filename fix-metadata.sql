-- Step 1: Check if metadata column exists
-- Run this query first to check the current state
SELECT
  column_name,
  data_type,
  column_default
FROM
  information_schema.columns
WHERE
  table_name = 'courses'
  AND column_name = 'metadata';

-- Step 2: Add metadata column if it doesn't exist
-- Run this if the above query returns no rows
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{"chapters": []}'::jsonb;

-- Step 3: Initialize metadata for existing courses where it's NULL
-- Run this to ensure all courses have valid metadata
UPDATE courses
SET metadata = '{"chapters": []}'::jsonb
WHERE metadata IS NULL;

-- Step 4: Verify the update
-- Run this to confirm all courses now have metadata
SELECT
  id,
  title,
  metadata,
  CASE
    WHEN metadata IS NULL THEN 'NULL'
    WHEN metadata::text = '{}' THEN 'Empty Object'
    WHEN metadata::text LIKE '%chapters%' THEN 'Has Chapters Array'
    ELSE 'Other'
  END as metadata_status
FROM courses
ORDER BY id;

-- Step 5: Test adding a chapter (optional)
-- Replace {course_id} with an actual course ID from your database
/*
UPDATE courses
SET metadata = jsonb_set(
  COALESCE(metadata, '{"chapters": []}'::jsonb),
  '{chapters}',
  COALESCE(metadata->'chapters', '[]'::jsonb) || '[{
    "id": "test-chapter-1",
    "title": "Test Chapter",
    "display_order": 0,
    "video_ids": []
  }]'::jsonb
)
WHERE id = {course_id};
*/
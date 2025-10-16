/*
  # Add Unique Constraint to live_locations.user_id

  ## Problem
  - The live_locations table was creating duplicate records for the same user
  - user_id column had no unique constraint
  - This caused multiple location entries for a single driver

  ## Changes
  1. Delete duplicate records, keeping only the most recent for each user
  2. Add UNIQUE constraint on user_id column
  
  ## Security
  - No security changes, only data integrity improvements
*/

-- First, delete duplicate records, keeping only the most recent one for each user_id
DELETE FROM live_locations a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM live_locations
  ORDER BY user_id, updated_at DESC
);

-- Add unique constraint on user_id
ALTER TABLE live_locations
ADD CONSTRAINT live_locations_user_id_unique UNIQUE (user_id);

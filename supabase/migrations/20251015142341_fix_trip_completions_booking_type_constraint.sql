/*
  # Fix Trip Completions Booking Type Constraint

  1. Changes
    - Remove restrictive CHECK constraint on booking_type to allow flexibility
    - Add a simple non-empty constraint instead

  2. Reason
    - Allow new booking types to be added without schema changes
    - Prevents insert failures due to unrecognized booking types
*/

-- Drop the old constraint if it exists
ALTER TABLE trip_completions 
DROP CONSTRAINT IF EXISTS trip_completions_booking_type_check;

-- Add a more flexible constraint
ALTER TABLE trip_completions
ADD CONSTRAINT trip_completions_booking_type_not_empty 
CHECK (length(trim(booking_type)) > 0);

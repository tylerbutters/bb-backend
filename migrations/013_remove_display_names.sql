ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_display_name_length_check;

ALTER TABLE users
DROP COLUMN IF EXISTS display_name;

ALTER TABLE signup_confirmation_codes
DROP COLUMN IF EXISTS display_name;

-- 004_username: sign in with a username; email becomes optional and is no longer needed to play.

ALTER TABLE users ADD COLUMN username text, ADD COLUMN username_normalized text;

-- Existing accounts get a username from their email's local part (allowed characters only, at most 14),
-- plus "_" and 5 characters of their id so it is unique. They can still log in with their email.
UPDATE users SET username = left(regexp_replace(split_part(email, '@', 1), '[^A-Za-z0-9_]', '', 'g'), 14) || '_' || left(replace(id::text, '-', ''), 5);
UPDATE users SET username_normalized = lower(username);

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN username_normalized SET NOT NULL,
  ADD CONSTRAINT users_username_normalized_key UNIQUE (username_normalized),
  ADD CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email_normalized DROP NOT NULL;

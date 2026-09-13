-- Run this once on your existing MySQL database.
-- If a column already exists, skip that statement.

ALTER TABLE students ADD COLUMN email VARCHAR(255) NULL UNIQUE;
ALTER TABLE students ADD COLUMN phone VARCHAR(30) NULL;
ALTER TABLE students ADD COLUMN reset_token_hash VARCHAR(255) NULL;
ALTER TABLE students ADD COLUMN reset_token_expires DATETIME NULL;

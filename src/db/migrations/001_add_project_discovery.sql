-- Add project discovery columns to projects table
-- These are safe to run on existing tables: SQLite ALTER TABLE ADD COLUMN
-- silently succeeds and does not fail if the column already exists when
-- the schema.sql CREATE TABLE IF NOT EXISTS already includes them.

ALTER TABLE projects ADD COLUMN source TEXT NOT NULL DEFAULT 'created';
ALTER TABLE projects ADD COLUMN project_type TEXT DEFAULT 'generic';
ALTER TABLE projects ADD COLUMN has_claude_history INTEGER DEFAULT 0;

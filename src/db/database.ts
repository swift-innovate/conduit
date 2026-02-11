// ── SQLite connection and helpers ──

import Database from "better-sqlite3";
import { config } from "../config";
import { logger } from "../utils/logger";
import { readFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { dirname, resolve, join } from "path";
import { fileURLToPath } from "url";

const log = logger.create("database");

let db: Database.Database;

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function initDatabase(): Database.Database {
  const dbPath = resolve(config.dbPath);
  const dir = dirname(dbPath);

  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run schema
  const schemaPath = resolve(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Run migrations
  runMigrations();

  log.info("Database initialized", { path: dbPath });
  return db;
}

function runMigrations() {
  // Ensure new columns exist on the projects table (handles DBs created before discovery feature)
  ensureColumn("projects", "source", "TEXT NOT NULL DEFAULT 'created'");
  ensureColumn("projects", "project_type", "TEXT DEFAULT 'generic'");
  ensureColumn("projects", "has_claude_history", "INTEGER DEFAULT 0");

  // Session error reporting
  ensureColumn("sessions", "error_message", "TEXT DEFAULT ''");

  // Also run any .sql migration files
  const migrationsDir = resolve(__dirname, "migrations");
  if (!existsSync(migrationsDir)) return;

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    for (const stmt of sql.split(";")) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith("--")) continue;
      try {
        db.exec(trimmed + ";");
      } catch {
        // Ignore — likely duplicate column from ensureColumn above
      }
    }
    log.debug("Migration applied", { file });
  }
}

function ensureColumn(table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (rows.some((r) => r.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    log.info("Added column", { table, column });
  } catch (err: any) {
    log.warn("Failed to add column", { table, column, error: err.message });
  }
}

// Helper: strip $ prefix from parameter keys for better-sqlite3 compatibility
// better-sqlite3 expects { id: value } not { $id: value }
function stripPrefixes(params: Record<string, unknown>): Record<string, unknown> {
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const cleanKey = key.startsWith('$') ? key.slice(1) : key;
    stripped[cleanKey] = value;
  }
  return stripped;
}

// Helper: run a query and return all rows
export function queryAll<T>(sql: string, params: Record<string, unknown> = {}): T[] {
  return getDb().prepare(sql).all(stripPrefixes(params)) as T[];
}

// Helper: run a query and return a single row
export function queryOne<T>(sql: string, params: Record<string, unknown> = {}): T | null {
  return (getDb().prepare(sql).get(stripPrefixes(params)) as T) ?? null;
}

// Helper: run an insert/update/delete
export function execute(sql: string, params: Record<string, unknown> = {}) {
  return getDb().prepare(sql).run(stripPrefixes(params));
}

export function closeDatabase() {
  if (db) {
    db.close();
    log.info("Database closed");
  }
}

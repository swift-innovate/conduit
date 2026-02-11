// ── Database reset script ──

import { unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import { config } from "../config";
import { initDatabase } from "./database";

const dbPath = resolve(config.dbPath);

if (existsSync(dbPath)) {
  unlinkSync(dbPath);
  console.log(`Deleted ${dbPath}`);
}

// Also remove WAL and journal files
for (const suffix of ["-wal", "-shm", "-journal"]) {
  const p = dbPath + suffix;
  if (existsSync(p)) {
    unlinkSync(p);
    console.log(`Deleted ${p}`);
  }
}

initDatabase();
console.log("Database reset complete.");

// Test setup — must be imported BEFORE any src/ modules.
// Sets CONDUIT_DB_PATH to a temp file so tests don't use the production DB.

import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Allocate a temp directory for the test DB.
// This runs at module load time, before any other src/ modules are imported.
export const testTmpDir = mkdtempSync(join(tmpdir(), "conduit-test-"));
export const testDbPath = join(testTmpDir, "test.db");

// Set env BEFORE config.ts reads it
process.env.CONDUIT_DB_PATH = testDbPath;
process.env.CONDUIT_PERMISSION_TIMEOUT_MS = "200";
process.env.CONDUIT_CLI_PATH = "echo"; // Avoid CLI detection issues
process.env.LOG_LEVEL = "error"; // Suppress noisy logs during tests

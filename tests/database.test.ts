// Database tests: schema creation, CRUD, migration idempotency

import "./setup.js";

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { initDatabase, getDb, closeDatabase, queryAll, queryOne, execute } from "../src/db/database";
import { testTmpDir } from "./setup.js";
import { rmSync } from "fs";

// Initialize once for all tests in this file
initDatabase();

after(() => {
  // Don't close the DB here since other test files may share it
});

describe("Database schema creation", () => {
  it("should create the projects table", () => {
    const tables = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
    );
    assert.equal(tables.length, 1);
  });

  it("should create the sessions table", () => {
    const tables = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'",
    );
    assert.equal(tables.length, 1);
  });

  it("should create the permission_rules table", () => {
    const tables = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='permission_rules'",
    );
    assert.equal(tables.length, 1);
  });

  it("should create the messages table", () => {
    const tables = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'",
    );
    assert.equal(tables.length, 1);
  });

  it("should create the permission_log table", () => {
    const tables = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='permission_log'",
    );
    assert.equal(tables.length, 1);
  });

  it("should create the webhooks table", () => {
    const tables = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='webhooks'",
    );
    assert.equal(tables.length, 1);
  });

  it("should create expected indexes", () => {
    const indexes = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    );
    const names = indexes.map((i) => i.name);
    assert.ok(names.includes("idx_sessions_project"));
    assert.ok(names.includes("idx_sessions_status"));
    assert.ok(names.includes("idx_messages_session"));
    assert.ok(names.includes("idx_messages_timestamp"));
    assert.ok(names.includes("idx_permission_log_session"));
    assert.ok(names.includes("idx_permission_rules_project"));
  });
});

describe("Database CRUD operations", () => {
  it("should insert and query a project", () => {
    execute(
      `INSERT INTO projects (id, name, folder_path, created_at, updated_at)
       VALUES ($id, $name, $folder_path, $created_at, $updated_at)`,
      {
        $id: "test-proj-1",
        $name: "Test Project",
        $folder_path: "/tmp/test",
        $created_at: new Date().toISOString(),
        $updated_at: new Date().toISOString(),
      },
    );

    const project = queryOne<{ id: string; name: string }>(
      "SELECT * FROM projects WHERE id = $id",
      { $id: "test-proj-1" },
    );
    assert.ok(project);
    assert.equal(project.name, "Test Project");
  });

  it("should update a project", () => {
    execute("UPDATE projects SET name = $name WHERE id = $id", {
      $name: "Updated Name",
      $id: "test-proj-1",
    });

    const project = queryOne<{ name: string }>(
      "SELECT name FROM projects WHERE id = $id",
      { $id: "test-proj-1" },
    );
    assert.ok(project);
    assert.equal(project.name, "Updated Name");
  });

  it("should delete a project", () => {
    execute("DELETE FROM projects WHERE id = $id", { $id: "test-proj-1" });

    const project = queryOne<{ id: string }>(
      "SELECT * FROM projects WHERE id = $id",
      { $id: "test-proj-1" },
    );
    assert.equal(project, null);
  });

  it("should enforce foreign keys", () => {
    assert.throws(
      () => {
        execute(
          `INSERT INTO sessions (id, project_id, session_id, status, created_at, last_active_at)
           VALUES ($id, $project_id, $session_id, $status, $created_at, $last_active_at)`,
          {
            $id: "orphan-session",
            $project_id: "nonexistent-project",
            $session_id: "cli-123",
            $status: "idle",
            $created_at: new Date().toISOString(),
            $last_active_at: new Date().toISOString(),
          },
        );
      },
      { message: /FOREIGN KEY constraint failed/ },
    );
  });

  it("should cascade delete sessions when project is deleted", () => {
    const now = new Date().toISOString();

    execute(
      `INSERT INTO projects (id, name, folder_path, created_at, updated_at)
       VALUES ($id, $name, $folder_path, $created_at, $updated_at)`,
      { $id: "cascade-proj", $name: "Cascade Test", $folder_path: "/tmp/cascade", $created_at: now, $updated_at: now },
    );

    execute(
      `INSERT INTO sessions (id, project_id, session_id, status, created_at, last_active_at)
       VALUES ($id, $project_id, $session_id, $status, $created_at, $last_active_at)`,
      { $id: "cascade-sess", $project_id: "cascade-proj", $session_id: "cli-456", $status: "idle", $created_at: now, $last_active_at: now },
    );

    execute("DELETE FROM projects WHERE id = $id", { $id: "cascade-proj" });

    const session = queryOne<{ id: string }>(
      "SELECT * FROM sessions WHERE id = $id",
      { $id: "cascade-sess" },
    );
    assert.equal(session, null);
  });
});

describe("Migration idempotency", () => {
  it("should safely re-run initDatabase without errors", () => {
    assert.doesNotThrow(() => {
      initDatabase();
    });
  });

  it("should still have valid schema after re-init", () => {
    const tables = queryAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    assert.ok(tables.length >= 6);
  });
});

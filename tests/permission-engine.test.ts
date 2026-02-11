// Permission engine tests

import "./setup.js";

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { initDatabase, closeDatabase, execute, queryAll } from "../src/db/database";
import { permissionEngine } from "../src/core/permission-engine";

initDatabase();

// Create a test project for rules that reference a project_id
const TEST_PROJECT_ID = "perm-test-project";
const TEST_SESSION_ID = "perm-test-session";

// Use INSERT OR IGNORE so re-runs don't fail on UNIQUE constraint
execute(
  `INSERT OR IGNORE INTO projects (id, name, folder_path, created_at, updated_at)
   VALUES ($id, $name, $folder_path, $created_at, $updated_at)`,
  {
    $id: TEST_PROJECT_ID,
    $name: "Perm Test Project",
    $folder_path: "/tmp/perm-test",
    $created_at: new Date().toISOString(),
    $updated_at: new Date().toISOString(),
  },
);

execute(
  `INSERT OR IGNORE INTO sessions (id, project_id, session_id, status, created_at, last_active_at)
   VALUES ($id, $project_id, $session_id, $status, $created_at, $last_active_at)`,
  {
    $id: TEST_SESSION_ID,
    $project_id: TEST_PROJECT_ID,
    $session_id: "cli-session-test",
    $status: "idle",
    $created_at: new Date().toISOString(),
    $last_active_at: new Date().toISOString(),
  },
);

after(() => {
  // Cleanup test data
  execute("DELETE FROM permission_log WHERE session_id = $sid", { $sid: TEST_SESSION_ID });
  execute("DELETE FROM permission_rules WHERE project_id = $pid", { $pid: TEST_PROJECT_ID });
  execute("DELETE FROM permission_rules WHERE project_id IS NULL", {});
  execute("DELETE FROM sessions WHERE id = $id", { $id: TEST_SESSION_ID });
  execute("DELETE FROM projects WHERE id = $id", { $id: TEST_PROJECT_ID });
});

beforeEach(() => {
  // Clear audit log first (references permission_rules via FK)
  execute("DELETE FROM permission_log WHERE session_id = $sid", { $sid: TEST_SESSION_ID });
  execute("DELETE FROM permission_rules WHERE project_id = $pid", { $pid: TEST_PROJECT_ID });
  execute("DELETE FROM permission_rules WHERE project_id IS NULL", {});
});

describe("Permission Rule CRUD", () => {
  it("should create a rule and return it", () => {
    const rule = permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
      rule_content: "npm test",
      priority: 10,
    });

    assert.ok(rule.id);
    assert.equal(rule.tool_name, "Bash");
    assert.equal(rule.behavior, "allow");
    assert.equal(rule.rule_content, "npm test");
    assert.equal(rule.priority, 10);
    assert.equal(rule.project_id, TEST_PROJECT_ID);
  });

  it("should create a global rule (null project_id)", () => {
    const rule = permissionEngine.createRule(null, {
      tool_name: "*",
      behavior: "deny",
    });

    assert.ok(rule.id);
    assert.equal(rule.project_id, null);
    assert.equal(rule.tool_name, "*");
    assert.equal(rule.behavior, "deny");
  });

  it("should list rules for a project", () => {
    permissionEngine.createRule(TEST_PROJECT_ID, { tool_name: "Bash", behavior: "allow" });
    permissionEngine.createRule(TEST_PROJECT_ID, { tool_name: "Write", behavior: "deny" });
    permissionEngine.createRule(null, { tool_name: "Read", behavior: "allow" });

    const projectRules = permissionEngine.getRulesForProject(TEST_PROJECT_ID);
    assert.equal(projectRules.length, 2);
  });

  it("should list global rules", () => {
    permissionEngine.createRule(null, { tool_name: "Read", behavior: "allow" });
    permissionEngine.createRule(TEST_PROJECT_ID, { tool_name: "Bash", behavior: "allow" });

    const globalRules = permissionEngine.getGlobalRules();
    assert.equal(globalRules.length, 1);
    assert.equal(globalRules[0].tool_name, "Read");
  });

  it("should update a rule with allowed columns only", () => {
    const rule = permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
    });

    const updated = permissionEngine.updateRule(rule.id, {
      tool_name: "Write",
      behavior: "deny",
      priority: 99,
    });

    assert.ok(updated);
    assert.equal(updated!.tool_name, "Write");
    assert.equal(updated!.behavior, "deny");
    assert.equal(updated!.priority, 99);
  });

  it("should reject invalid columns in update by ignoring them", () => {
    const rule = permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
    });

    const updated = permissionEngine.updateRule(rule.id, {
      tool_name: "Read",
      // @ts-expect-error - testing invalid field injection
      id: "hacked-id",
      // @ts-expect-error
      created_at: "2000-01-01",
    } as any);

    assert.ok(updated);
    assert.equal(updated!.tool_name, "Read");
    assert.equal(updated!.id, rule.id);
    assert.notEqual(updated!.created_at, "2000-01-01");
  });

  it("should delete a rule", () => {
    const rule = permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
    });

    permissionEngine.deleteRule(rule.id);

    const rules = permissionEngine.getRulesForProject(TEST_PROJECT_ID);
    assert.equal(rules.length, 0);
  });
});

describe("Permission Evaluation — Rule Matching Priority", () => {
  it("should deny when a project deny rule matches", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "deny",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-1",
      "Bash",
      { command: "rm -rf /" },
    );

    assert.equal(decision.behavior, "deny");
  });

  it("should deny via global deny rule when no project rule matches", async () => {
    permissionEngine.createRule(null, {
      tool_name: "Bash",
      behavior: "deny",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-2",
      "Bash",
      { command: "echo hello" },
    );

    assert.equal(decision.behavior, "deny");
  });

  it("should allow when a project allow rule matches and no deny rules exist", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-3",
      "Bash",
      { command: "npm test" },
    );

    assert.equal(decision.behavior, "allow");
  });

  it("should prioritize deny over allow for same project", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
    });
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "deny",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-4",
      "Bash",
      { command: "npm test" },
    );

    assert.equal(decision.behavior, "deny");
  });

  it("should allow via global allow rule when no project-specific rule matches", async () => {
    permissionEngine.createRule(null, {
      tool_name: "Read",
      behavior: "allow",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-5",
      "Read",
      { file_path: "/some/file" },
    );

    assert.equal(decision.behavior, "allow");
  });
});

describe("Permission Evaluation — Pattern Matching", () => {
  it("should match wildcard tool name", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "*",
      behavior: "allow",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-glob-1",
      "AnyTool",
      {},
    );
    assert.equal(decision.behavior, "allow");
  });

  it("should match Bash commands against rule_content pattern", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
      rule_content: "npm *",
    });

    const allowDecision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-bash-1",
      "Bash",
      { command: "npm test" },
    );
    assert.equal(allowDecision.behavior, "allow");
  });

  it("should NOT match Bash commands that do not fit the pattern", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
      rule_content: "npm *",
    });

    // "git push" does not match "npm *", so it should queue and timeout → deny
    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-bash-no-match",
      "Bash",
      { command: "git push" },
    );
    assert.equal(decision.behavior, "deny");
  });

  it("should match file_path for Write tool", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Write",
      behavior: "deny",
      rule_content: "/etc/*",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-write-1",
      "Write",
      { file_path: "/etc/passwd" },
    );
    assert.equal(decision.behavior, "deny");
  });

  it("should match file_path for Edit tool", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Edit",
      behavior: "allow",
      rule_content: "/home/user/project/*",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-edit-1",
      "Edit",
      { file_path: "/home/user/project/src/index.ts" },
    );
    assert.equal(decision.behavior, "allow");
  });

  it("should match prefix patterns with colon separator for Bash", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
      rule_content: "git:*",
    });

    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-prefix-1",
      "Bash",
      { command: "git commit -m 'test'" },
    );
    assert.equal(decision.behavior, "allow");
  });
});

describe("Permission Evaluation — Timeout", () => {
  it("should deny after timeout when no rules match", async () => {
    const startTime = Date.now();
    const decision = await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-timeout-1",
      "SomeTool",
      {},
    );
    const elapsed = Date.now() - startTime;

    assert.equal(decision.behavior, "deny");
    assert.ok(elapsed >= 150, `Expected timeout delay, got ${elapsed}ms`);
  });
});

describe("Permission Evaluation — Manual Response", () => {
  it("should resolve when respondToPermission is called", async () => {
    const evalPromise = permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-manual-1",
      "SomeTool",
      {},
    );

    const responded = permissionEngine.respondToPermission("req-manual-1", {
      behavior: "allow",
      source: "web_ui",
    });
    assert.ok(responded);

    const decision = await evalPromise;
    assert.equal(decision.behavior, "allow");
  });

  it("should return false for unknown request IDs", () => {
    const result = permissionEngine.respondToPermission("nonexistent-req", {
      behavior: "allow",
    });
    assert.equal(result, false);
  });

  it("should list pending permissions", async () => {
    const evalPromise = permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-pending-1",
      "ToolA",
      { foo: "bar" },
    );

    const pending = permissionEngine.getPending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].request_id, "req-pending-1");
    assert.equal(pending[0].tool_name, "ToolA");

    permissionEngine.respondToPermission("req-pending-1", { behavior: "deny" });
    await evalPromise;
  });

  it("should filter pending permissions by session ID", async () => {
    const evalPromise = permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-filter-1",
      "ToolA",
      {},
    );

    const matching = permissionEngine.getPending(TEST_SESSION_ID);
    assert.equal(matching.length, 1);

    const nonMatching = permissionEngine.getPending("other-session");
    assert.equal(nonMatching.length, 0);

    permissionEngine.respondToPermission("req-filter-1", { behavior: "deny" });
    await evalPromise;
  });
});

describe("Permission Audit Log", () => {
  it("should log decisions from auto-rules", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "Bash",
      behavior: "allow",
    });

    await permissionEngine.evaluate(
      TEST_SESSION_ID,
      TEST_PROJECT_ID,
      "req-audit-1",
      "Bash",
      { command: "echo hi" },
    );

    const log = permissionEngine.getAuditLog({ session_id: TEST_SESSION_ID });
    assert.ok(log.length > 0);
    const entry = log.find((e) => e.request_id === "req-audit-1");
    assert.ok(entry);
    assert.equal(entry!.decision, "allow");
    assert.equal(entry!.decision_source, "auto_rule");
  });

  it("should support limit and offset in audit log queries", async () => {
    permissionEngine.createRule(TEST_PROJECT_ID, {
      tool_name: "*",
      behavior: "allow",
    });

    for (let i = 0; i < 5; i++) {
      await permissionEngine.evaluate(
        TEST_SESSION_ID,
        TEST_PROJECT_ID,
        `req-page-${i}`,
        "Tool",
        {},
      );
    }

    const limited = permissionEngine.getAuditLog({ limit: 2 });
    assert.equal(limited.length, 2);

    const offset = permissionEngine.getAuditLog({ limit: 2, offset: 2 });
    assert.equal(offset.length, 2);
    assert.notEqual(limited[0].id, offset[0].id);
  });
});

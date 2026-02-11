// API integration tests using Hono's app.request()
// Tests the HTTP layer without spawning real CLI processes.

import "./setup.js";

import { mkdirSync } from "fs";
import { join } from "path";
import { testTmpDir } from "./setup.js";

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { engine } from "../src/core/engine";
import { createApp } from "../src/api/routes";
import { execute } from "../src/db/database";

// Create test project folder
const testFolder = join(testTmpDir, "api-test-project");
mkdirSync(testFolder, { recursive: true });

let app: ReturnType<typeof createApp>;

before(() => {
  engine.initialize();
  app = createApp();
});

beforeEach(() => {
  execute("DELETE FROM permission_log", {});
  execute("DELETE FROM permission_rules", {});
  execute("DELETE FROM messages", {});
  execute("DELETE FROM sessions", {});
  execute("DELETE FROM projects", {});
});

async function req(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

describe("Health endpoint", () => {
  it("should return health status with correct structure", async () => {
    const res = await req("GET", "/api/health");
    // Status may be 200 (healthy) or 503 (unhealthy) depending on CLI availability
    assert.ok([200, 503].includes(res.status), `Expected 200 or 503, got ${res.status}`);

    const data = await res.json() as any;
    assert.ok(data.status);
    assert.ok(["healthy", "degraded", "unhealthy"].includes(data.status));
    assert.ok(data.timestamp);
    assert.ok(data.checks);
    assert.equal(typeof data.checks.database_ok, "boolean");
    assert.equal(typeof data.checks.active_sessions, "number");
    assert.equal(typeof data.checks.projects, "number");
    assert.equal(typeof data.checks.cli_available, "boolean");
    assert.equal(typeof data.checks.uptime_seconds, "number");
  });

  it("should include version in health check", async () => {
    const res = await req("GET", "/api/health");
    const data = await res.json() as any;
    assert.equal(data.checks.version, "0.1.0");
  });
});

describe("Project API", () => {
  it("should create a project via POST /api/projects", async () => {
    const res = await req("POST", "/api/projects", {
      name: "API Test Project",
      folder_path: testFolder,
    });

    assert.equal(res.status, 201);
    const project = await res.json() as any;
    assert.ok(project.id);
    assert.equal(project.name, "API Test Project");
    assert.equal(project.folder_path, testFolder);
  });

  it("should list projects via GET /api/projects", async () => {
    await req("POST", "/api/projects", {
      name: "List Test",
      folder_path: testFolder,
    });

    const res = await req("GET", "/api/projects");
    assert.equal(res.status, 200);

    const projects = await res.json() as any[];
    assert.ok(projects.length >= 1);
    assert.ok(projects.some((p: any) => p.name === "List Test"));
  });

  it("should get a project by ID via GET /api/projects/:id", async () => {
    const createRes = await req("POST", "/api/projects", {
      name: "Get By ID",
      folder_path: testFolder,
    });
    const created = await createRes.json() as any;

    const res = await req("GET", `/api/projects/${created.id}`);
    assert.equal(res.status, 200);

    const project = await res.json() as any;
    assert.equal(project.id, created.id);
    assert.equal(project.name, "Get By ID");
  });

  it("should return 404 for non-existent project", async () => {
    const res = await req("GET", "/api/projects/nonexistent-id");
    assert.equal(res.status, 404);

    const body = await res.json() as any;
    assert.equal(body.error, "NOT_FOUND");
  });

  it("should update a project via PUT /api/projects/:id", async () => {
    const createRes = await req("POST", "/api/projects", {
      name: "Before Update",
      folder_path: testFolder,
    });
    const created = await createRes.json() as any;

    const res = await req("PUT", `/api/projects/${created.id}`, {
      name: "After Update",
      description: "Updated description",
    });
    assert.equal(res.status, 200);

    const updated = await res.json() as any;
    assert.equal(updated.name, "After Update");
    assert.equal(updated.description, "Updated description");
  });

  it("should delete a project via DELETE /api/projects/:id", async () => {
    const createRes = await req("POST", "/api/projects", {
      name: "To Delete",
      folder_path: testFolder,
    });
    const created = await createRes.json() as any;

    const res = await req("DELETE", `/api/projects/${created.id}`);
    assert.equal(res.status, 200);

    const body = await res.json() as any;
    assert.equal(body.ok, true);

    const getRes = await req("GET", `/api/projects/${created.id}`);
    assert.equal(getRes.status, 404);
  });

  it("should return 400 for invalid create body", async () => {
    const res = await req("POST", "/api/projects", {
      name: "",
      folder_path: testFolder,
    });
    assert.equal(res.status, 400);

    const body = await res.json() as any;
    assert.equal(body.error, "VALIDATION_ERROR");
  });
});

describe("Project Rules API", () => {
  it("should create and list rules for a project", async () => {
    const createRes = await req("POST", "/api/projects", {
      name: "Rules Test",
      folder_path: testFolder,
    });
    const project = await createRes.json() as any;

    const ruleRes = await req("POST", `/api/projects/${project.id}/rules`, {
      tool_name: "Bash",
      behavior: "allow",
      rule_content: "npm *",
    });
    assert.equal(ruleRes.status, 201);
    const rule = await ruleRes.json() as any;
    assert.equal(rule.tool_name, "Bash");
    assert.equal(rule.behavior, "allow");

    const listRes = await req("GET", `/api/projects/${project.id}/rules`);
    assert.equal(listRes.status, 200);
    const rules = await listRes.json() as any[];
    assert.equal(rules.length, 1);
  });

  it("should update a rule via PUT /api/rules/:id", async () => {
    const createRes = await req("POST", "/api/projects", {
      name: "Rule Update Test",
      folder_path: testFolder,
    });
    const project = await createRes.json() as any;

    const ruleRes = await req("POST", `/api/projects/${project.id}/rules`, {
      tool_name: "Bash",
      behavior: "allow",
    });
    const rule = await ruleRes.json() as any;

    const updateRes = await req("PUT", `/api/rules/${rule.id}`, {
      behavior: "deny",
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json() as any;
    assert.equal(updated.behavior, "deny");
  });

  it("should delete a rule via DELETE /api/rules/:id", async () => {
    const createRes = await req("POST", "/api/projects", {
      name: "Rule Delete Test",
      folder_path: testFolder,
    });
    const project = await createRes.json() as any;

    const ruleRes = await req("POST", `/api/projects/${project.id}/rules`, {
      tool_name: "Bash",
      behavior: "allow",
    });
    const rule = await ruleRes.json() as any;

    const delRes = await req("DELETE", `/api/rules/${rule.id}`);
    assert.equal(delRes.status, 200);

    const listRes = await req("GET", `/api/projects/${project.id}/rules`);
    const rules = await listRes.json() as any[];
    assert.equal(rules.length, 0);
  });
});

describe("Global Rules API", () => {
  it("should create and list global rules", async () => {
    const createRes = await req("POST", "/api/rules/global", {
      tool_name: "*",
      behavior: "deny",
    });
    assert.equal(createRes.status, 201);

    const listRes = await req("GET", "/api/rules/global");
    assert.equal(listRes.status, 200);
    const rules = await listRes.json() as any[];
    assert.ok(rules.length >= 1);
    assert.ok(rules.some((r: any) => r.tool_name === "*" && r.behavior === "deny"));
  });
});

describe("Audit Log API", () => {
  it("should return audit log via GET /api/permissions/log", async () => {
    const res = await req("GET", "/api/permissions/log");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });
});

describe("Session API (without CLI spawning)", () => {
  it("should list sessions for a project (empty)", async () => {
    const createRes = await req("POST", "/api/projects", {
      name: "Sessions Test",
      folder_path: testFolder,
    });
    const project = await createRes.json() as any;

    const res = await req("GET", `/api/projects/${project.id}/sessions`);
    assert.equal(res.status, 200);
    const sessions = await res.json() as any[];
    assert.equal(sessions.length, 0);
  });

  it("should return 404 for non-existent session", async () => {
    const res = await req("GET", "/api/sessions/nonexistent-id");
    assert.equal(res.status, 404);
  });
});

describe("Webhook API", () => {
  it("should create and delete a webhook", async () => {
    const createRes = await req("POST", "/api/webhooks", {
      name: "Test Webhook",
      url: "https://example.com/hook",
      events: ["session.created"],
    });
    assert.equal(createRes.status, 201);
    const webhook = await createRes.json() as any;
    assert.ok(webhook.id);

    const delRes = await req("DELETE", `/api/webhooks/${webhook.id}`);
    assert.equal(delRes.status, 200);
  });

  it("should return 400 for webhook with missing fields", async () => {
    const res = await req("POST", "/api/webhooks", {
      name: "",
      url: "",
    });
    assert.equal(res.status, 400);
  });
});

describe("Error response format", () => {
  it("should return consistent error format", async () => {
    const res = await req("GET", "/api/projects/nonexistent-id");
    const body = await res.json() as any;

    assert.ok(body.error, "Should have error code");
    assert.ok(body.message, "Should have error message");
    assert.equal(typeof body.error, "string");
    assert.equal(typeof body.message, "string");
  });
});

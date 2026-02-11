// ── Policy evaluation, auto-approve, audit ──

import { queryAll, queryOne, execute } from "../db/database";
import { generateId } from "../utils/uuid";
import { logger } from "../utils/logger";
import type {
  PermissionRule,
  CreatePermissionRuleInput,
  PermissionDecision,
  PermissionLogEntry,
} from "./types";

const log = logger.create("permission-engine");

export const permissionEngine = {
  // ── Rule CRUD ──

  createRule(projectId: string | null, input: CreatePermissionRuleInput): PermissionRule {
    const id = generateId();
    execute(
      `INSERT INTO permission_rules (id, project_id, tool_name, rule_content, behavior, priority, created_at)
       VALUES ($id, $project_id, $tool_name, $rule_content, $behavior, $priority, $created_at)`,
      {
        $id: id,
        $project_id: projectId,
        $tool_name: input.tool_name,
        $rule_content: input.rule_content ?? "",
        $behavior: input.behavior,
        $priority: input.priority ?? 0,
        $created_at: new Date().toISOString(),
      },
    );
    log.info("Rule created", { id, project_id: projectId, tool_name: input.tool_name, behavior: input.behavior });
    return queryOne<PermissionRule>("SELECT * FROM permission_rules WHERE id = $id", { $id: id })!;
  },

  getRulesForProject(projectId: string): PermissionRule[] {
    return queryAll<PermissionRule>(
      "SELECT * FROM permission_rules WHERE project_id = $project_id ORDER BY priority DESC",
      { $project_id: projectId },
    );
  },

  getGlobalRules(): PermissionRule[] {
    return queryAll<PermissionRule>(
      "SELECT * FROM permission_rules WHERE project_id IS NULL ORDER BY priority DESC",
    );
  },

  updateRule(ruleId: string, updates: Partial<CreatePermissionRuleInput>): PermissionRule | null {
    const ALLOWED_COLUMNS = ["tool_name", "rule_content", "behavior", "priority"];
    const fields: string[] = [];
    const params: Record<string, unknown> = { $id: ruleId };

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && ALLOWED_COLUMNS.includes(key)) {
        fields.push(`${key} = $${key}`);
        params[`$${key}`] = value;
      }
    }

    if (fields.length > 0) {
      execute(`UPDATE permission_rules SET ${fields.join(", ")} WHERE id = $id`, params);
    }

    return queryOne<PermissionRule>("SELECT * FROM permission_rules WHERE id = $id", { $id: ruleId });
  },

  deleteRule(ruleId: string): void {
    execute("DELETE FROM permission_rules WHERE id = $id", { $id: ruleId });
    log.info("Rule deleted", { id: ruleId });
  },

  // ── Permission Evaluation ──

  evaluate(
    sessionId: string,
    projectId: string,
    requestId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): PermissionDecision {
    // 1. Check project deny rules
    const projectDeny = this.findMatchingRule(projectId, toolName, toolInput, "deny");
    if (projectDeny) {
      this.logDecision(sessionId, requestId, toolName, toolInput, "deny", "auto_rule", projectDeny.id);
      return { behavior: "deny" };
    }

    // 2. Check global deny rules
    const globalDeny = this.findMatchingRule(null, toolName, toolInput, "deny");
    if (globalDeny) {
      this.logDecision(sessionId, requestId, toolName, toolInput, "deny", "auto_rule", globalDeny.id);
      return { behavior: "deny" };
    }

    // 3. Check project allow rules
    const projectAllow = this.findMatchingRule(projectId, toolName, toolInput, "allow");
    if (projectAllow) {
      this.logDecision(sessionId, requestId, toolName, toolInput, "allow", "auto_rule", projectAllow.id);
      return { behavior: "allow" };
    }

    // 4. Check global allow rules
    const globalAllow = this.findMatchingRule(null, toolName, toolInput, "allow");
    if (globalAllow) {
      this.logDecision(sessionId, requestId, toolName, toolInput, "allow", "auto_rule", globalAllow.id);
      return { behavior: "allow" };
    }

    // 5. No rule matched — auto-allow
    log.info("Permission auto-allowed (no matching rule)", { session_id: sessionId, request_id: requestId, tool: toolName });
    this.logDecision(sessionId, requestId, toolName, toolInput, "allow", "auto_default", null);
    return { behavior: "allow" };
  },

  // ── Pattern Matching ──

  findMatchingRule(
    projectId: string | null,
    toolName: string,
    toolInput: Record<string, unknown>,
    behavior: string,
  ): PermissionRule | null {
    const rules = projectId
      ? queryAll<PermissionRule>(
          `SELECT * FROM permission_rules WHERE project_id = $pid AND behavior = $behavior ORDER BY priority DESC`,
          { $pid: projectId, $behavior: behavior },
        )
      : queryAll<PermissionRule>(
          `SELECT * FROM permission_rules WHERE project_id IS NULL AND behavior = $behavior ORDER BY priority DESC`,
          { $behavior: behavior },
        );

    for (const rule of rules) {
      if (this.matchesRule(rule, toolName, toolInput)) {
        return rule;
      }
    }
    return null;
  },

  matchesRule(rule: PermissionRule, toolName: string, toolInput: Record<string, unknown>): boolean {
    // Tool name match: wildcard or exact
    if (rule.tool_name !== "*" && rule.tool_name !== toolName) {
      return false;
    }

    // Rule content pattern match
    if (!rule.rule_content) {
      return true; // Empty pattern matches everything for this tool
    }

    const pattern = rule.rule_content;

    // For Bash tools, match against command
    if (toolName === "Bash" && toolInput.command) {
      return matchGlob(pattern, String(toolInput.command));
    }

    // For Write/Edit tools, match against file_path
    if ((toolName === "Write" || toolName === "Edit" || toolName === "Read") && toolInput.file_path) {
      return matchGlob(pattern, String(toolInput.file_path));
    }

    // Generic: try matching pattern against JSON stringified input
    return matchGlob(pattern, JSON.stringify(toolInput));
  },

  // ── Audit Logging ──

  logDecision(
    sessionId: string,
    requestId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    decision: string,
    source: string,
    ruleId: string | null,
  ) {
    execute(
      `INSERT INTO permission_log (id, session_id, request_id, tool_name, tool_input, decision, decision_source, rule_id, decided_by, decided_at)
       VALUES ($id, $session_id, $request_id, $tool_name, $tool_input, $decision, $decision_source, $rule_id, $decided_by, $decided_at)`,
      {
        $id: generateId(),
        $session_id: sessionId,
        $request_id: requestId,
        $tool_name: toolName,
        $tool_input: JSON.stringify(toolInput),
        $decision: decision,
        $decision_source: source,
        $rule_id: ruleId,
        $decided_by: source === "auto_rule" || source === "auto_default" ? "system" : source,
        $decided_at: new Date().toISOString(),
      },
    );
  },

  getAuditLog(filters?: { session_id?: string; limit?: number; offset?: number }): PermissionLogEntry[] {
    let sql = "SELECT * FROM permission_log";
    const params: Record<string, unknown> = {};

    if (filters?.session_id) {
      sql += " WHERE session_id = $session_id";
      params.$session_id = filters.session_id;
    }

    sql += " ORDER BY decided_at DESC";

    if (filters?.limit !== undefined) {
      sql += " LIMIT $limit";
      params.$limit = filters.limit;
    }
    if (filters?.offset !== undefined) {
      sql += " OFFSET $offset";
      params.$offset = filters.offset;
    }

    return queryAll<PermissionLogEntry>(sql, params);
  },
};

// Simple glob matcher: supports * and prefix:* patterns
function matchGlob(pattern: string, value: string): boolean {
  // Handle prefix patterns like "git:*"
  // This matches commands that START with the prefix, not commands that contain it anywhere.
  // Example: "git:*" matches "git add", "git commit", but NOT "digits are fun"
  if (pattern.includes(":")) {
    const [prefix, suffix] = pattern.split(":", 2);
    if (suffix === "*") {
      return value.startsWith(prefix);
    }
  }

  // Convert glob to regex
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$");
  return regex.test(value);
}

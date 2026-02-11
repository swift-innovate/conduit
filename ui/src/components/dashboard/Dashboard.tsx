import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api-client";
import { SystemHealth } from "./SystemHealth";
import { formatCost, formatTokens, relativeTime, cn } from "../../lib/utils";
import {
  Layers,
  Activity,
  DollarSign,
  Hash,
  Trash2,
  Plus,
  Shield,
  ShieldOff,
  X,
} from "lucide-react";

interface DashboardProps {
  onSelectProject: (id: string) => void;
}

const STATUS_BADGE: Record<string, string> = {
  idle: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  starting: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  error: "bg-red-500/20 text-red-300 border-red-500/30",
  closed: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const DECISION_BADGE: Record<string, string> = {
  allow: "bg-green-500/20 text-green-300",
  deny: "bg-red-500/20 text-red-300",
};

export function Dashboard({ onSelectProject }: DashboardProps) {
  const {
    projects,
    loadProjects,
    loadHealth,
    allSessions,
    loadAllSessions,
    auditLog,
    loadAuditLog,
    denyRules,
    loadDenyRules,
    health,
  } = useAppStore();

  // Deny rule form state
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleToolName, setRuleToolName] = useState("");
  const [ruleContent, setRuleContent] = useState("");
  const [ruleProjectId, setRuleProjectId] = useState("global");

  const loadAll = useCallback(() => {
    loadHealth().catch(() => {});
    loadProjects().catch(() => {});
    loadAllSessions().catch(() => {});
    loadAuditLog().catch(() => {});
    loadDenyRules().catch(() => {});
  }, [loadHealth, loadProjects, loadAllSessions, loadAuditLog, loadDenyRules]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 3000);
    return () => clearInterval(interval);
  }, [loadAll]);

  // Build project name lookup
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  // Aggregate stats
  const totalCost = allSessions.reduce((sum, s) => sum + (s.total_cost_usd || 0), 0);
  const totalTokens = allSessions.reduce(
    (sum, s) => sum + (s.total_input_tokens || 0) + (s.total_output_tokens || 0),
    0,
  );

  const handleKillSession = async (sessionId: string) => {
    try {
      await api.killSession(sessionId);
      loadAllSessions();
    } catch {
      // ignore
    }
  };

  const handleAddRule = async () => {
    if (!ruleToolName.trim()) return;
    try {
      const data = { tool_name: ruleToolName.trim(), rule_content: ruleContent.trim(), behavior: "deny" };
      if (ruleProjectId === "global") {
        await api.createGlobalRule(data);
      } else {
        await api.createProjectRule(ruleProjectId, data);
      }
      setRuleToolName("");
      setRuleContent("");
      setRuleProjectId("global");
      setShowAddRule(false);
      loadDenyRules();
    } catch {
      // ignore
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await api.deleteRule(ruleId);
      loadDenyRules();
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">
          System overview, active sessions, and rule management
        </p>
      </div>

      {/* System health */}
      <SystemHealth />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Projects</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold mt-2">{projects.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Active Sessions</span>
            <Activity className="w-4 h-4 text-green-400" />
          </div>
          <p className="text-2xl font-bold mt-2">{allSessions.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Cost</span>
            <DollarSign className="w-4 h-4 text-yellow-400" />
          </div>
          <p className="text-2xl font-bold mt-2">{formatCost(totalCost)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Tokens</span>
            <Hash className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold mt-2">{formatTokens(totalTokens)}</p>
        </div>
      </div>

      {/* Active sessions table */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Active Sessions
        </h3>
        {allSessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
            No active sessions
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Project</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Session</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Model</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Cost</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Tokens</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Turns</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Last Active</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allSessions.map((session) => (
                    <tr key={session.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => onSelectProject(session.project_id)}
                          className="text-primary hover:underline truncate max-w-[150px] block"
                        >
                          {projectMap.get(session.project_id) || session.project_id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 truncate max-w-[150px]">{session.name || "Unnamed"}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-xs font-medium border",
                            STATUS_BADGE[session.status] || STATUS_BADGE.idle,
                          )}
                        >
                          {session.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]">
                        {session.model || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {formatCost(session.total_cost_usd || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {formatTokens(session.total_input_tokens || 0)} / {formatTokens(session.total_output_tokens || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {session.num_turns || 0}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {session.last_active_at ? relativeTime(session.last_active_at) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleKillSession(session.id)}
                          className="p-1 rounded hover:bg-destructive/20 text-destructive"
                          title="Kill session"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panels: Audit log + Deny rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Audit log */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Recent Audit Log
          </h3>
          {auditLog.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
              No audit log entries
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Time</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Tool</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Decision</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((entry) => (
                      <tr key={entry.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                          {relativeTime(entry.decided_at)}
                        </td>
                        <td className="px-3 py-1.5 font-mono truncate max-w-[150px]">
                          {entry.tool_name}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={cn(
                              "inline-block px-1.5 py-0.5 rounded text-xs font-medium",
                              DECISION_BADGE[entry.decision] || "bg-gray-500/20 text-gray-300",
                            )}
                          >
                            {entry.decision}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[100px]">
                          {entry.decision_source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Deny rules */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Deny Rules
            </h3>
            <button
              onClick={() => setShowAddRule(!showAddRule)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Rule
            </button>
          </div>

          {showAddRule && (
            <div className="mb-3 p-3 rounded-lg border border-border bg-muted/30 space-y-2">
              <input
                type="text"
                placeholder="Tool name (e.g., Bash, Write)"
                value={ruleToolName}
                onChange={(e) => setRuleToolName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded bg-background border border-input"
              />
              <input
                type="text"
                placeholder="Pattern / content (optional)"
                value={ruleContent}
                onChange={(e) => setRuleContent(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded bg-background border border-input"
              />
              <select
                value={ruleProjectId}
                onChange={(e) => setRuleProjectId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm rounded bg-background border border-input"
              >
                <option value="global">Global (all projects)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleAddRule}
                  className="px-3 py-1.5 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Create Deny Rule
                </button>
                <button
                  onClick={() => setShowAddRule(false)}
                  className="px-3 py-1.5 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {denyRules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
              No deny rules configured
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-y-auto max-h-[300px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Tool</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Pattern</th>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium">Scope</th>
                      <th className="text-right px-3 py-2 text-muted-foreground font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {denyRules.map((rule) => (
                      <tr key={rule.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 font-mono flex items-center gap-1.5">
                          <ShieldOff className="w-3 h-3 text-red-400 shrink-0" />
                          {rule.tool_name}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[150px]">
                          {rule.rule_content || "-"}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {rule.project_id ? (projectMap.get(rule.project_id) || "Project") : "Global"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-1 rounded hover:bg-destructive/20 text-destructive"
                            title="Delete rule"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

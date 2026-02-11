import { useEffect, useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api-client";
import { ProjectSettings } from "./ProjectSettings";
import {
  Plus,
  Square,
  Settings,
  Terminal,
  Download,
  History,
} from "lucide-react";
import { cn, formatDate, formatCost } from "../../lib/utils";

interface ProjectListProps {
  projectId: string;
}

export function ProjectList({ projectId }: ProjectListProps) {
  const { sessions, loadSessions } = useAppStore();
  const [project, setProject] = useState<any>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.getProject(projectId).then(setProject);
    loadSessions(projectId);
    const interval = setInterval(() => loadSessions(projectId), 3000);
    return () => clearInterval(interval);
  }, [projectId, loadSessions]);

  const handleNewSession = async () => {
    setCreating(true);
    try {
      await api.createSession(projectId);
      await loadSessions(projectId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleKillSession = async (sessionId: string) => {
    await api.killSession(sessionId);
    await loadSessions(projectId);
  };

  if (!project) return null;

  const statusColor: Record<string, string> = {
    idle: "bg-blue-500",
    starting: "bg-yellow-500",
    active: "bg-green-500",
    compacting: "bg-purple-500",
    error: "bg-red-500",
    closed: "bg-gray-500",
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Project header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{project.name}</h2>
            {project.source === "imported" && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                <Download className="w-2.5 h-2.5" />
                Imported
              </span>
            )}
            {project.project_type && project.project_type !== "generic" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                {project.project_type}
              </span>
            )}
            {project.has_claude_history === 1 && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">
                <History className="w-2.5 h-2.5" />
                Claude history
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {project.folder_path}
            {project.created_at && (
              <span className="ml-3 text-xs">Created {formatDate(project.created_at)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <button
            onClick={handleNewSession}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? "Starting..." : "New Session"}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="rounded-lg border border-border bg-card p-4">
          <ProjectSettings projectId={projectId} />
        </div>
      )}

      {/* Sessions table */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Sessions ({sessions.length})
        </h3>
        {sessions.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
            <Terminal className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Sessions</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Start a new Claude Code session to begin working on this project
            </p>
            <button
              onClick={handleNewSession}
              disabled={creating}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-5 h-5" />
              {creating ? "Starting Session..." : "Start New Session"}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Session</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Model</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Cost</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Tokens</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Turns</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Last Active</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.id}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      session.status === "closed" ? "opacity-50" : "hover:bg-accent/50",
                    )}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[200px]">
                          {session.name || `Session ${session.id.slice(0, 8)}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", statusColor[session.status] ?? "bg-gray-500")} />
                        <span className="capitalize">{session.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {session.model || "-"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCost(session.total_cost_usd)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {(session.total_input_tokens + session.total_output_tokens).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {session.num_turns}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {formatDate(session.last_active_at)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {session.status !== "closed" && (
                        <button
                          onClick={() => handleKillSession(session.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-destructive/10 text-destructive transition-colors"
                          title="Kill session"
                        >
                          <Square className="w-3 h-3" />
                          Kill
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

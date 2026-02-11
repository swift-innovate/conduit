import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "../../stores/app-store";
import { api } from "../../lib/api-client";
import {
  Layers,
  FolderOpen,
  Plus,
  Download,
  Activity,
  Trash2,
  History,
} from "lucide-react";
import { cn } from "../../lib/utils";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projects, selectedProjectId, selectProject, loadProjects } = useAppStore();
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectPath.trim()) return;
    try {
      await api.createProject({ name: newProjectName.trim(), folder_path: newProjectPath.trim() });
      await loadProjects();
      setShowNewProject(false);
      setNewProjectName("");
      setNewProjectPath("");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project and all its sessions?")) return;
    await api.deleteProject(id);
    if (selectedProjectId === id) {
      selectProject(null);
      navigate("/");
    }
    await loadProjects();
  };

  const handleProjectClick = (projectId: string) => {
    selectProject(projectId);
    navigate(`/projects/${projectId}`);
  };

  // Helper to check if a route is active
  const isRouteActive = (path: string): boolean => {
    return location.pathname === path;
  };

  const isProjectActive = (projectId: string): boolean => {
    return location.pathname.startsWith(`/projects/${projectId}`);
  };

  const TYPE_DOT: Record<string, string> = {
    node: "bg-green-400",
    python: "bg-blue-400",
    rust: "bg-orange-400",
    go: "bg-cyan-400",
    generic: "bg-gray-400",
  };

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Layers className="w-5 h-5 text-red-500" />
          Conduit
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Claude Code Orchestration</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        <button
          onClick={() => navigate("/")}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm",
            isRouteActive("/") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          <Activity className="w-4 h-4" />
          Dashboard
        </button>

        {/* Projects list */}
        <div className="mt-4">
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Projects
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate("/import")}
                className="text-muted-foreground hover:text-foreground"
                title="Import Existing"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setShowNewProject(!showNewProject)}
                className="text-muted-foreground hover:text-foreground"
                title="New Project"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {showNewProject && (
            <div className="mx-2 mb-2 p-2 rounded-md bg-muted space-y-2">
              <input
                type="text"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded bg-background border border-input"
              />
              <input
                type="text"
                placeholder="Folder path"
                value={newProjectPath}
                onChange={(e) => setNewProjectPath(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded bg-background border border-input"
              />
              <div className="flex gap-1">
                <button
                  onClick={handleCreateProject}
                  className="flex-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Create
                </button>
                <button
                  onClick={() => setShowNewProject(false)}
                  className="px-2 py-1 text-xs rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {projects.map((project: any) => (
            <button
              key={project.id}
              onClick={() => handleProjectClick(project.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm group",
                isProjectActive(project.id)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <div className="relative shrink-0">
                <FolderOpen className="w-4 h-4" />
                {project.source === "imported" && (
                  <Download className="w-2 h-2 absolute -bottom-0.5 -right-0.5 text-primary" />
                )}
              </div>
              <span className="truncate flex-1 text-left">{project.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                {project.project_type && project.project_type !== "generic" && (
                  <span className={cn("w-1.5 h-1.5 rounded-full", TYPE_DOT[project.project_type])} title={project.project_type} />
                )}
                {project.has_claude_history === 1 && (
                  <span title="Has Claude history">
                    <History className="w-3 h-3 text-purple-400 opacity-60" />
                  </span>
                )}
                <Trash2
                  className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-destructive"
                  onClick={(e) => handleDeleteProject(project.id, e)}
                />
              </div>
            </button>
          ))}
        </div>
      </nav>

    </aside>
  );
}

import { useState, useEffect } from "react";
import { api } from "../../lib/api-client";
import { cn } from "../../lib/utils";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  Download,
  Check,
  History,
  ArrowUp,
  Terminal,
} from "lucide-react";

interface BrowseEntry {
  name: string;
  path: string;
  has_claude_history: boolean;
  session_count: number;
  project_type: string;
  is_project: boolean;
  already_imported: boolean;
}

interface FolderBrowserProps {
  onImport: (project: any) => void;
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  node: "bg-green-500/20 text-green-400",
  python: "bg-blue-500/20 text-blue-400",
  rust: "bg-orange-500/20 text-orange-400",
  go: "bg-cyan-500/20 text-cyan-400",
  generic: "bg-gray-500/20 text-gray-400",
};

export function FolderBrowser({ onImport, onClose }: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState("");

  const loadPath = async (path?: string) => {
    setLoading(true);
    try {
      const result = await api.browseFolders(path);
      setCurrentPath(result.path);
      setPathInput(result.path);
      setEntries(result.entries);
    } catch (err: any) {
      // If path fails, stay where we are
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPath();
  }, []);

  const navigateTo = (path: string) => {
    loadPath(path);
  };

  const navigateUp = () => {
    // Go to parent directory
    const parts = currentPath.replace(/\\/g, "/").split("/");
    parts.pop();
    const parent = parts.join("/") || "/";
    loadPath(parent);
  };

  const handlePathSubmit = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      loadPath(pathInput);
    }
  };

  const handleImport = async (entry: BrowseEntry) => {
    setImporting(entry.path);
    try {
      const project = await api.importProject({
        folder_path: entry.path,
        import_sessions: entry.has_claude_history,
      });
      onImport(project);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(null);
    }
  };

  const handleImportCurrent = async () => {
    setImporting(currentPath);
    try {
      const project = await api.importProject({
        folder_path: currentPath,
        import_sessions: true,
      });
      onImport(project);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(null);
    }
  };

  // Build breadcrumb segments from currentPath
  const pathSegments = currentPath.replace(/\\/g, "/").split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      {/* Breadcrumb path navigation */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-1 text-xs overflow-x-auto">
          <button
            onClick={() => navigateTo("/")}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            /
          </button>
          {pathSegments.map((segment, i) => {
            const segPath = (currentPath.startsWith("/") ? "/" : "") + pathSegments.slice(0, i + 1).join("/");
            return (
              <span key={i} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <button
                  onClick={() => navigateTo(segPath)}
                  className={cn(
                    "hover:text-foreground",
                    i === pathSegments.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={handlePathSubmit}
            className="flex-1 px-2 py-1 text-xs rounded bg-background border border-input font-mono"
            placeholder="Enter path and press Enter..."
          />
          <button
            onClick={navigateUp}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            title="Go up"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Select current folder button */}
      <div className="px-3 py-2 border-b border-border">
        <button
          onClick={handleImportCurrent}
          disabled={importing === currentPath}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {importing === currentPath ? "Importing..." : "Import This Folder"}
        </button>
      </div>

      {/* Directory listing */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">No subdirectories found</div>
        ) : (
          <div className="divide-y divide-border/50">
            {entries.map((entry) => (
              <div
                key={entry.path}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 group"
              >
                {/* Click folder name to navigate into it */}
                <button
                  onClick={() => navigateTo(entry.path)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  {entry.is_project ? (
                    <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className={cn("text-sm truncate", entry.is_project && "font-medium")}>
                    {entry.name}
                  </span>
                </button>

                {/* Badges */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {entry.project_type !== "generic" && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", TYPE_COLORS[entry.project_type])}>
                      {entry.project_type}
                    </span>
                  )}
                  {entry.has_claude_history && (
                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium" title={`${entry.session_count} session(s)`}>
                      <History className="w-2.5 h-2.5" />
                      {entry.session_count}
                    </span>
                  )}
                  {entry.already_imported ? (
                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
                      <Check className="w-2.5 h-2.5" />
                      Added
                    </span>
                  ) : entry.is_project ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImport(entry);
                      }}
                      disabled={importing === entry.path}
                      className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary hover:bg-primary/30 font-medium disabled:opacity-50"
                    >
                      <Download className="w-2.5 h-2.5" />
                      {importing === entry.path ? "..." : "Import"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border flex justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1 rounded-md text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          Close
        </button>
      </div>
    </div>
  );
}

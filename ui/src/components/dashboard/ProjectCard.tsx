import { FolderOpen, ChevronRight } from "lucide-react";
import { formatDate } from "../../lib/utils";

interface ProjectCardProps {
  project: any;
  sessionCount: number;
  onClick: () => void;
}

export function ProjectCard({ project, sessionCount, onClick }: ProjectCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium">{project.name}</h3>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
      {project.description && (
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
      )}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <span>{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
        <span className="truncate">{project.folder_path}</span>
      </div>
    </button>
  );
}

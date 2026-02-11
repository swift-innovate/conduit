import { useState, useEffect } from "react";
import { api } from "../../lib/api-client";
import { useAppStore } from "../../stores/app-store";
import { Save } from "lucide-react";

interface ProjectSettingsProps {
  projectId: string;
}

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
  const { loadProjects } = useAppStore();
  const [project, setProject] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getProject(projectId).then(setProject);
  }, [projectId]);

  if (!project) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProject(projectId, {
        name: project.name,
        description: project.description,
        folder_path: project.folder_path,
        system_prompt: project.system_prompt,
        default_model: project.default_model,
        default_permission_mode: project.default_permission_mode,
        max_sessions: project.max_sessions,
      });
      await loadProjects();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: any) => setProject({ ...project, [field]: value });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <input
            value={project.name}
            onChange={(e) => update("name", e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-input text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Folder Path</label>
          <input
            value={project.folder_path}
            onChange={(e) => update("folder_path", e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-input text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <textarea
          value={project.description}
          onChange={(e) => update("description", e.target.value)}
          rows={2}
          className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-input text-sm resize-none"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground">System Prompt</label>
        <textarea
          value={project.system_prompt}
          onChange={(e) => update("system_prompt", e.target.value)}
          rows={4}
          className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-input text-sm font-mono resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-muted-foreground">Default Model</label>
          <input
            value={project.default_model}
            onChange={(e) => update("default_model", e.target.value)}
            placeholder="e.g. claude-sonnet-4-5-20250929"
            className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-input text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Permission Mode</label>
          <select
            value={project.default_permission_mode}
            onChange={(e) => update("default_permission_mode", e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-input text-sm"
          >
            <option value="default">Default</option>
            <option value="plan">Plan</option>
            <option value="acceptEdits">Accept Edits</option>
            <option value="bypassPermissions">Bypass Permissions</option>
            <option value="delegate">Delegate</option>
            <option value="dontAsk">Don't Ask</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Max Sessions</label>
          <input
            type="number"
            value={project.max_sessions}
            onChange={(e) => update("max_sessions", parseInt(e.target.value))}
            className="w-full mt-1 px-3 py-2 rounded-md bg-background border border-input text-sm"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

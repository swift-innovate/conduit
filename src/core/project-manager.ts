// ── Project CRUD, folder mapping, discovery, and import ──

import { queryAll, queryOne, execute } from "../db/database";
import { generateId } from "../utils/uuid";
import { logger } from "../utils/logger";
import { config } from "../config";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  DiscoveredProject,
  ImportProjectInput,
  BrowseEntry,
  ProjectType,
} from "./types";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { basename, join, resolve } from "path";

const log = logger.create("project-manager");

// ── Friendly name helpers ──

/** Convert folder_name or folder-name to "Folder Name" */
function humanizeFolderName(folderName: string): string {
  return folderName
    .replace(/[-_]+/g, " ")        // hyphens/underscores → spaces
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → words
    .replace(/\b\w/g, (c) => c.toUpperCase()) // title-case each word
    .replace(/\b(Mvp|Api|Ui|Ai|Llm|Sdk|Cli|Db|Sql|Gpu|Rl|Mcp)\b/gi, (m) => m.toUpperCase()) // known acronyms
    .trim();
}

// Project marker files → detected project type
const PROJECT_MARKERS: Record<string, ProjectType> = {
  "package.json": "node",
  "pyproject.toml": "python",
  "setup.py": "python",
  "requirements.txt": "python",
  "Cargo.toml": "rust",
  "go.mod": "go",
};

function detectProjectType(folderPath: string): ProjectType {
  for (const [marker, type] of Object.entries(PROJECT_MARKERS)) {
    if (existsSync(join(folderPath, marker))) return type;
  }
  return "generic";
}

function hasProjectMarker(folderPath: string): boolean {
  if (existsSync(join(folderPath, ".git"))) return true;
  for (const marker of Object.keys(PROJECT_MARKERS)) {
    if (existsSync(join(folderPath, marker))) return true;
  }
  return false;
}

function inspectClaudeHistory(folderPath: string): { has_history: boolean; session_count: number } {
  const claudeDir = join(folderPath, ".claude");
  if (!existsSync(claudeDir)) {
    return { has_history: false, session_count: 0 };
  }

  // Check for settings.json or projects/ with session JSONL files
  const hasSettings = existsSync(join(claudeDir, "settings.json"));
  const projectsDir = join(claudeDir, "projects");

  let sessionCount = 0;
  if (existsSync(projectsDir)) {
    try {
      // .claude/projects/ contains subdirectories, each may have JSONL session files
      const entries = readdirSync(projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = join(projectsDir, entry.name);
          const files = readdirSync(subDir);
          sessionCount += files.filter((f) => f.endsWith(".jsonl")).length;
        }
      }
    } catch {
      // Permission errors, etc.
    }
  }

  return {
    has_history: hasSettings || sessionCount > 0,
    session_count: sessionCount,
  };
}

function getImportedPaths(): Set<string> {
  const projects = queryAll<{ folder_path: string }>("SELECT folder_path FROM projects");
  return new Set(projects.map((p) => normalizePath(p.folder_path)));
}

function normalizePath(p: string): string {
  return resolve(p).replace(/\\/g, "/").toLowerCase();
}

function findClaudeSessionIds(folderPath: string): string[] {
  const projectsDir = join(folderPath, ".claude", "projects");
  if (!existsSync(projectsDir)) return [];

  const sessionIds: string[] = [];
  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subDir = join(projectsDir, entry.name);
      const files = readdirSync(subDir).filter((f) => f.endsWith(".jsonl"));
      for (const file of files) {
        // Session ID is the filename without .jsonl extension
        sessionIds.push(file.replace(/\.jsonl$/, ""));
      }
    }
  } catch {
    // ignore
  }
  return sessionIds;
}

export const projectManager = {
  create(input: CreateProjectInput): Project {
    if (!input.name?.trim()) {
      throw new ValidationError("Project name is required");
    }
    if (!input.folder_path?.trim()) {
      throw new ValidationError("Folder path is required");
    }
    if (!existsSync(input.folder_path)) {
      throw new ValidationError(`Folder does not exist: ${input.folder_path}`);
    }
    const VALID_PERMISSION_MODES = ["acceptEdits", "bypassPermissions", "default", "delegate", "dontAsk", "plan"];
    if (input.default_permission_mode && !VALID_PERMISSION_MODES.includes(input.default_permission_mode)) {
      throw new ValidationError(`Invalid permission mode '${input.default_permission_mode}'. Must be one of: ${VALID_PERMISSION_MODES.join(", ")}`);
    }

    const id = generateId();
    const now = new Date().toISOString();
    const projectType = detectProjectType(input.folder_path);
    const { has_history } = inspectClaudeHistory(input.folder_path);

    execute(
      `INSERT INTO projects (id, name, description, folder_path, system_prompt, append_system_prompt, default_model, default_permission_mode, max_sessions, source, project_type, has_claude_history, created_at, updated_at)
       VALUES ($id, $name, $description, $folder_path, $system_prompt, $append_system_prompt, $default_model, $default_permission_mode, $max_sessions, $source, $project_type, $has_claude_history, $created_at, $updated_at)`,
      {
        $id: id,
        $name: input.name.trim(),
        $description: input.description ?? "",
        $folder_path: input.folder_path.trim(),
        $system_prompt: input.system_prompt ?? "",
        $append_system_prompt: input.append_system_prompt ?? "",
        $default_model: input.default_model ?? "",
        $default_permission_mode: input.default_permission_mode ?? "default",
        $max_sessions: input.max_sessions ?? 5,
        $source: "created",
        $project_type: projectType,
        $has_claude_history: has_history ? 1 : 0,
        $created_at: now,
        $updated_at: now,
      },
    );

    log.info("Project created", { id, name: input.name });
    return this.getById(id)!;
  },

  getById(id: string): Project | null {
    return queryOne<Project>("SELECT * FROM projects WHERE id = $id", { $id: id });
  },

  getByIdOrThrow(id: string): Project {
    const project = this.getById(id);
    if (!project) throw new NotFoundError("Project", id);
    return project;
  },

  list(): Project[] {
    return queryAll<Project>("SELECT * FROM projects ORDER BY created_at DESC");
  },

  update(id: string, input: UpdateProjectInput): Project {
    this.getByIdOrThrow(id);

    if (input.folder_path && !existsSync(input.folder_path)) {
      throw new ValidationError(`Folder does not exist: ${input.folder_path}`);
    }

    const ALLOWED_COLUMNS = [
      "name", "description", "folder_path", "system_prompt",
      "append_system_prompt", "default_model", "default_permission_mode", "max_sessions",
    ];
    const fields: string[] = [];
    const params: Record<string, unknown> = { $id: id };

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && ALLOWED_COLUMNS.includes(key)) {
        fields.push(`${key} = $${key}`);
        params[`$${key}`] = value;
      }
    }

    if (fields.length === 0) {
      return this.getByIdOrThrow(id);
    }

    fields.push("updated_at = $updated_at");
    params.$updated_at = new Date().toISOString();

    execute(`UPDATE projects SET ${fields.join(", ")} WHERE id = $id`, params);

    log.info("Project updated", { id });
    return this.getByIdOrThrow(id);
  },

  delete(id: string): void {
    this.getByIdOrThrow(id);
    execute("DELETE FROM projects WHERE id = $id", { $id: id });
    log.info("Project deleted", { id });
  },

  // ── Discovery ──

  discover(folderPath: string): DiscoveredProject[] {
    const absPath = resolve(folderPath);
    if (!existsSync(absPath)) {
      throw new ValidationError(`Path does not exist: ${folderPath}`);
    }

    const importedPaths = getImportedPaths();
    const results: DiscoveredProject[] = [];

    this._scanDir(absPath, config.scanDepth, importedPaths, results);

    return results;
  },

  _scanDir(dir: string, depth: number, importedPaths: Set<string>, results: DiscoveredProject[]) {
    if (depth < 0) return;

    // Check if this directory itself is a project
    if (hasProjectMarker(dir) || existsSync(join(dir, ".claude"))) {
      const projectType = detectProjectType(dir);
      const { has_history, session_count } = inspectClaudeHistory(dir);

      results.push({
        folder_path: dir,
        name: humanizeFolderName(basename(dir)),
        has_claude_history: has_history,
        session_count,
        project_type: projectType,
        already_imported: importedPaths.has(normalizePath(dir)),
      });
    }

    // Recurse into subdirectories
    if (depth > 0) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          // Skip hidden dirs, node_modules, target, etc.
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "target" || entry.name === "__pycache__" || entry.name === "dist" || entry.name === "build") continue;
          this._scanDir(join(dir, entry.name), depth - 1, importedPaths, results);
        }
      } catch {
        // Permission denied, etc.
      }
    }
  },

  // ── Import ──

  importProject(input: ImportProjectInput): Project {
    const absPath = resolve(input.folder_path);
    if (!existsSync(absPath)) {
      throw new ValidationError(`Folder does not exist: ${input.folder_path}`);
    }

    // Check if already imported
    const existing = queryOne<Project>(
      "SELECT * FROM projects WHERE LOWER(REPLACE(folder_path, '\\', '/')) = $path",
      { $path: normalizePath(absPath) },
    );
    if (existing) {
      throw new ConflictError(`Project already exists for path: ${absPath}`);
    }

    const name = input.name?.trim() || humanizeFolderName(basename(absPath));
    const projectType = detectProjectType(absPath);
    const { has_history, session_count } = inspectClaudeHistory(absPath);

    const id = generateId();
    const now = new Date().toISOString();

    execute(
      `INSERT INTO projects (id, name, description, folder_path, system_prompt, append_system_prompt, default_model, default_permission_mode, max_sessions, source, project_type, has_claude_history, created_at, updated_at)
       VALUES ($id, $name, $description, $folder_path, $system_prompt, $append_system_prompt, $default_model, $default_permission_mode, $max_sessions, $source, $project_type, $has_claude_history, $created_at, $updated_at)`,
      {
        $id: id,
        $name: name,
        $description: "",
        $folder_path: absPath,
        $system_prompt: "",
        $append_system_prompt: "",
        $default_model: "",
        $default_permission_mode: "default",
        $max_sessions: 5,
        $source: "imported",
        $project_type: projectType,
        $has_claude_history: has_history ? 1 : 0,
        $created_at: now,
        $updated_at: now,
      },
    );

    // Import existing Claude Code session IDs so they can be resumed
    if (input.import_sessions && has_history) {
      const sessionIds = findClaudeSessionIds(absPath);
      for (const cliSessionId of sessionIds) {
        const sessionId = generateId();
        execute(
          `INSERT INTO sessions (id, project_id, session_id, name, status, created_at, last_active_at, closed_at)
           VALUES ($id, $project_id, $session_id, $name, 'closed', $created_at, $last_active_at, $closed_at)`,
          {
            $id: sessionId,
            $project_id: id,
            $session_id: cliSessionId,
            $name: `Imported ${humanizeFolderName(basename(absPath))} #${sessionIds.indexOf(cliSessionId) + 1}`,
            $created_at: now,
            $last_active_at: now,
            $closed_at: now,
          },
        );
      }
      log.info("Imported sessions", { project_id: id, count: sessionIds.length });
    }

    log.info("Project imported", { id, name, path: absPath, type: projectType });
    return this.getById(id)!;
  },

  // ── Browse Folders ──

  browse(folderPath?: string): BrowseEntry[] {
    const dir = resolve(folderPath || config.projectRoot || "");
    if (!existsSync(dir)) {
      throw new ValidationError(`Path does not exist: ${dir}`);
    }

    const importedPaths = getImportedPaths();
    const entries: BrowseEntry[] = [];

    try {
      const dirEntries = readdirSync(dir, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (!entry.isDirectory()) continue;
        // Skip hidden directories
        if (entry.name.startsWith(".")) continue;

        const fullPath = join(dir, entry.name);
        const projectType = detectProjectType(fullPath);
        const isProject = hasProjectMarker(fullPath) || existsSync(join(fullPath, ".claude"));
        const { has_history, session_count } = inspectClaudeHistory(fullPath);

        entries.push({
          name: entry.name,
          path: fullPath,
          has_claude_history: has_history,
          session_count,
          project_type: projectType,
          is_project: isProject,
          already_imported: importedPaths.has(normalizePath(fullPath)),
        });
      }
    } catch {
      // Permission denied
    }

    // Sort: projects first, then alphabetical
    entries.sort((a, b) => {
      if (a.is_project !== b.is_project) return a.is_project ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  },
};

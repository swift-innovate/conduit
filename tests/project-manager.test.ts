// Project manager tests

import "./setup.js";

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { testTmpDir } from "./setup.js";

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { initDatabase, execute } from "../src/db/database";
import { projectManager } from "../src/core/project-manager";
import { ValidationError, NotFoundError, ConflictError } from "../src/utils/errors";

initDatabase();

// Create temp project folders within the test temp dir
const projectFolderA = join(testTmpDir, "project-a");
const projectFolderB = join(testTmpDir, "project-b");
const nodeProjectFolder = join(testTmpDir, "node-project");
const pythonProjectFolder = join(testTmpDir, "python-project");
const rustProjectFolder = join(testTmpDir, "rust-project");
const goProjectFolder = join(testTmpDir, "go-project");

mkdirSync(projectFolderA, { recursive: true });
mkdirSync(projectFolderB, { recursive: true });
mkdirSync(nodeProjectFolder, { recursive: true });
mkdirSync(pythonProjectFolder, { recursive: true });
mkdirSync(rustProjectFolder, { recursive: true });
mkdirSync(goProjectFolder, { recursive: true });

// Add marker files for type detection
writeFileSync(join(nodeProjectFolder, "package.json"), "{}");
writeFileSync(join(pythonProjectFolder, "pyproject.toml"), "");
writeFileSync(join(rustProjectFolder, "Cargo.toml"), "");
writeFileSync(join(goProjectFolder, "go.mod"), "");

beforeEach(() => {
  execute("DELETE FROM permission_log", {});
  execute("DELETE FROM permission_rules", {});
  execute("DELETE FROM messages", {});
  execute("DELETE FROM sessions", {});
  execute("DELETE FROM projects", {});
});

describe("Project CRUD", () => {
  it("should create a project", () => {
    const project = projectManager.create({
      name: "Test Project",
      folder_path: projectFolderA,
    });

    assert.ok(project.id);
    assert.equal(project.name, "Test Project");
    assert.equal(project.folder_path, projectFolderA);
    assert.equal(project.source, "created");
    assert.ok(project.created_at);
  });

  it("should reject empty name", () => {
    assert.throws(
      () => projectManager.create({ name: "", folder_path: projectFolderA }),
      (err: any) => err instanceof ValidationError,
    );
  });

  it("should reject empty folder_path", () => {
    assert.throws(
      () => projectManager.create({ name: "Test", folder_path: "" }),
      (err: any) => err instanceof ValidationError,
    );
  });

  it("should reject non-existent folder_path", () => {
    assert.throws(
      () => projectManager.create({ name: "Test", folder_path: "/nonexistent/path/xyz" }),
      (err: any) => err instanceof ValidationError,
    );
  });

  it("should get project by ID", () => {
    const created = projectManager.create({
      name: "Lookup Test",
      folder_path: projectFolderA,
    });

    const found = projectManager.getById(created.id);
    assert.ok(found);
    assert.equal(found!.id, created.id);
    assert.equal(found!.name, "Lookup Test");
  });

  it("should return null for non-existent ID", () => {
    const found = projectManager.getById("nonexistent-id");
    assert.equal(found, null);
  });

  it("should throw for getByIdOrThrow with non-existent ID", () => {
    assert.throws(
      () => projectManager.getByIdOrThrow("nonexistent-id"),
      (err: any) => err instanceof NotFoundError,
    );
  });

  it("should list all projects", () => {
    projectManager.create({ name: "Project A", folder_path: projectFolderA });
    projectManager.create({ name: "Project B", folder_path: projectFolderB });

    const projects = projectManager.list();
    assert.equal(projects.length, 2);
  });

  it("should update a project", () => {
    const created = projectManager.create({
      name: "Before Update",
      folder_path: projectFolderA,
    });

    const updated = projectManager.update(created.id, {
      name: "After Update",
      description: "A new description",
    });

    assert.equal(updated.name, "After Update");
    assert.equal(updated.description, "A new description");
  });

  it("should reject update of non-existent folder_path", () => {
    const created = projectManager.create({
      name: "Test",
      folder_path: projectFolderA,
    });

    assert.throws(
      () => projectManager.update(created.id, { folder_path: "/nonexistent/xyz" }),
      (err: any) => err instanceof ValidationError,
    );
  });

  it("should ignore non-allowed columns in update", () => {
    const created = projectManager.create({
      name: "Test",
      folder_path: projectFolderA,
    });

    const updated = projectManager.update(created.id, {
      name: "Updated Name",
      // @ts-expect-error - testing injection prevention
      id: "hacked-id",
      // @ts-expect-error
      source: "hacked",
    } as any);

    assert.equal(updated.id, created.id);
    assert.equal(updated.name, "Updated Name");
    assert.equal(updated.source, "created");
  });

  it("should return unchanged project when no fields provided", () => {
    const created = projectManager.create({
      name: "Test",
      folder_path: projectFolderA,
    });

    const updated = projectManager.update(created.id, {});
    assert.equal(updated.name, "Test");
  });

  it("should delete a project", () => {
    const created = projectManager.create({
      name: "To Delete",
      folder_path: projectFolderA,
    });

    projectManager.delete(created.id);

    const found = projectManager.getById(created.id);
    assert.equal(found, null);
  });

  it("should throw when deleting non-existent project", () => {
    assert.throws(
      () => projectManager.delete("nonexistent-id"),
      (err: any) => err instanceof NotFoundError,
    );
  });
});

describe("Project Type Detection", () => {
  it("should detect node project type from package.json", () => {
    const project = projectManager.create({
      name: "Node Project",
      folder_path: nodeProjectFolder,
    });
    assert.equal(project.project_type, "node");
  });

  it("should detect python project type from pyproject.toml", () => {
    const project = projectManager.create({
      name: "Python Project",
      folder_path: pythonProjectFolder,
    });
    assert.equal(project.project_type, "python");
  });

  it("should detect rust project type from Cargo.toml", () => {
    const project = projectManager.create({
      name: "Rust Project",
      folder_path: rustProjectFolder,
    });
    assert.equal(project.project_type, "rust");
  });

  it("should detect go project type from go.mod", () => {
    const project = projectManager.create({
      name: "Go Project",
      folder_path: goProjectFolder,
    });
    assert.equal(project.project_type, "go");
  });

  it("should default to generic project type", () => {
    const project = projectManager.create({
      name: "Generic Project",
      folder_path: projectFolderA,
    });
    assert.equal(project.project_type, "generic");
  });
});

describe("Project Import", () => {
  it("should import a project folder", () => {
    const project = projectManager.importProject({
      folder_path: nodeProjectFolder,
    });

    assert.ok(project.id);
    assert.equal(project.source, "imported");
    assert.equal(project.project_type, "node");
    assert.ok(project.name.length > 0);
  });

  it("should reject importing non-existent folder", () => {
    assert.throws(
      () => projectManager.importProject({ folder_path: "/nonexistent/path/xyz" }),
      (err: any) => err instanceof ValidationError,
    );
  });

  it("should reject duplicate import of same path", () => {
    projectManager.importProject({ folder_path: pythonProjectFolder });

    assert.throws(
      () => projectManager.importProject({ folder_path: pythonProjectFolder }),
      (err: any) => err instanceof ConflictError,
    );
  });

  it("should use provided name when importing", () => {
    const project = projectManager.importProject({
      folder_path: rustProjectFolder,
      name: "My Rust App",
    });
    assert.equal(project.name, "My Rust App");
  });
});

describe("Project Discovery", () => {
  it("should discover projects in a directory", () => {
    const discovered = projectManager.discover(testTmpDir);
    const nodeProjResult = discovered.find((d) => d.folder_path === nodeProjectFolder);
    assert.ok(nodeProjResult, "Should discover node project");
    assert.equal(nodeProjResult!.project_type, "node");
  });

  it("should mark already-imported projects", () => {
    projectManager.importProject({ folder_path: goProjectFolder });

    const discovered = projectManager.discover(testTmpDir);
    const goProjResult = discovered.find((d) => d.folder_path === goProjectFolder);
    assert.ok(goProjResult);
    assert.equal(goProjResult!.already_imported, true);
  });

  it("should throw for non-existent path", () => {
    assert.throws(
      () => projectManager.discover("/nonexistent/path/xyz"),
      (err: any) => err instanceof ValidationError,
    );
  });
});

describe("Folder Browsing", () => {
  it("should list directories in a folder", () => {
    const entries = projectManager.browse(testTmpDir);
    assert.ok(entries.length > 0);
    for (const entry of entries) {
      assert.ok(entry.name);
      assert.ok(entry.path);
      assert.equal(typeof entry.is_project, "boolean");
      assert.equal(typeof entry.already_imported, "boolean");
    }
  });

  it("should throw for non-existent path", () => {
    assert.throws(
      () => projectManager.browse("/nonexistent/path/xyz"),
      (err: any) => err instanceof ValidationError,
    );
  });
});

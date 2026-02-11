import { useEffect } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "./stores/app-store";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ProjectList } from "./components/projects/ProjectList";
import { FolderBrowser } from "./components/projects/FolderBrowser";

export function App() {
  const { loadProjects, loadHealth } = useAppStore();

  useEffect(() => {
    loadProjects();
    loadHealth();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/import" element={<ImportPage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
    </Routes>
  );
}

// ── Page wrapper components ──

function DashboardPage() {
  const navigate = useNavigate();
  const { selectProject } = useAppStore();

  const handleSelectProject = (projectId: string) => {
    selectProject(projectId);
    navigate(`/projects/${projectId}`);
  };

  return (
    <Layout>
      <Dashboard onSelectProject={handleSelectProject} />
    </Layout>
  );
}

function ImportPage() {
  const navigate = useNavigate();
  const { selectProject, loadProjects } = useAppStore();

  const handleImport = (project: any) => {
    loadProjects();
    selectProject(project.id);
    navigate(`/projects/${project.id}`);
  };

  const handleClose = () => {
    navigate("/");
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Import Existing Project</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Browse your filesystem to find and import existing projects
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card">
          <FolderBrowser onImport={handleImport} onClose={handleClose} />
        </div>
      </div>
    </Layout>
  );
}

function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { selectProject, selectedProjectId } = useAppStore();

  useEffect(() => {
    if (projectId && projectId !== selectedProjectId) {
      selectProject(projectId);
    }
  }, [projectId, selectedProjectId, selectProject]);

  if (!projectId) return null;

  return (
    <Layout>
      <ProjectList projectId={projectId} />
    </Layout>
  );
}

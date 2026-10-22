"use client";

import type { GeneProject } from "../lib/types";
import { projectCoverDataUrl } from "../lib/project-cover.mjs";

type Props = {
  projects: GeneProject[];
  currentProjectId: string;
  onOpen: (project: GeneProject) => void;
  onCreate: () => void;
};

function engineLabel(project: GeneProject) {
  const engine = project.plan?.engine || project.preferredEngine || (project.kind === "app" ? "webapp" : "canvas2d");
  return engine === "webgl3d" ? "3D game" : engine === "canvas2d" ? "2D game" : project.projectIntent === "website" ? "Website" : "Web app";
}
function projectStatus(project: GeneProject) {
  if (project.buildRun?.status === "running" || project.buildRun?.status === "planning" || project.buildRun?.status === "recovering") return "In progress";
  if (project.buildRun?.status === "paused") return "Paused";
  if (project.buildRun?.status === "needs-input") return "Needs attention";
  if (project.buildRun?.status === "failed") return "Build failed";
  if (Object.keys(project.files || {}).length) return "Project saved";
  return "Design in progress";
}

export default function ProjectGallery({ projects, currentProjectId, onOpen, onCreate }: Props) {
  const ordered = [...projects].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return (
    <div className="tool-view project-library">
      <div className="tool-view-heading project-library-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE</div>
          <h2>Projects</h2>
          <p>Open a saved game or app, continue its work, and preview the latest saved source.</p>
        </div>
        <button type="button" className="primary-button" onClick={onCreate}>＋ New project</button>
      </div>
      {ordered.length === 0 ? <div className="empty-state">Your projects will appear here when you create one.</div> :
        <div className="project-library-grid">
          {ordered.map(project => {
            const savedCover = project.files?.["assets/project-cover.svg"];
            const cover = typeof savedCover === "string" && savedCover.trim().startsWith("<svg")
              ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(savedCover)
              : projectCoverDataUrl({
                  name: project.plan?.title || project.name,
                  kind: project.kind,
                  engine: project.plan?.engine || project.preferredEngine,
                  prompt: project.initialPrompt,
                  files: project.files,
                  plan: project.plan
                });
            return (
              <button
                type="button"
                key={project.id}
                className={"project-library-card" + (project.id === currentProjectId ? " current" : "")}
                onClick={() => onOpen(project)}
                aria-label={"Open " + (project.name || "untitled project")}
              >
                <span className="project-library-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover} alt={project.name + " generated cover"} loading="lazy" />
                  {project.id === currentProjectId && <span className="project-library-current">CURRENT</span>}
                </span>
                <span className="project-library-card-body">
                  <strong title={project.name}>{project.name || "Untitled project"}</strong>
                  <span className="project-library-meta">{engineLabel(project)} <span aria-hidden="true">·</span> {Object.keys(project.files || {}).length} files</span>
                  <span className="project-library-footer"><span>{projectStatus(project)}</span><time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleDateString()}</time></span>
                </span>
              </button>
            );
          })}
        </div>
      }
    </div>
  );
}

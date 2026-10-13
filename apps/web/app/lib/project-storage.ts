import type { GeneProject } from "./types";

export type ProjectStorageStrategy = "full" | "trim-history" | "active-project" | "active-project-minimal";
export type ProjectStorageCandidate = { strategy: ProjectStorageStrategy; projects: GeneProject[] };

function compactProject(project: GeneProject, options: {
  versionCount: number;
  messageCount: number;
  referenceCount: number;
  checkpointCount: number;
  stripImagePayloads?: boolean;
}): GeneProject {
  const references = (project.references ?? []).slice(-options.referenceCount).map(reference => {
    if (options.stripImagePayloads && reference.kind === "image") {
      const { dataBase64: _discardedPayload, ...metadata } = reference;
      return metadata;
    }
    return reference;
  });
  const buildRun = project.buildRun ? {
    ...project.buildRun,
    checkpoints: project.buildRun.checkpoints.slice(-options.checkpointCount)
  } : project.buildRun;
  return {
    ...project,
    messages: project.messages.slice(-options.messageCount),
    versions: project.versions.slice(0, options.versionCount),
    references,
    buildRun
  };
}

/**
 * Ordered storage fallbacks. Always keep the current source files; progressively
 * prune old history and inactive projects rather than silently failing to save.
 */
export function buildProjectStorageCandidates(projects: GeneProject[]): ProjectStorageCandidate[] {
  const ordered = projects.slice(0, 8);
  const active = ordered[0];
  if (!active) return [{ strategy: "full", projects: [] }];
  return [
    { strategy: "full", projects: ordered },
    {
      strategy: "trim-history",
      projects: ordered.slice(0, 5).map((project, index) => compactProject(project, {
        versionCount: index === 0 ? 2 : 1,
        messageCount: index === 0 ? 80 : 24,
        referenceCount: index === 0 ? 8 : 3,
        checkpointCount: index === 0 ? 2 : 0,
        stripImagePayloads: index > 0
      }))
    },
    {
      strategy: "active-project",
      projects: [compactProject(active, {
        versionCount: 1, messageCount: 40, referenceCount: 4, checkpointCount: 1, stripImagePayloads: true
      })]
    },
    {
      strategy: "active-project-minimal",
      projects: [compactProject(active, {
        versionCount: 0, messageCount: 25, referenceCount: 4, checkpointCount: 0, stripImagePayloads: true
      })]
    }
  ];
}

import type { SessionInfo } from "@opencode/client/promise"
import type { LocalProject } from "@/shell/state/layout"
import { displayName } from "@opencode/ui/project-avatar"
import { compareSessionTime } from "@/shell/layout/helpers"
import { pathKey } from "@/workspaces/path-key"
import { getFilename } from "@opencode/util/path"

export type HomeSessionRecord = {
  session: SessionInfo
  project: LocalProject
  projectName: string
}

export function homeSessionLocation(directory: string, branch?: string) {
  return { worktree: getFilename(directory) || directory, branch }
}

export function buildHomeSessionRecords(input: {
  sessions: () => SessionInfo[]
  projectDirectories: () => string[] | undefined
  projects: () => LocalProject[]
  resolveProject?: (session: SessionInfo) => LocalProject | undefined
}) {
  const selected = input.projectDirectories()
  const directories = selected ? new Set(selected.map(pathKey)) : undefined

  const sessions = directories
    ? input.sessions().filter((session) => directories.has(pathKey(session.location.directory)))
    : input.sessions()

  // Every session in a directory resolves to the same project, and a project can hold thousands of sessions.
  // Resolve each (project, directory) pair once instead of walking the project list per session.
  const byDirectory = new Map<string, LocalProject>()
  const byID = new Map<string, LocalProject>()

  for (const project of input.projects()) {
    const root = pathKey(project.worktree)

    if (!byDirectory.has(root)) byDirectory.set(root, project)

    for (const sandbox of project.sandboxes ?? []) {
      const key = pathKey(sandbox)

      if (!byDirectory.has(key)) byDirectory.set(key, project)
    }

    if (project.id && !byID.has(project.id)) byID.set(project.id, project)
  }

  const resolved = new Map<string, LocalProject>()

  return [...new Map(sessions.map((session) => [session.id, session] as const)).values()]
    .sort(compareSessionTime)
    .map((session) => {
      const key = `${session.projectID}\0${pathKey(session.location.directory)}`
      const known = resolved.get(key)

      if (known) return { session, project: known, projectName: displayName(known) }

      const project = input.resolveProject?.(session) ??
        byDirectory.get(pathKey(session.location.directory)) ??
        byID.get(session.projectID) ?? {
          id: session.projectID,
          worktree: session.location.directory,
        }

      resolved.set(key, project)

      return { session, project, projectName: displayName(project) }
    })
}

// Worktree inventories load on demand, so a worktree session may not match any directory yet;
// the session's project ID still identifies its added project.
export function homeProjectForSession<T extends { id?: string; worktree: string; sandboxes?: readonly string[] }>(
  session: SessionInfo,
  projects: readonly T[],
) {
  const directory = pathKey(session.location.directory)

  return (
    projects.find(
      (item) =>
        pathKey(item.worktree) === directory || item.sandboxes?.some((sandbox) => pathKey(sandbox) === directory),
    ) ?? projects.find((item) => item.id === session.projectID)
  )
}

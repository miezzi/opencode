import { displayName } from "@opencode/ui/project-avatar"
import { containsDirectory, sameDirectory } from "@opencode/util/path"
import type { HomeSessionRecord } from "@/home/sessions/records"
import type { LocalProject } from "@/shell/state/layout"
import { pathKey } from "@/workspaces/path-key"

/** Sessions listed under a worktree before the "show more" row appears. */
export const SIDEBAR_SESSION_PAGE = 10

export type SidebarWorktree = {
  key: string
  directory: string
  /** Directory name, used when the branch is not known yet. */
  name: string
  main: boolean
  /** Every known session in this directory, newest first. */
  sessions: HomeSessionRecord[]
  updated: number
}

export type SidebarProject = {
  key: string
  project: LocalProject
  name: string
  total: number
  updated: number
  worktrees: SidebarWorktree[]
}

const timestamp = (record: HomeSessionRecord) => record.session.time.updated ?? record.session.time.created

function basename(directory: string) {
  const trimmed = directory.replace(/[/\\]+$/, "")

  return trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1) || directory
}

/** The project root plus every worktree directory the app knows about, deduplicated. */
export function projectDirectories(project: LocalProject) {
  const directories = [
    project.worktree,
    ...(project.sandboxes ?? []),
    ...(project.worktrees ?? []).map((item) => item.directory),
  ]

  return [...new Map(directories.map((directory) => [pathKey(directory), directory] as const)).values()]
}

/**
 * The session's directory can sit inside a worktree (a monorepo subpath, for example). The worktree wins over
 * the project root, and a directory the inventory does not know yet becomes its own group instead of silently
 * landing under "main".
 */
export function worktreeForSession(directory: string, directories: readonly string[]) {
  const [root, ...worktrees] = directories
  const exact = directories.find((candidate) => pathKey(candidate) === pathKey(directory))

  if (exact) return exact

  const enclosing = worktrees
    .filter((candidate) => containsDirectory(candidate, directory))
    .toSorted((a, b) => pathKey(b).length - pathKey(a).length)[0]

  if (enclosing) return enclosing

  // With the inventory loaded, anything else inside the project is a subdirectory of the root worktree.
  if (worktrees.length > 0 && root && containsDirectory(root, directory)) return root

  return directory
}

/**
 * Builds the sidebar tree: project -> worktree -> sessions. Projects keep the order the user set on Home
 * (projects without sessions stay selectable), worktrees sort main first and then by most recent activity.
 */
export function groupSidebarProjects(input: {
  projects: readonly LocalProject[]
  records: readonly HomeSessionRecord[]
}): SidebarProject[] {
  type Bucket = SidebarProject & { directories: readonly string[]; known: Set<string> | undefined }

  const buckets = new Map<string, Bucket>()

  const bucketFor = (project: LocalProject) => {
    const key = pathKey(project.worktree)
    const existing = buckets.get(key)

    if (existing) return existing

    const directories = projectDirectories(project)

    const created: Bucket = {
      key,
      project,
      name: displayName(project),
      total: 0,
      updated: 0,
      worktrees: [],
      directories,
      // The inventory is only authoritative once it loaded; before that, sessions are grouped by their own
      // directory. Afterwards a directory the inventory does not list is a worktree removed from disk.
      known: project.worktrees === undefined ? undefined : new Set(directories.map((directory) => pathKey(directory))),
    }

    buckets.set(key, created)

    return created
  }

  input.projects.forEach(bucketFor)

  for (const record of input.records) {
    const bucket = bucketFor(record.project)
    const directory = worktreeForSession(record.session.location.directory, bucket.directories)

    if (bucket.known && !bucket.known.has(pathKey(directory))) continue

    const key = pathKey(directory)
    let worktree = bucket.worktrees.find((item) => item.key === key)

    if (!worktree) {
      worktree = {
        key,
        directory,
        name: basename(directory),
        main: sameDirectory(directory, bucket.project.worktree),
        sessions: [],
        updated: 0,
      }
      bucket.worktrees.push(worktree)
    }

    worktree.sessions.push(record)
    worktree.updated = Math.max(worktree.updated, timestamp(record))
    bucket.total++
    bucket.updated = Math.max(bucket.updated, timestamp(record))
  }

  return [...buckets.values()].map((bucket) => {
    // The root worktree is always offered once the project has sessions, so a session can start on main
    // even while every existing session lives in a worktree.
    if (bucket.total > 0 && !bucket.worktrees.some((worktree) => worktree.main)) {
      bucket.worktrees.push({
        key: pathKey(bucket.project.worktree),
        directory: bucket.project.worktree,
        name: basename(bucket.project.worktree),
        main: true,
        sessions: [],
        updated: 0,
      })
    }

    return {
      key: bucket.key,
      project: bucket.project,
      name: bucket.name,
      total: bucket.total,
      updated: bucket.updated,
      worktrees: bucket.worktrees
        .map((worktree) => ({
          ...worktree,
          sessions: worktree.sessions.toSorted((a, b) => timestamp(b) - timestamp(a)),
        }))
        .toSorted((a, b) => Number(b.main) - Number(a.main) || b.updated - a.updated || a.name.localeCompare(b.name)),
    }
  })
}

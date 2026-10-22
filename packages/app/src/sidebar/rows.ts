import type { HomeSessionRecord } from "@/home/sessions/records"
import type { SidebarProject, SidebarWorktree } from "./group"

export type SidebarProjectRow = {
  kind: "project"
  key: string
  level: 0
  project: SidebarProject
  expanded: boolean
  parent?: undefined
}

export type SidebarWorktreeRow = {
  kind: "worktree"
  key: string
  level: 1
  parent: string
  worktree: SidebarWorktree
  expanded: boolean
}

export type SidebarSessionRow = {
  kind: "session"
  key: string
  level: 2
  parent: string
  record: HomeSessionRecord
}

export type SidebarMoreRow = {
  kind: "more"
  key: string
  level: 2
  parent: string
  worktree: SidebarWorktree
}

export type SidebarHiddenRow = {
  kind: "hidden"
  key: string
  level: 1
  parent: string
  project: SidebarProject
  count: number
}

export type SidebarHiddenProjectsRow = {
  kind: "hidden-projects"
  key: "hidden:projects"
  level: 0
  count: number
}

export type SidebarRow =
  | SidebarProjectRow
  | SidebarWorktreeRow
  | SidebarSessionRow
  | SidebarMoreRow
  | SidebarHiddenRow
  | SidebarHiddenProjectsRow

/**
 * The visible rows, in the order they render. Keyboard navigation walks this list, so it must mirror the
 * tree exactly: collapsed projects and worktrees hide their children.
 */
export function sidebarRows(input: {
  projects: readonly SidebarProject[]
  expandedProject: (key: string) => boolean
  expandedWorktree: (key: string) => boolean
  limit: (key: string) => number
  hiddenCount: (key: string) => number
  pinned: (id: string) => boolean
  hiddenProjects?: number
}): SidebarRow[] {
  const rows: SidebarRow[] = []

  for (const project of input.projects) {
    const projectKey = `p:${project.key}`
    const hidden = input.hiddenCount(project.key)
    const projectExpanded = (project.total > 0 || hidden > 0) && input.expandedProject(project.key)
    rows.push({ kind: "project", key: projectKey, level: 0, project, expanded: projectExpanded })

    if (!projectExpanded) continue

    for (const worktree of project.worktrees) {
      const worktreeKey = `w:${worktree.key}`
      const worktreeExpanded = input.expandedWorktree(worktree.key)
      rows.push({
        kind: "worktree",
        key: worktreeKey,
        level: 1,
        parent: projectKey,
        worktree,
        expanded: worktreeExpanded,
      })

      if (!worktreeExpanded) continue

      const limit = input.limit(worktree.key)
      const pinned = worktree.sessions.filter((record) => input.pinned(record.session.id))
      const rest = worktree.sessions.filter((record) => !input.pinned(record.session.id))
      const visible = rest.slice(0, limit)

      for (const record of [...pinned, ...visible]) {
        rows.push({ kind: "session", key: `s:${record.session.id}`, level: 2, parent: worktreeKey, record })
      }

      if (rest.length > visible.length) {
        rows.push({ kind: "more", key: `m:${worktree.key}`, level: 2, parent: worktreeKey, worktree })
      }
    }

    if (hidden > 0) {
      rows.push({ kind: "hidden", key: `h:${project.key}`, level: 1, parent: projectKey, project, count: hidden })
    }
  }

  if ((input.hiddenProjects ?? 0) > 0) {
    rows.push({ kind: "hidden-projects", key: "hidden:projects", level: 0, count: input.hiddenProjects ?? 0 })
  }

  return rows
}

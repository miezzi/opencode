import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import type { HomeSessionRecord } from "@/home/sessions/records"
import type { LocalProject } from "@/shell/state/layout"
import type { SidebarProject, SidebarWorktree } from "./group"
import { sidebarRows } from "./rows"

const localProject = (worktree: string) => ({ id: "p", worktree }) satisfies LocalProject

const record = (id: string): HomeSessionRecord => {
  // SAFETY: the row builder only reads the id, title, location and time of the session.
  const session = {
    id,
    title: id,
    location: { directory: "/repo/app" },
    time: { created: 1, updated: 1 },
  } as SessionInfo

  return { session, project: localProject("/repo/app"), projectName: "app" }
}

const worktree = (key: string, sessions: HomeSessionRecord[], main = false): SidebarWorktree => ({
  key,
  directory: `/repo/app/${key}`,
  name: key,
  main,
  sessions,
  updated: 1,
})

const project = (worktrees: SidebarWorktree[], total: number): SidebarProject => ({
  key: "/repo/app",
  project: localProject("/repo/app"),
  name: "app",
  total,
  updated: 1,
  worktrees,
})

const base = {
  expandedProject: () => false,
  expandedWorktree: () => false,
  limit: () => 10,
  hiddenCount: () => 0,
  pinned: () => false,
}

describe("sidebarRows", () => {
  test("a collapsed project hides its worktrees", () => {
    const rows = sidebarRows({ ...base, projects: [project([worktree("main", [record("a")], true)], 1)] })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: "project", level: 0, expanded: false })
  })

  test("an expanded project lists its worktrees, but not their sessions", () => {
    const rows = sidebarRows({
      ...base,
      expandedProject: () => true,
      projects: [project([worktree("main", [record("a")], true)], 1)],
    })

    expect(rows.map((row) => [row.kind, row.level])).toEqual([
      ["project", 0],
      ["worktree", 1],
    ])
    expect(rows[1]).toMatchObject({ parent: "p:/repo/app" })
  })

  test("an expanded worktree lists its sessions and links each one to the worktree", () => {
    const rows = sidebarRows({
      ...base,
      expandedProject: () => true,
      expandedWorktree: () => true,
      projects: [project([worktree("main", [record("a"), record("b")], true)], 2)],
    })

    expect(rows.map((row) => row.kind)).toEqual(["project", "worktree", "session", "session"])
    expect(rows[2]).toMatchObject({ key: "s:a", parent: "w:main", level: 2 })
  })

  test("past the limit the worktree gets a more row", () => {
    const rows = sidebarRows({
      ...base,
      expandedProject: () => true,
      expandedWorktree: () => true,
      limit: () => 1,
      projects: [project([worktree("main", [record("a"), record("b")], true)], 2)],
    })

    expect(rows.map((row) => row.kind)).toEqual(["project", "worktree", "session", "more"])
    expect(rows[3]).toMatchObject({ key: "m:main", parent: "w:main" })
  })

  test("an expanded project with hidden rows lists the restore row", () => {
    const rows = sidebarRows({
      ...base,
      expandedProject: () => true,
      hiddenCount: () => 2,
      projects: [project([], 0)],
    })

    expect(rows.map((row) => row.kind)).toEqual(["project", "hidden"])
    expect(rows[1]).toMatchObject({ key: "h:/repo/app", parent: "p:/repo/app", count: 2 })
  })

  test("lists hidden projects as a root row", () => {
    const rows = sidebarRows({ ...base, hiddenProjects: 2, projects: [] })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: "hidden-projects", level: 0, count: 2 })
  })

  test("pinned sessions come first while the limit only pages the rest", () => {
    const rows = sidebarRows({
      ...base,
      expandedProject: () => true,
      expandedWorktree: () => true,
      limit: () => 1,
      pinned: (id) => id === "pinned",
      projects: [project([worktree("main", [record("fresh"), record("pinned"), record("old")], true)], 3)],
    })

    expect(rows.filter((row) => row.kind === "session").map((row) => row.key)).toEqual(["s:pinned", "s:fresh"])
    expect(rows.filter((row) => row.kind === "more")).toHaveLength(1)
  })

  test("keys stay unique when the root worktree shares the project directory", () => {
    const rows = sidebarRows({
      ...base,
      expandedProject: () => true,
      expandedWorktree: () => true,
      projects: [project([worktree("/repo/app", [record("a")], true)], 1)],
    })

    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})

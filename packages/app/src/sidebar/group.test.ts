import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import type { HomeSessionRecord } from "@/home/sessions/records"
import type { LocalProject } from "@/shell/state/layout"
import { groupSidebarProjects } from "./group"

// SAFETY: the grouping code only reads the project fields the fixture sets.
const project = (id: string, worktree: string, sandboxes: string[] = []) =>
  ({ id, worktree, sandboxes }) as LocalProject

// SAFETY: the grouping code only reads the session fields the fixture sets.
const record = (id: string, directory: string, owner: LocalProject, updated = 1) =>
  ({
    session: {
      id,
      projectID: owner.id,
      title: id,
      location: { directory },
      time: { created: updated, updated },
    } as SessionInfo,
    project: owner,
    projectName: owner.id ?? owner.worktree,
  }) satisfies HomeSessionRecord

describe("groupSidebarProjects", () => {
  test("splits a project into its main worktree and its worktrees", () => {
    const app = project("p", "/repo/app", ["/repo/app/.worktrees/crisp-cactus"])

    const groups = groupSidebarProjects({
      projects: [app],
      records: [record("main", "/repo/app", app, 10), record("feature", "/repo/app/.worktrees/crisp-cactus", app, 20)],
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.total).toBe(2)
    expect(groups[0]?.worktrees.map((worktree) => [worktree.name, worktree.main, worktree.sessions.length])).toEqual([
      ["app", true, 1],
      ["crisp-cactus", false, 1],
    ])
  })

  test("finds a worktree the inventory has not loaded yet", () => {
    const app = project("p", "/repo/app")

    const groups = groupSidebarProjects({
      projects: [app],
      records: [record("feature", "/repo/app/.worktrees/quiet-otter", app)],
    })

    expect(groups[0]?.worktrees).toHaveLength(2)
    expect(groups[0]?.worktrees[1]?.directory).toBe("/repo/app/.worktrees/quiet-otter")
    expect(groups[0]?.worktrees[1]?.main).toBe(false)
  })

  test("keeps a session in a monorepo subpath inside its worktree", () => {
    const app = project("p", "/repo/app", ["/repo/app/.worktrees/feat"])

    const groups = groupSidebarProjects({
      projects: [app],
      records: [record("nested", "/repo/app/.worktrees/feat/packages/web", app)],
    })

    expect(groups[0]?.worktrees.map((worktree) => worktree.directory)).toEqual([
      "/repo/app",
      "/repo/app/.worktrees/feat",
    ])
  })

  test("keeps a subdirectory of the root worktree under main once the inventory is loaded", () => {
    const app = project("p", "/repo/app", ["/repo/app/.worktrees/feat"])

    const groups = groupSidebarProjects({
      projects: [app],
      records: [record("nested", "/repo/app/packages/web", app)],
    })

    expect(groups[0]?.worktrees.map((worktree) => [worktree.directory, worktree.main])).toEqual([["/repo/app", true]])
  })

  test("orders main first and the rest by most recent session", () => {
    const app = project("p", "/repo/one", ["/repo/one/.worktrees/a", "/repo/one/.worktrees/b"])

    const groups = groupSidebarProjects({
      projects: [app],
      records: [
        record("main", "/repo/one", app, 5),
        record("a", "/repo/one/.worktrees/a", app, 10),
        record("b", "/repo/one/.worktrees/b", app, 30),
      ],
    })

    expect(groups[0]?.worktrees.map((worktree) => worktree.name)).toEqual(["one", "b", "a"])
  })

  test("drops sessions whose worktree is no longer on disk, once the inventory loaded", () => {
    const app: LocalProject = { ...project("p", "/repo/app"), worktrees: [] }

    const groups = groupSidebarProjects({
      projects: [app],
      records: [record("gone", "/repo/app/.worktrees/deleted", app)],
    })

    expect(groups[0]?.total).toBe(0)
    expect(groups[0]?.worktrees).toEqual([])
  })

  test("keeps them until the inventory loads", () => {
    const app = project("p", "/repo/app")

    const groups = groupSidebarProjects({
      projects: [app],
      records: [record("gone", "/repo/app/.worktrees/deleted", app)],
    })

    expect(groups[0]?.total).toBe(1)
    expect(groups[0]?.worktrees.map((worktree) => worktree.name)).toContain("deleted")
  })

  test("keeps projects without sessions so they can start one", () => {
    const empty = project("empty", "/repo/empty")
    const groups = groupSidebarProjects({ projects: [empty], records: [] })

    expect(groups).toEqual([expect.objectContaining({ key: "/repo/empty", total: 0, worktrees: [] })])
  })

  test("keeps the project order the user set on Home", () => {
    const first = project("first", "/repo/first")
    const second = project("second", "/repo/second")

    const groups = groupSidebarProjects({
      projects: [second, first],
      records: [record("recent", "/repo/first", first, 100), record("old", "/repo/second", second, 1)],
    })

    expect(groups.map((group) => group.name)).toEqual(["second", "first"])
  })
})

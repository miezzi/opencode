import { createSimpleContext } from "@opencode/ui/context"
import { Schema } from "effect"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"

const SidebarState = Persistence.struct({
  open: Schema.Boolean,
  width: Schema.Finite,
  seeded: Schema.Boolean,
  projects: Schema.Array(Schema.String),
  worktrees: Schema.Array(Schema.String),
  pinnedSessions: Schema.Array(Schema.String),
  hiddenProjects: Schema.Array(Schema.String),
  hiddenWorktrees: Schema.Array(Schema.String),
  hiddenSessions: Schema.Array(Schema.String),
})

export type SidebarStore = typeof SidebarState.Type

type List = "projects" | "worktrees" | "pinnedSessions" | "hiddenProjects" | "hiddenWorktrees" | "hiddenSessions"

/**
 * The sidebar's open state lives above the shell and Home: Home hides its own projects column while the
 * sidebar shows the same tree, and the toggle command has to work when the sidebar is closed.
 */
export const { use: useSidebar, provider: SidebarProvider } = createSimpleContext({
  name: "Sidebar",
  gate: false,
  init: () => {
    const [state, setState, , ready] = persisted(Persist.global("sidebar"), SidebarState, {
      open: true,
      width: 264,
      seeded: false,
      projects: [],
      worktrees: [],
      pinnedSessions: [],
      hiddenProjects: [],
      hiddenWorktrees: [],
      hiddenSessions: [],
    })

    const includes = (key: List, value: string) => state[key].includes(value)

    const toggle = (key: List, value: string) =>
      setState(key, includes(key, value) ? state[key].filter((item) => item !== value) : [...state[key], value])

    const add = (key: List, value: string) => {
      if (includes(key, value)) return

      setState(key, [...state[key], value])
    }

    const remove = (key: List, value: string) => {
      if (!includes(key, value)) return

      setState(
        key,
        state[key].filter((item) => item !== value),
      )
    }

    return {
      state,
      setState,
      ready,
      toggleOpen: () => setState("open", !state.open),
      expandedProject: (key: string) => includes("projects", key),
      expandedWorktree: (key: string) => includes("worktrees", key),
      toggleProject: (key: string) => toggle("projects", key),
      toggleWorktree: (key: string) => toggle("worktrees", key),
      pinnedSession: (id: string) => includes("pinnedSessions", id),
      pinSession: (id: string) => add("pinnedSessions", id),
      unpinSession: (id: string) => remove("pinnedSessions", id),
      togglePin: (id: string) => toggle("pinnedSessions", id),
      hiddenProject: (key: string) => includes("hiddenProjects", key),
      hiddenWorktree: (key: string) => includes("hiddenWorktrees", key),
      hiddenSession: (id: string) => includes("hiddenSessions", id),
      hideProject: (key: string) => add("hiddenProjects", key),
      showProject: (key: string) => remove("hiddenProjects", key),
      hideWorktree: (key: string) => add("hiddenWorktrees", key),
      showWorktree: (key: string) => remove("hiddenWorktrees", key),
      hideSession: (id: string) => add("hiddenSessions", id),
      showSession: (id: string) => remove("hiddenSessions", id),
      restore: (keys: {
        projects?: readonly string[]
        worktrees?: readonly string[]
        sessions?: readonly string[]
      }) => {
        const projects = new Set(keys.projects)
        const worktrees = new Set(keys.worktrees)
        const sessions = new Set(keys.sessions)

        setState(
          "hiddenProjects",
          state.hiddenProjects.filter((key) => !projects.has(key)),
        )
        setState(
          "hiddenWorktrees",
          state.hiddenWorktrees.filter((key) => !worktrees.has(key)),
        )
        setState(
          "hiddenSessions",
          state.hiddenSessions.filter((id) => !sessions.has(id)),
        )
      },
    }
  },
})

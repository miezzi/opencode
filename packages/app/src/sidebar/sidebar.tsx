import { useNavigate } from "@solidjs/router"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createMediaQuery } from "@solid-primitives/media"
import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { getProjectAvatarSource, getProjectAvatarVariant, ProjectAvatar } from "@opencode/ui/project-avatar"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { ScrollView } from "@opencode/ui/scroll-view"
import { Spinner } from "@opencode/ui/spinner"
import { Tooltip } from "@opencode/ui/tooltip"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useHomeData } from "@/home/provider"
import { buildHomeSessionRecords, type HomeSessionRecord } from "@/home/sessions/records"
import { shouldOpenSessionInBackground } from "@/home/sessions/open"
import { HomeUtilityNav } from "@/home/projects/view"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { sessionPermissionRequest, sessionFormRequest } from "@/session/requests/session-request-tree"
import { sessionLabel } from "@/session/title"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { useCommand } from "@/shell/commands/command"
import { useLayout } from "@/shell/state/layout"
import { SessionTabAvatar, SessionTabAvatarView } from "@/shell/layout/session-tab-avatar"
import { getRelativeTime } from "@/shell/time"
import { type SidebarProject, type SidebarWorktree, SIDEBAR_SESSION_PAGE, groupSidebarProjects } from "./group"
import { type SidebarRow, sidebarRows } from "./rows"
import { groupSessionsByBucket, recentlyActive, type SessionBucket } from "./time"
import { useSidebar } from "./state"

const SIDEBAR_MIN_WIDTH = 220

const SIDEBAR_MAX_WIDTH = 420

function isBackgroundOpen(event: MouseEvent) {
  return shouldOpenSessionInBackground({
    button: event.button,
    mac: /(Mac|iPod|iPhone|iPad)/.test(navigator.platform),
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  })
}

const ROW =
  "flex h-7.5 min-w-0 w-full shrink-0 cursor-default items-center gap-2 rounded-[6px] text-left text-v2-text-text-muted [font-weight:440] leading-text-compact transition-[background-color,color] duration-[120ms] ease-in-out hover:bg-v2-background-bg-layer-02/60 hover:text-v2-text-text-base focus-visible:bg-v2-background-bg-layer-03 focus-visible:text-v2-text-text-base focus-visible:outline-none data-[active]:bg-v2-background-bg-layer-03 data-[active]:text-v2-text-text-base"

const ROW_ACTIONS =
  "hover-reveal absolute inset-y-0 end-1 flex items-center gap-1 duration-[120ms] focus-within:opacity-100"

// Trailing metadata (counts, session time) shares one quiet style at every level and yields to the row
// actions: the two 24px project/worktree buttons need the whole 56px gutter.
const ROW_META =
  "shrink-0 text-[10px] leading-text-tight tabular-nums text-v2-text-text-faint transition-opacity duration-[120ms] ease-in-out"

function RowActions(props: {
  class?: string
  hideLabel: string
  onHide: () => void
  newLabel?: string
  onNew?: () => void
}) {
  return (
    <div class={`${ROW_ACTIONS} ${props.class ?? ""}`}>
      <Show when={props.onNew}>
        <Tooltip class="flex shrink-0 items-center" placement="bottom" value={props.newLabel}>
          <IconButton
            size="normal"
            variant="ghost-muted"
            class="hover:text-v2-text-text-base"
            aria-label={props.newLabel}
            icon={<Icon name="plus" />}
            onClick={() => props.onNew?.()}
          />
        </Tooltip>
      </Show>
      <Tooltip class="flex shrink-0 items-center" placement="bottom" value={props.hideLabel}>
        <IconButton
          size="normal"
          variant="ghost-muted"
          class="hover:text-v2-text-text-base"
          aria-label={props.hideLabel}
          icon={<Icon name="xmark-small" />}
          onClick={props.onHide}
        />
      </Tooltip>
    </div>
  )
}

function DeleteWorktreeDialog(props: { directory: string; onConfirm: (force: boolean) => Promise<boolean> }) {
  const dialog = useDialog()
  const language = useLanguage()
  const [force, setForce] = createSignal(false)
  const [busy, setBusy] = createSignal(false)

  const confirm = async () => {
    setBusy(true)

    const done = await props.onConfirm(force())

    setBusy(false)

    if (done) dialog.close()
  }

  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("sidebar.delete.title")}
          description={language.t("sidebar.delete.description", { directory: props.directory })}
        />
      </DialogHeader>
      <div class="px-5 py-3">
        <Checkbox checked={force()} onChange={(value) => setForce(value === true)}>
          {language.t("sidebar.delete.force")}
        </Checkbox>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="danger" disabled={busy()} onClick={confirm}>
          {language.t("sidebar.delete.button")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function SidebarSessionRow(props: {
  record: HomeSessionRecord
  server: ServerConnection.Key | undefined
  active: boolean
  pinned: boolean
  onOpen: (record: HomeSessionRecord, background: boolean) => void
  onHide: (id: string) => void
}) {
  const language = useLanguage()
  const key = `s:${props.record.session.id}`

  return (
    <div class="group/session relative flex min-w-0 items-center">
      <button
        type="button"
        data-component="sidebar-session"
        data-session-id={props.record.session.id}
        data-row-key={key}
        data-active={props.active ? "" : undefined}
        tabIndex={props.active ? 0 : -1}
        class={`${ROW} ps-13 pe-9`}
        title={`${sessionLabel(props.record.session)}\n${props.record.session.location.directory}`}
        onClick={(event) => props.onOpen(props.record, isBackgroundOpen(event))}
        onAuxClick={(event) => {
          if (!isBackgroundOpen(event)) return

          event.preventDefault()
          props.onOpen(props.record, true)
        }}
      >
        <Show
          when={props.server}
          fallback={
            <SessionTabAvatarView
              project={props.record.project}
              directory={props.record.session.location.directory}
              unread={false}
              loading={false}
            />
          }
        >
          {(server) => (
            <SessionTabAvatar
              project={props.record.project}
              directory={props.record.session.location.directory}
              sessionId={props.record.session.id}
              server={server()}
            />
          )}
        </Show>
        <span class="min-w-0 flex-1 truncate text-v2-text-text-base">{sessionLabel(props.record.session)}</span>
        <Show when={props.pinned}>
          <Icon name="pin" size="small" class="shrink-0 text-v2-icon-icon-muted" />
        </Show>
        <span class={`${ROW_META} group-hover/session:opacity-0 group-has-[:focus-visible]/session:opacity-0`}>
          {getRelativeTime(
            new Date(props.record.session.time.updated ?? props.record.session.time.created).toISOString(),
            language.t,
          )}
        </span>
      </button>
      <RowActions
        class="group-hover/session:opacity-100 group-has-[:focus-visible]/session:opacity-100"
        hideLabel={language.t("sidebar.hide.session")}
        onHide={() => props.onHide(props.record.session.id)}
      />
    </div>
  )
}

export function Sidebar() {
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  const navigate = useNavigate()
  const layout = useLayout()
  const { home, projects, sessions } = useHomeData()
  const sidebar = useSidebar()
  const desktop = createMediaQuery("(min-width: 1024px)")

  // How many sessions each worktree lists; kept in memory so the tree stays short across reloads.
  const [limits, setLimits] = createStore<Record<string, number>>({})

  command.register("sidebar", () => [
    {
      id: "sidebar.toggle",
      title: language.t("sidebar.toggle"),
      section: "navigation",
      keybind: "mod+shift+b",
      onSelect: () => {
        const open = sidebar.state.open
        sidebar.toggleOpen()

        if (!open) focusRow(active() ?? rows()[0]?.key)
      },
    },
    {
      id: "sidebar.focus",
      title: language.t("sidebar.focus"),
      section: "navigation",
      keybind: "mod+b",
      onSelect: () => {
        if (!sidebar.state.open) sidebar.setState("open", true)
        focusRow(active() ?? rows()[0]?.key)
      },
    },
    {
      id: "sidebar.reveal",
      title: language.t("sidebar.reveal"),
      section: "navigation",
      keybind: "mod+shift+g",
      onSelect: () => revealCurrentSession(),
    },
    {
      id: "sidebar.search",
      title: language.t("sidebar.search.command"),
      section: "navigation",
      keybind: "mod+shift+f",
      onSelect: () => {
        if (!sidebar.state.open) sidebar.setState("open", true)

        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>('[data-component="sidebar-search"]')
          input?.focus()
          input?.select()
        })
      },
    },
    {
      id: "sidebar.chat",
      title: language.t("sidebar.chat"),
      section: "navigation",
      keybind: "mod+shift+m",
      onSelect: () => {
        document.querySelector<HTMLElement>('[data-component="composer-editor"]')?.focus()
      },
    },
  ])

  const branchOf = (record: HomeSessionRecord) =>
    home.server.focusedContext()?.data.location.vcs.info(record.session.location)?.branch.current

  const records = createMemo(() =>
    buildHomeSessionRecords({
      sessions: sessions.data.indexed,
      projectDirectories: () => undefined,
      projects: home.project.list,
      resolveProject: (session) => home.server.focusedContext()?.projects.forSession(session),
    }),
  )

  // Sessions the user may want to look at without hunting the tree: agents running now, and sessions that
  // finished, asked a question or raised a permission request.

  const ACTIVE_LIMIT = 5
  const [allActive, setAllActive] = createSignal(false)

  const activeSessions = createMemo(() => {
    const ctx = home.server.focusedContext()

    if (!ctx) return []

    const data = ctx.data
    const rows: { record: HomeSessionRecord; status: "running" | "attention" }[] = []

    for (const record of records()) {
      const id = record.session.id
      const pending = data.session.pending.list(id).some((item) => item.type !== "synthetic")

      if (data.session.status(id) === "running" || pending) {
        rows.push({ record, status: "running" })
        continue
      }

      if (!recentlyActive(record)) continue

      const infos = [id, ...data.session.family(id)].flatMap((sid) => {
        const info = data.session.get(sid)

        return info ? [info] : []
      })

      if (
        sessionPermissionRequest(infos, data.session.permission.list, id) ||
        sessionFormRequest(infos, data.session.form.list, id) ||
        ctx.notification.session.unread(id, record.session)
      )
        rows.push({ record, status: "attention" })
    }

    return rows.toSorted((a, b) => (b.record.session.time.updated ?? 0) - (a.record.session.time.updated ?? 0))
  })

  const activeVisible = createMemo(() => (allActive() ? activeSessions() : activeSessions().slice(0, ACTIVE_LIMIT)))

  const tree = createMemo(() =>
    groupSidebarProjects({
      projects: home.project.list(),
      records: records(),
    }),
  )

  // What the user removed from the sidebar. Kept separate from the tree so the restore menu can still name it.
  const hiddenGroups = createMemo(() => {
    const groups: {
      project: SidebarProject
      worktrees: SidebarWorktree[]
      sessions: HomeSessionRecord[]
      count: number
    }[] = []

    for (const project of tree()) {
      const worktrees = project.worktrees.filter((worktree) => sidebar.hiddenWorktree(worktree.key))
      const removed = new Set(worktrees.map((worktree) => worktree.key))

      const sessions = project.worktrees
        .filter((worktree) => !removed.has(worktree.key))
        .flatMap((worktree) => worktree.sessions.filter((record) => sidebar.hiddenSession(record.session.id)))

      if (worktrees.length === 0 && sessions.length === 0) continue

      groups.push({ project, worktrees, sessions, count: worktrees.length + sessions.length })
    }

    return groups
  })

  const hiddenFor = (key: string) => hiddenGroups().find((group) => group.project.key === key)?.count ?? 0

  const visibleTree = createMemo(() =>
    tree()
      .filter((project) => !sidebar.hiddenProject(project.key))
      .map((project) => {
        const worktrees = project.worktrees
          .filter((worktree) => !sidebar.hiddenWorktree(worktree.key))
          .map((worktree) => ({
            ...worktree,
            sessions: worktree.sessions.filter((record) => !sidebar.hiddenSession(record.session.id)),
          }))

        return {
          ...project,
          worktrees,
          total: worktrees.reduce((count, worktree) => count + worktree.sessions.length, 0),
        }
      }),
  )

  const hiddenProjectList = createMemo(() => tree().filter((project) => sidebar.hiddenProject(project.key)))

  const [query, setQuery] = createSignal("")
  const searching = () => query().trim().length > 0

  const searchedTree = createMemo(() => {
    const needle = query().trim().toLowerCase()

    if (!needle) return visibleTree()

    return visibleTree().flatMap((project) => {
      const projectMatch = project.name.toLowerCase().includes(needle)

      const worktrees = project.worktrees.flatMap((worktree) => {
        const label = worktreeLabel(worktree).toLowerCase()

        const worktreeMatch =
          projectMatch || label.includes(needle) || worktree.directory.toLowerCase().includes(needle)

        const sessions = worktreeMatch
          ? worktree.sessions
          : worktree.sessions.filter((record) => sessionLabel(record.session).toLowerCase().includes(needle))

        if (!worktreeMatch && sessions.length === 0) return []

        return [{ ...worktree, sessions }]
      })

      if (!projectMatch && worktrees.length === 0) return []

      return [
        { ...project, worktrees, total: worktrees.reduce((count, worktree) => count + worktree.sessions.length, 0) },
      ]
    })
  })

  const restoreProject = (project: SidebarProject) => {
    const group = hiddenGroups().find((item) => item.project.key === project.key)

    if (!group) return

    sidebar.restore({
      worktrees: group.worktrees.map((worktree) => worktree.key),
      sessions: group.sessions.map((record) => record.session.id),
    })
  }

  // Branch labels read the location VCS directly so a sync updates the row's text without rebuilding the tree,
  // which would recreate the rows and drop keyboard focus.
  const worktreeLabel = (worktree: SidebarWorktree) => {
    const latest = worktree.sessions[0]

    return (
      (latest ? branchOf(latest) : undefined) ?? (worktree.main ? language.t("sidebar.worktree.main") : worktree.name)
    )
  }

  const bucketLabel = (bucket: SessionBucket | "pinned") => {
    if (bucket === "pinned") return language.t("sidebar.pinned")

    switch (bucket) {
      case "today":
        return language.t("sidebar.time.today")
      case "yesterday":
        return language.t("sidebar.time.yesterday")
      case "week":
        return language.t("sidebar.time.week")
      case "fortnight":
        return language.t("sidebar.time.fortnight")
      case "month":
        return language.t("sidebar.time.month")
      case "older":
        return language.t("sidebar.time.older")
    }
  }

  const toggleWorktree = (worktree: SidebarWorktree) => {
    const open = sidebar.expandedWorktree(worktree.key)
    sidebar.toggleWorktree(worktree.key)

    if (open) return

    // Opening a worktree is the demand for its branch label.
    const latest = worktree.sessions[0]

    if (latest) sessions.location.sync(latest)
  }

  // The first run opens the project (and worktree) of the most recent session, so the tree is never empty.
  createEffect(() => {
    if (!sidebar.ready() || sidebar.state.seeded || sessions.data.loading()) return

    const groups = visibleTree()

    if (groups.length === 0) return

    const project = groups.filter((group) => group.total > 0).toSorted((a, b) => b.updated - a.updated)[0] ?? groups[0]
    sidebar.setState("seeded", true)

    if (!project) return

    sidebar.setState("projects", [project.key])

    const worktree = project.worktrees.find((item) => item.sessions.length > 0)

    if (!worktree) return

    sidebar.setState("worktrees", [worktree.key])

    const latest = worktree.sessions[0]

    if (latest) sessions.location.sync(latest)
  })

  // Visible worktrees ask for their branch once: a reload restores which rows are open, so the toggle
  // handler alone would leave those labels showing the directory name.
  const synced = new Set<string>()
  createEffect(() => {
    for (const project of tree()) {
      if (!sidebar.expandedProject(project.key)) continue

      for (const worktree of project.worktrees) {
        if (!sidebar.expandedWorktree(worktree.key)) continue

        const key = `${project.key}:${worktree.key}`

        if (synced.has(key)) continue

        synced.add(key)

        const latest = worktree.sessions[0]

        if (latest) sessions.location.sync(latest)
      }
    }
  })

  // Worktree inventories load on demand; the tree needs them to tell main apart from a worktree, and to drop
  // worktrees removed from disk. Coming back to the window is when an external removal has to be noticed.
  const requested = new Set<string>()
  const [revision, setRevision] = createSignal(0)

  const refreshInventories = () => {
    requested.clear()
    setRevision((value) => value + 1)
  }

  makeEventListener(window, "focus", refreshInventories)
  makeEventListener(document, "visibilitychange", () => {
    if (document.visibilityState === "visible") refreshInventories()
  })

  createEffect(() => {
    revision()

    const connection = home.server.focused()
    const context = home.server.focusedContext()

    if (!connection || !context || context.sdk.connection.status() !== "connected") return

    for (const project of tree()) {
      if (project.total === 0 || !project.project.id) continue

      const key = `${ServerConnection.key(connection)}:${project.project.id}`

      if (requested.has(key)) continue

      requested.add(key)
      // `list` reads the saved inventory; `refresh` is what notices a worktree removed from disk.
      void context.sync.worktrees.list(project.project.id).catch(() => undefined)
      void context.sync.worktrees.refresh(project.project.id).catch(() => undefined)
    }
  })

  const openSession = (record: HomeSessionRecord, background: boolean) => {
    sessions.session.open(record.session, { background })
  }

  const newSession = (directory: string) => {
    const connection = home.server.focused()

    if (!connection) return

    home.project.openProjectNewSession(connection, directory)
  }

  const deleteWorktree = (project: SidebarProject, worktree: SidebarWorktree) => {
    const ctx = home.server.focusedContext()
    const projectID = project.project.id

    if (!ctx || !projectID) return

    dialog.show(() => (
      <DeleteWorktreeDialog
        directory={worktree.directory}
        onConfirm={async (force) => {
          try {
            await ctx.sdk.api.worktree.remove({ projectID, directory: worktree.directory, force })
            await ctx.sync.worktrees.refresh(projectID)

            return true
          } catch (cause) {
            showToast({
              title: language.t("sidebar.delete.failed.title"),
              description: errorMessage(cause, language.t("sidebar.delete.failed.description")),
            })

            return false
          }
        }}
      />
    ))
  }

  const openOnHome = (project: SidebarProject) => {
    const connection = home.server.focused()

    if (!connection) return

    home.selection.set({ server: ServerConnection.key(connection), directory: project.project.worktree })
    navigate("/")
  }

  const limitFor = (key: string) => limits[key] ?? SIDEBAR_SESSION_PAGE

  // Projects with no sessions are inventory, not navigation: they stay behind a count so the tree opens on
  // the projects the user is actually working in.
  const [showEmpty, setShowEmpty] = createSignal(false)

  const matchingProjects = createMemo(() =>
    searchedTree().filter((project) => project.total > 0 || hiddenFor(project.key) > 0),
  )

  const inactiveCount = createMemo(() => searchedTree().length - matchingProjects().length)

  const visibleProjects = createMemo(() => {
    if (searching() || showEmpty()) return searchedTree()

    return matchingProjects()
  })

  const rows = createMemo(() =>
    sidebarRows({
      projects: visibleProjects(),
      expandedProject: (key) => searching() || sidebar.expandedProject(key),
      expandedWorktree: (key) => searching() || sidebar.expandedWorktree(key),
      limit: limitFor,
      hiddenCount: hiddenFor,
      pinned: sidebar.pinnedSession,
      hiddenProjects: hiddenProjectList().length,
    }),
  )

  type MenuTarget =
    | { kind: "global" }
    | { kind: "project"; project: SidebarProject }
    | { kind: "worktree"; project: SidebarProject; worktree: SidebarWorktree }
    | { kind: "session"; record: HomeSessionRecord }

  const EMPTY_WORKTREES: SidebarWorktree[] = []
  const EMPTY_SESSIONS: HomeSessionRecord[] = []

  const [menu, setMenu] = createStore({ open: false, x: 0, y: 0 })
  const [menuRow, setMenuRow] = createSignal<SidebarRow>()

  const fullProject = (key: string) => tree().find((project) => project.key === key)

  // The right-clicked row decides the scope: a project lists what it hides, a worktree lists its hidden sessions.
  const menuTarget = createMemo<MenuTarget>(() => {
    const row = menuRow()

    if (!row) return { kind: "global" }

    if (row.kind === "project") {
      const project = fullProject(row.project.key)

      return project ? { kind: "project", project } : { kind: "global" }
    }

    if (row.kind === "hidden") {
      const project = fullProject(row.project.key)

      return project ? { kind: "project", project } : { kind: "global" }
    }

    if (row.kind === "worktree") {
      const project = tree().find((item) => `p:${item.key}` === row.parent)
      const worktree = project?.worktrees.find((item) => item.key === row.worktree.key)

      return project && worktree ? { kind: "worktree", project, worktree } : { kind: "global" }
    }

    if (row.kind === "session") return { kind: "session", record: row.record }

    return { kind: "global" }
  })

  const menuAction = createMemo(() => {
    const target = menuTarget()

    if (target.kind === "project")
      return { label: language.t("sidebar.hide.project"), run: () => sidebar.hideProject(target.project.key) }

    if (target.kind === "worktree")
      return { label: language.t("sidebar.hide.worktree"), run: () => sidebar.hideWorktree(target.worktree.key) }

    if (target.kind === "session")
      return { label: language.t("sidebar.hide.session"), run: () => sidebar.hideSession(target.record.session.id) }
  })

  const menuPinAction = createMemo(() => {
    const target = menuTarget()

    if (target.kind !== "session") return

    const id = target.record.session.id

    return sidebar.pinnedSession(id)
      ? { label: language.t("sidebar.unpin"), run: () => sidebar.unpinSession(id) }
      : { label: language.t("sidebar.pin"), run: () => sidebar.pinSession(id) }
  })

  // Deleting goes through Home's dialog: it owns the confirmation, the tab cleanup and the failure toast.
  const menuDeleteAction = createMemo(() => {
    const target = menuTarget()

    if (target.kind !== "session") return

    const server = home.selection.value().server

    if (!server) return

    return {
      label: language.t("sidebar.delete.session"),
      run: () => sessions.session.showDelete(server, target.record.session),
    }
  })

  const menuHidden = createMemo(() => {
    const target = menuTarget()

    if (target.kind === "project") {
      const worktrees = target.project.worktrees.filter((worktree) => sidebar.hiddenWorktree(worktree.key))
      const removed = new Set(worktrees.map((worktree) => worktree.key))

      const sessions = target.project.worktrees
        .filter((worktree) => !removed.has(worktree.key))
        .flatMap((worktree) => worktree.sessions.filter((record) => sidebar.hiddenSession(record.session.id)))

      return { worktrees, sessions }
    }

    if (target.kind === "worktree")
      return {
        worktrees: EMPTY_WORKTREES,
        sessions: target.worktree.sessions.filter((record) => sidebar.hiddenSession(record.session.id)),
      }

    return { worktrees: EMPTY_WORKTREES, sessions: EMPTY_SESSIONS }
  })

  const menuWorktree = createMemo(() => {
    const target = menuTarget()

    return target.kind === "worktree" ? target.worktree : undefined
  })

  const menuHiddenCount = createMemo(() => menuHidden().worktrees.length + menuHidden().sessions.length)

  const menuScopeName = createMemo(() => {
    const target = menuTarget()

    if (target.kind === "project") return target.project.name

    if (target.kind === "worktree") return worktreeLabel(target.worktree)

    return ""
  })

  const restoreScope = () => {
    const hidden = menuHidden()

    sidebar.restore({
      worktrees: hidden.worktrees.map((worktree) => worktree.key),
      sessions: hidden.sessions.map((record) => record.session.id),
    })
  }

  let aside: HTMLElement | undefined
  const [active, setActive] = createSignal<string>()

  // Rows are recreated when the tree recomputes (worktree inventory, expansions), which drops DOM focus to
  // <body>. Keyboard navigation owns focus until the pointer is used again, so put it back on the active row.
  let keyboard = false
  makeEventListener(document, "pointerdown", () => (keyboard = false))

  const focusRow = (key: string | undefined) => {
    if (!key) return

    keyboard = true
    setActive(key)
    requestAnimationFrame(() => {
      const element = aside?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`)
      element?.focus()
      element?.scrollIntoView({ block: "nearest" })
    })
  }

  // The chat knows which session it shows; the tree only knows where the user last left keyboard focus. This
  // takes a shortcut from the composer to the row of that session, opening the tree down to it.
  const revealSession = (id: string | undefined) => {
    if (!id) return false

    const located = (() => {
      for (const project of tree()) {
        for (const worktree of project.worktrees) {
          const record = worktree.sessions.find((item) => item.session.id === id)

          if (record) return { project, worktree, record }
        }
      }
    })()

    if (!located) return false

    const { project, worktree, record } = located

    // A hidden row has no element to focus, so revealing one puts it back in the tree.
    if (
      sidebar.hiddenProject(project.key) ||
      sidebar.hiddenWorktree(worktree.key) ||
      sidebar.hiddenSession(record.session.id)
    )
      sidebar.restore({ projects: [project.key], worktrees: [worktree.key], sessions: [record.session.id] })

    if (!sidebar.expandedProject(project.key)) sidebar.toggleProject(project.key)

    if (!sidebar.expandedWorktree(worktree.key)) toggleWorktree(worktree)

    // Pinned sessions render first and the rest page by limit, so the page has to reach this row.
    const rest = worktree.sessions.filter((item) => !sidebar.pinnedSession(item.session.id))
    const index = rest.findIndex((item) => item.session.id === record.session.id)

    if (index >= limitFor(worktree.key))
      setLimits(worktree.key, Math.ceil((index + 1) / SIDEBAR_SESSION_PAGE) * SIDEBAR_SESSION_PAGE)

    // A query filters the tree down; it would otherwise hide the row being revealed.
    setQuery("")
    focusRow(`s:${record.session.id}`)

    return true
  }

  const revealCurrentSession = () => {
    const route = layout.route()

    if (!sidebar.state.open) sidebar.setState("open", true)

    if (revealSession(route.type === "session" ? route.sessionId : undefined)) return

    // Home, a draft, or a session outside the index: focus the tree at its last row.
    focusRow(active() ?? rows()[0]?.key)
  }

  createEffect(() => {
    rows()

    const key = active()

    if (!key || !keyboard) return

    requestAnimationFrame(() => {
      if (!keyboard) return

      const focused = document.activeElement

      if (focused && focused !== document.body) return

      aside?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`)?.focus()
    })
  })

  // A row can disappear when a parent collapses; keep one tabbable row at all times.
  createEffect(() => {
    const list = rows()
    const current = active()

    if (list.length === 0 || (current && list.some((row) => row.key === current))) return

    setActive(list[0]?.key)
  })

  const collapseRow = (row: SidebarRow) => {
    if (row.kind === "project" && sidebar.expandedProject(row.project.key)) {
      sidebar.toggleProject(row.project.key)
      focusRow(row.key)

      return true
    }

    if (row.kind === "worktree" && sidebar.expandedWorktree(row.worktree.key)) {
      toggleWorktree(row.worktree)
      focusRow(row.key)

      return true
    }

    return false
  }

  const expandRow = (row: SidebarRow) => {
    if (row.kind === "project" && row.project.total > 0 && !sidebar.expandedProject(row.project.key)) {
      sidebar.toggleProject(row.project.key)
      focusRow(row.key)

      return true
    }

    if (row.kind === "worktree" && !sidebar.expandedWorktree(row.worktree.key)) {
      toggleWorktree(row.worktree)
      focusRow(row.key)

      return true
    }

    return false
  }

  const activateRow = (row: SidebarRow) => {
    if (row.kind === "session") {
      openSession(row.record, false)

      return
    }

    if (row.kind === "more") {
      setLimits(row.worktree.key, limitFor(row.worktree.key) + SIDEBAR_SESSION_PAGE)
      focusRow(row.parent)

      return
    }

    if (row.kind === "hidden") {
      restoreProject(row.project)
      focusRow(row.parent)

      return
    }

    if (row.kind === "hidden-projects") {
      sidebar.setState("hiddenProjects", [])
      focusRow(row.key)

      return
    }

    if (row.kind === "project") {
      if (row.project.total > 0) sidebar.toggleProject(row.project.key)
      else openOnHome(row.project)

      focusRow(row.key)

      return
    }

    toggleWorktree(row.worktree)
    focusRow(row.key)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target

    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    )
      return

    const list = rows()

    if (list.length === 0) return

    const index = list.findIndex((row) => row.key === active())
    const row = index >= 0 ? list[index] : list[0]

    const move = (next: number | undefined) => {
      if (next === undefined) return

      event.preventDefault()
      focusRow(list[next]?.key)
    }

    switch (event.key) {
      case "ArrowDown":
        return move(index < 0 ? 0 : Math.min(index + 1, list.length - 1))
      case "ArrowUp":
        return move(index <= 0 ? 0 : index - 1)
      case "Home":
        return move(0)
      case "End":
        return move(list.length - 1)
      case "ArrowRight": {
        if (!row) return

        event.preventDefault()

        if (expandRow(row)) return

        const child = list[index + 1]

        if (child && child.level > row.level) focusRow(child.key)

        return
      }

      case "ArrowLeft": {
        if (!row) return

        event.preventDefault()

        if (collapseRow(row)) return

        if (row.kind !== "hidden-projects") focusRow(row.parent)

        return
      }

      case "Enter": {
        if (!row) return

        event.preventDefault()
        activateRow(row)

        return
      }

      case "p": {
        if (!row || row.kind !== "session") return

        event.preventDefault()
        sidebar.togglePin(row.record.session.id)

        return
      }

      case "Escape": {
        event.preventDefault()

        const focused = document.activeElement

        if (focused instanceof HTMLElement) focused.blur()

        return
      }
    }
  }

  return (
    <Show when={desktop() && sidebar.state.open}>
      <aside
        ref={(element) => (aside = element)}
        data-slot="app-sidebar"
        onKeyDown={onKeyDown}
        onFocusIn={(event) => {
          const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-row-key]") : null
          const key = element?.dataset.rowKey

          if (key) setActive(key)
        }}
        class={`
          relative flex h-full min-h-0 shrink-0 flex-col bg-v2-background-bg-deep
          pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]
        `}
        style={{ width: `${sidebar.state.width}px` }}
      >
        <ResizeHandle
          class="-end-1"
          direction="horizontal"
          size={sidebar.state.width}
          min={SIDEBAR_MIN_WIDTH}
          max={SIDEBAR_MAX_WIDTH}
          onResize={(width) => sidebar.setState("width", width)}
        />

        <div class="flex min-w-0 flex-col gap-0.5 px-2">
          <button type="button" class={`${ROW} px-2`} onClick={() => navigate("/")}>
            <Icon name="home" size="small" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="min-w-0 flex-1 truncate">{language.t("home.title")}</span>
          </button>
          <button type="button" class={`${ROW} px-2`} onClick={() => command.trigger("command.palette")}>
            <Icon name="magnifying-glass" size="small" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="min-w-0 flex-1 truncate">{language.t("home.sessions.search.placeholder")}</span>
            <Show when={command.keybind("command.palette")}>
              {(hint) => <span class="shrink-0 text-[10px] text-v2-text-text-faint">{hint()}</span>}
            </Show>
          </button>
          <button type="button" class={`${ROW} px-2`} onClick={() => home.project.openNewSession()}>
            <Icon name="plus" size="small" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="min-w-0 flex-1 truncate">{language.t("command.session.new")}</span>
          </button>
        </div>

        <div class="px-2 pt-2">
          <label
            class={`
              relative flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] bg-v2-background-bg-layer-02/60 ps-2 pe-1
              text-v2-icon-icon-muted transition-[background-color] duration-[120ms] ease-in-out
              hover:bg-v2-background-bg-layer-02 focus-within:bg-v2-background-bg-layer-02
            `}
          >
            <Icon name="magnifying-glass" size="small" />
            <input
              data-component="sidebar-search"
              class={`
                relative z-20 min-w-0 flex-1 border-0 bg-transparent text-[12px] leading-text-compact text-v2-text-text-base
                outline-0 [font-weight:440] placeholder:text-v2-text-text-faint
              `}
              value={query()}
              placeholder={language.t("sidebar.search.placeholder")}
              aria-label={language.t("sidebar.search.placeholder")}
              spellcheck={false}
              autocomplete="off"
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("")
                  event.currentTarget.blur()

                  return
                }

                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  focusRow(rows()[0]?.key)
                }
              }}
            />
            <Show
              when={query()}
              fallback={
                <span class="shrink-0 pe-1 text-[10px] text-v2-text-text-faint">
                  {command.keybind("sidebar.search")}
                </span>
              }
            >
              <IconButton
                size="normal"
                variant="ghost-muted"
                aria-label={language.t("sidebar.search.clear")}
                icon={<Icon name="xmark-small" />}
                onClick={() => setQuery("")}
              />
            </Show>
          </label>
        </div>

        <Show when={activeSessions().length > 0}>
          <div class="flex min-w-0 flex-col pb-1">
            <div class="mt-1.5 flex h-6 min-w-0 items-center justify-between pe-2.5 ps-3">
              <span class="min-w-0 truncate text-[11px] text-v2-text-text-muted [font-weight:560]">
                {language.t("sidebar.active.title")}
              </span>
              <span class={`${ROW_META} ps-2`}>{activeSessions().length}</span>
            </div>
            <div class="flex min-w-0 flex-col gap-px px-2">
              <For each={activeVisible()}>
                {(item) => (
                  <button
                    type="button"
                    data-component="sidebar-active-session"
                    data-session-id={item.record.session.id}
                    class={`${ROW} ps-2 pe-2.5`}
                    title={`${sessionLabel(item.record.session)}\n${item.record.projectName}`}
                    onClick={() => openSession(item.record, false)}
                  >
                    <SessionTabAvatarView
                      project={item.record.project}
                      directory={item.record.session.location.directory}
                      unread={item.status === "attention"}
                      loading={item.status === "running"}
                    />
                    <span class="min-w-0 flex-1 truncate text-v2-text-text-base">
                      {sessionLabel(item.record.session)}
                    </span>
                    <span class="shrink-0 max-w-[45%] truncate text-[10px] leading-text-tight text-v2-text-text-faint">
                      {item.record.projectName}
                    </span>
                  </button>
                )}
              </For>
              <Show when={activeSessions().length > ACTIVE_LIMIT}>
                <button
                  type="button"
                  class={`${ROW} ps-2 pe-2 text-[12px] text-v2-text-text-faint`}
                  onClick={() => setAllActive(!allActive())}
                >
                  {allActive()
                    ? language.t("sidebar.active.less")
                    : language.t("sidebar.active.more", { count: activeSessions().length - ACTIVE_LIMIT })}
                </button>
              </Show>
            </div>
          </div>
        </Show>

        <div class="mt-3 flex h-6 min-w-0 shrink-0 items-center justify-between pe-2.5 ps-3">
          <span class="min-w-0 truncate text-[11px] text-v2-text-text-muted [font-weight:560]">
            {language.t("home.projects")}
          </span>
          <IconButton
            size="normal"
            variant="ghost-muted"
            aria-label={language.t("home.project.add")}
            icon={<Icon name="plus" />}
            onClick={() => {
              const connection = home.server.focused()

              if (connection) projects.project.choose(connection)
            }}
          />
        </div>

        <ScrollView class="min-h-0 min-w-0 flex-1">
          <div
            data-slot="sidebar-tree"
            class="relative flex min-w-0 flex-col gap-1 px-2 pb-3"
            onContextMenu={(event) => {
              event.preventDefault()

              const target = event.target instanceof Element ? event.target.closest("[data-row-key]") : null
              const key = target instanceof HTMLElement ? target.dataset.rowKey : undefined
              const row = key ? rows().find((item) => item.key === key) : undefined

              setMenuRow(row)

              if (row) setActive(row.key)

              const bounds = event.currentTarget.getBoundingClientRect()

              setMenu({ open: true, x: event.clientX - bounds.left, y: event.clientY - bounds.top })
            }}
          >
            <Show
              when={tree().length > 0}
              fallback={
                <div class="flex items-center gap-2 px-2 py-2 text-[12px] text-v2-text-text-faint">
                  {sessions.data.loading() ? <Spinner class="size-3.5" /> : language.t("sidebar.projects.empty")}
                </div>
              }
            >
              <Show when={searching() && visibleProjects().length === 0}>
                <div class="px-2 py-2 text-[12px] text-v2-text-text-faint">{language.t("sidebar.search.empty")}</div>
              </Show>
              <For each={visibleProjects()}>
                {(project) => {
                  const open = () => searching() || sidebar.expandedProject(project.key)
                  const hasRows = () => project.total > 0 || hiddenFor(project.key) > 0

                  return (
                    <div class="flex min-w-0 flex-col gap-0.5">
                      <div class="group/project relative flex min-w-0 items-center">
                        <button
                          type="button"
                          data-component="sidebar-project"
                          data-project={project.key}
                          data-row-key={`p:${project.key}`}
                          data-active={active() === `p:${project.key}` ? "" : undefined}
                          tabIndex={active() === `p:${project.key}` ? 0 : -1}
                          class={`${ROW} ps-2 pe-14`}
                          aria-expanded={hasRows() ? open() : undefined}
                          title={project.project.worktree}
                          onClick={() => (hasRows() ? sidebar.toggleProject(project.key) : openOnHome(project))}
                        >
                          <Icon
                            name="chevron-down"
                            size="small"
                            class={`shrink-0 text-v2-icon-icon-muted transition-transform duration-150 ease-in-out ${open() && hasRows() ? "" : "-rotate-90"} ${hasRows() ? "" : "invisible"}`}
                          />
                          <ProjectAvatar
                            fallback={project.name}
                            src={getProjectAvatarSource(project.project.id, project.project.icon)}
                            variant={getProjectAvatarVariant(project.project.icon?.color)}
                          />
                          <span class="min-w-0 flex-1 truncate text-v2-text-text-base [font-weight:530]">
                            {project.name}
                          </span>
                          <Show when={project.total > 0}>
                            <span
                              class={`${ROW_META} group-hover/project:opacity-0 group-has-[:focus-visible]/project:opacity-0`}
                            >
                              {project.total}
                            </span>
                          </Show>
                        </button>
                        <RowActions
                          class="group-hover/project:opacity-100 group-has-[:focus-visible]/project:opacity-100"
                          newLabel={language.t("command.session.new")}
                          onNew={() => newSession(project.project.worktree)}
                          hideLabel={language.t("sidebar.hide.project")}
                          onHide={() => sidebar.hideProject(project.key)}
                        />
                      </div>

                      <Show when={hasRows() && open()}>
                        <For each={project.worktrees}>
                          {(worktree) => {
                            const listOpen = () => searching() || sidebar.expandedWorktree(worktree.key)
                            const limit = () => limitFor(worktree.key)

                            const pinned = () =>
                              worktree.sessions.filter((record) => sidebar.pinnedSession(record.session.id))

                            const rest = () =>
                              worktree.sessions.filter((record) => !sidebar.pinnedSession(record.session.id))

                            const visible = () => rest().slice(0, limit())

                            const sessionGroups = () => {
                              const groups = groupSessionsByBucket(visible())

                              return pinned().length
                                ? [{ bucket: "pinned" as const, sessions: pinned() }, ...groups]
                                : groups
                            }

                            const hidden = () => rest().length - visible().length

                            return (
                              <div class="flex min-w-0 flex-col gap-px">
                                <div class="group/worktree relative flex min-w-0 items-center">
                                  <button
                                    type="button"
                                    data-component="sidebar-worktree"
                                    data-worktree={worktree.key}
                                    data-row-key={`w:${worktree.key}`}
                                    data-active={active() === `w:${worktree.key}` ? "" : undefined}
                                    tabIndex={active() === `w:${worktree.key}` ? 0 : -1}
                                    class={`${ROW} ps-5 pe-14`}
                                    aria-expanded={listOpen()}
                                    title={worktree.directory}
                                    onClick={() => toggleWorktree(worktree)}
                                  >
                                    <Icon
                                      name="chevron-down"
                                      size="small"
                                      class={`shrink-0 text-v2-icon-icon-muted transition-transform duration-150 ease-in-out ${listOpen() ? "" : "-rotate-90"}`}
                                    />
                                    <Icon
                                      name={worktree.main ? "workspace" : "branch"}
                                      size="small"
                                      class="shrink-0 text-v2-icon-icon-muted"
                                    />
                                    <span class="min-w-0 flex-1 truncate">{worktreeLabel(worktree)}</span>
                                    <Show when={worktree.sessions.length > 0}>
                                      <span
                                        class={`${ROW_META} group-hover/worktree:opacity-0 group-has-[:focus-visible]/worktree:opacity-0`}
                                      >
                                        {worktree.sessions.length}
                                      </span>
                                    </Show>
                                  </button>
                                  <RowActions
                                    class="group-hover/worktree:opacity-100 group-has-[:focus-visible]/worktree:opacity-100"
                                    newLabel={language.t("command.session.new")}
                                    onNew={() => newSession(worktree.directory)}
                                    hideLabel={language.t("sidebar.hide.worktree")}
                                    onHide={() => sidebar.hideWorktree(worktree.key)}
                                  />
                                </div>

                                <Show when={listOpen()}>
                                  <For each={sessionGroups()}>
                                    {(group) => (
                                      <>
                                        <Show when={sessionGroups().length > 1}>
                                          <div
                                            class={`
                                              ps-13 pe-1.5 pt-1.5 pb-0.5 text-[10px] uppercase tracking-[0.04em]
                                              leading-text-tight text-v2-text-text-faint [font-weight:530]
                                            `}
                                          >
                                            {bucketLabel(group.bucket)}
                                          </div>
                                        </Show>
                                        <For each={group.sessions}>
                                          {(record) => (
                                            <SidebarSessionRow
                                              record={record}
                                              server={home.selection.value().server}
                                              active={active() === `s:${record.session.id}`}
                                              pinned={sidebar.pinnedSession(record.session.id)}
                                              onOpen={openSession}
                                              onHide={(id) => sidebar.hideSession(id)}
                                            />
                                          )}
                                        </For>
                                      </>
                                    )}
                                  </For>
                                  <Show when={hidden() > 0}>
                                    <button
                                      type="button"
                                      data-row-key={`m:${worktree.key}`}
                                      data-active={active() === `m:${worktree.key}` ? "" : undefined}
                                      tabIndex={active() === `m:${worktree.key}` ? 0 : -1}
                                      class={`${ROW} ps-13 pe-2 text-[12px] text-v2-text-text-faint`}
                                      onClick={() => setLimits(worktree.key, limit() + SIDEBAR_SESSION_PAGE)}
                                    >
                                      {language.t("sidebar.more", { count: hidden() })}
                                    </button>
                                  </Show>
                                </Show>
                              </div>
                            )
                          }}
                        </For>
                        <Show when={hiddenFor(project.key) > 0}>
                          <button
                            type="button"
                            data-row-key={`h:${project.key}`}
                            data-active={active() === `h:${project.key}` ? "" : undefined}
                            tabIndex={active() === `h:${project.key}` ? 0 : -1}
                            class={`${ROW} ps-5 pe-2 text-[12px] text-v2-text-text-faint`}
                            title={language.t("sidebar.hidden.hint")}
                            onClick={() => restoreProject(project)}
                          >
                            <Icon name="outline-eye-slash" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                            <span class="min-w-0 flex-1 truncate">
                              {language.t("sidebar.hidden.count", { count: hiddenFor(project.key) })}
                            </span>
                          </button>
                        </Show>
                      </Show>
                    </div>
                  )
                }}
              </For>
              <Show when={hiddenProjectList().length > 0}>
                <button
                  type="button"
                  data-component="sidebar-hidden-projects"
                  data-row-key="hidden:projects"
                  data-active={active() === "hidden:projects" ? "" : undefined}
                  tabIndex={active() === "hidden:projects" ? 0 : -1}
                  class={`${ROW} ps-2 pe-2 text-[12px] text-v2-text-text-faint`}
                  title={language.t("sidebar.hidden.projects.title")}
                  onClick={() => sidebar.setState("hiddenProjects", [])}
                >
                  <Icon name="outline-eye-slash" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                  <span class="min-w-0 flex-1 truncate">
                    {language.t("sidebar.hidden.projects", { count: hiddenProjectList().length })}
                  </span>
                </button>
              </Show>
              <Show when={showEmpty() || inactiveCount() > 0}>
                <button
                  type="button"
                  data-component="sidebar-projects-toggle"
                  class={`${ROW} mt-1 ps-2 pe-2 text-[12px] text-v2-text-text-faint`}
                  onClick={() => setShowEmpty(!showEmpty())}
                >
                  {showEmpty()
                    ? language.t("sidebar.projects.showActive")
                    : language.t("sidebar.projects.showAll", { count: inactiveCount() })}
                </button>
              </Show>
            </Show>

            <Menu
              modal={false}
              placement="bottom-start"
              gutter={2}
              open={menu.open}
              onOpenChange={(open) => setMenu("open", open)}
            >
              <Menu.Trigger
                as="span"
                aria-hidden="true"
                tabIndex={-1}
                class="pointer-events-none absolute size-px"
                style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
              />
              <Menu.Portal>
                <Menu.Content>
                  <Show when={menuPinAction()}>
                    {(action) => (
                      <>
                        <Menu.Item onSelect={action().run}>{action().label}</Menu.Item>
                        <Menu.Separator />
                      </>
                    )}
                  </Show>

                  <Show when={menuAction()}>
                    {(action) => (
                      <>
                        <Menu.Item onSelect={action().run}>{action().label}</Menu.Item>
                        <Menu.Separator />
                      </>
                    )}
                  </Show>

                  <Show when={menuDeleteAction()}>
                    {(action) => <Menu.Item onSelect={action().run}>{action().label}</Menu.Item>}
                  </Show>

                  <Show when={menuWorktree()}>
                    {(worktree) => (
                      <Show when={!worktree().main}>
                        <Menu.Item
                          onSelect={() => {
                            const target = menuTarget()

                            if (target.kind === "worktree") deleteWorktree(target.project, target.worktree)
                          }}
                        >
                          {language.t("sidebar.delete.worktree")}
                        </Menu.Item>
                        <Menu.Separator />
                      </Show>
                    )}
                  </Show>

                  <Show when={menuHiddenCount() > 0}>
                    <Menu.Group>
                      <Menu.GroupLabel>{menuScopeName()}</Menu.GroupLabel>
                      <For each={menuHidden().worktrees}>
                        {(worktree) => (
                          <Menu.Item onSelect={() => sidebar.showWorktree(worktree.key)}>
                            <Icon name="branch" size="small" />
                            {worktreeLabel(worktree)}
                          </Menu.Item>
                        )}
                      </For>
                      <For each={menuHidden().sessions}>
                        {(record) => (
                          <Menu.Item onSelect={() => sidebar.showSession(record.session.id)}>
                            {sessionLabel(record.session)}
                          </Menu.Item>
                        )}
                      </For>
                    </Menu.Group>
                    <Menu.Separator />
                    <Menu.Item onSelect={restoreScope}>
                      {language.t("sidebar.hidden.restoreScope", { scope: menuScopeName() })}
                    </Menu.Item>
                  </Show>

                  <Show when={menuTarget().kind === "global"}>
                    <Show
                      when={hiddenProjectList().length > 0}
                      fallback={<Menu.Item disabled>{language.t("sidebar.hidden.none")}</Menu.Item>}
                    >
                      <Menu.Group>
                        <Menu.GroupLabel>{language.t("sidebar.hidden.projects.title")}</Menu.GroupLabel>
                        <For each={hiddenProjectList()}>
                          {(project) => (
                            <Menu.Item onSelect={() => sidebar.showProject(project.key)}>{project.name}</Menu.Item>
                          )}
                        </For>
                      </Menu.Group>
                      <Menu.Separator />
                      <Menu.Item onSelect={() => sidebar.setState("hiddenProjects", [])}>
                        {language.t("sidebar.hidden.restoreAllProjects")}
                      </Menu.Item>
                    </Show>
                  </Show>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          </div>
        </ScrollView>

        <HomeUtilityNav
          class="mt-auto flex flex-col gap-1 px-2 pb-1 [&>button]:h-7.5 [&>button]:px-2 [&>button:hover]:bg-v2-background-bg-layer-02/60"
          onOpenSettings={projects.utility.settings}
          onOpenHelp={projects.utility.help}
          language={language}
        />
      </aside>
    </Show>
  )
}

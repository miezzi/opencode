import { Show, startTransition, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { useDialog } from "@opencode/ui/context/dialog"
import { prefersReducedMotion } from "@opencode/ui/motion"
import { Sidebar } from "@/sidebar/sidebar"
import { useSidebar } from "@/sidebar/state"
import { Titlebar } from "@/shell/titlebar/titlebar"
import { usePlatform } from "@/runtime/platform/platform"
import { ToastRegion } from "@/shell/notifications/toast"
import { UploadToastHost } from "@/composer/attachments/uploads"
import { useSettingsSurface } from "@/settings/surface"
import { useSettings } from "@/settings/model"
import { PluginServerCover } from "@/runtime/plugin/server-shell"
import { PluginSlot } from "@/runtime/plugin/render"
import { COMMAND_SEARCH_ID, type CommandOption, useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { useServers } from "@/runtime/server/registry"
import { useTabs } from "@/shell/tabs/tabs"
import {
  CollapsedSidebarToggle,
  collapsedSidebarToggleEnd,
  measureSidebarToggles,
  paintCollapsedSlots,
} from "@/shell/sidebar-toggle"
import { createPanelMotion, guardClosingFocus, panelOpacity } from "@/shell/panel-motion"
import { createSidebarPeek } from "@/shell/sidebar-peek"
import { windowDragEnabled } from "@/session/header/drag-area"

// How far Home steps along a peek's header to clear the collapsed toggle: to the toggle's end, from the sidebar's 18px
// start padding.
const homeClearance = collapsedSidebarToggleEnd - 18

type SidebarPose = { closed: number; peek: number | undefined }

export const sidebarToggleCommand = { id: "sidebar.toggle", keybind: "mod+shift+b" }

// The left column holds the tab sidebar over the project tree. Both share its width; the tree keeps the minimum.
const COLUMN_MIN = 220

const COLUMN_MAX = 560

const COLUMN_MIN_TABS_ONLY = 136

// Keeps the tab section from eating the tree, and the tree from collapsing while the divider is dragged.
const COLUMN_TREE_MIN = 180

export default function Layout(props: ParentProps) {
  const platform = usePlatform()
  const settings = useSettingsSurface()
  const preferences = useSettings()
  const command = useCommand()
  const language = useLanguage()
  const dialog = useDialog()
  const global = useGlobal()
  const servers = useServers()
  const tabs = useTabs()
  const appSidebar = useSidebar()
  const mobile = createMediaQuery("(max-width: 767px)")
  const wide = createMediaQuery("(min-width: 1024px)")

  const [state, setState] = createStore<{
    columnMount: HTMLElement | undefined
    tabsMount: HTMLElement | undefined
    tabsAside: HTMLElement | undefined
    tabsPanel: HTMLElement | undefined
  }>({
    columnMount: undefined,
    tabsMount: undefined,
    tabsAside: undefined,
    tabsPanel: undefined,
  })

  const verticalTabs = () => preferences.appearance.tabLayout() !== "horizontal" && !mobile()

  // One flag for the whole column: the tab section and the tree show or hide together.
  const columnOpen = () => preferences.appearance.sidebarOpen()
  // The tree below the tabs folds on its own, so the tabs keep their width without taking the whole column away.
  const treeAvailable = () => wide()
  const treeShown = () => treeAvailable() && appSidebar.state.treeOpen
  const columnWidth = () => appSidebar.state.width
  const columnHeight = () => state.tabsAside?.clientHeight ?? 800

  const toggleSidebar = () => {
    // A folded tree is the smallest the sidebar gets: the toggle brings it back before it hides the column.
    if (treeAvailable() && !appSidebar.state.treeOpen) {
      appSidebar.setTreeOpen(true)
      preferences.appearance.setSidebarOpen(true)

      return
    }

    preferences.appearance.setSidebarOpen(!columnOpen())
  }

  // How far closed the docked sidebar is, and how far in its peek has it, undefined while it isn't peeking.
  const sidebar: SidebarPose = {
    closed: columnOpen() ? 0 : 1,
    peek: undefined,
  }

  let peekSurface: HTMLDivElement | undefined
  let peekHome: HTMLElement | null | undefined

  // The docked sidebar and its peek are one sidebar, shown as far in as whichever has it further.
  const sidebarHidden = () => (sidebar.peek === undefined ? sidebar.closed : Math.min(sidebar.closed, 1 - sidebar.peek))

  // A peek slides the contents in its own box, where docking slides them by sizing the aside. Reduced motion fades
  // them in place instead.
  const paintSidebarContents = () => {
    const mount = state.columnMount

    if (!mount) return
    const peeking = sidebar.peek !== undefined
    const hidden = sidebarHidden()
    const fade = peeking && prefersReducedMotion()
    const rtl = document.documentElement.dir === "rtl"
    const shift = peeking && !fade && hidden > 0 ? `translateX(${(rtl ? 100 : -100) * hidden}%)` : ""
    const opacity = fade ? (hidden === 0 ? "" : `${1 - hidden}`) : panelOpacity(hidden)
    mount.style.opacity = opacity
    mount.style.transform = shift

    if (peekSurface) {
      // Lifted while it floats, and settling as a dock lands. It fades with the contents, so its hairline and shadow,
      // which reach past its end edge, leave with them rather than lingering at the window's edge.
      peekSurface.style.opacity = peeking ? `${sidebar.closed * Number(opacity || 1)}` : ""
      peekSurface.style.transform = shift
    }

    // Without traffic lights, Home starts the sidebar's header right where the collapsed toggle floats over a peek, so
    // it steps past the toggle until a dock carries the toggle to the header's end.
    if (peeking && peekHome === undefined)
      peekHome = mount.querySelector<HTMLElement>('[data-slot="sidebar-header"][data-home] > :first-child')

    if (peekHome)
      peekHome.style.transform = peeking ? `translateX(${(rtl ? -1 : 1) * homeClearance * sidebar.closed}px)` : ""

    if (!peeking) peekHome = undefined
  }

  const sidebarMotion = createPanelMotion({
    open: columnOpen,
    // The aside's real width moves main's edge with the sidebar's; its contents keep their width, pinned to that edge.
    paint: (closed) => {
      sidebar.closed = closed
      const aside = state.tabsAside

      if (aside) aside.style.width = `${columnWidth() * (1 - closed)}px`

      // Dims the contents, background included, as they leave and brightens them as they arrive.
      paintSidebarContents()
      paintCollapsedSlots(closed)
    },
    measure: () => measureSidebarToggles(columnWidth() * sidebarHidden()),
    // A dock from a peek already shows the sidebar, so reduced motion has nothing to fade in.
    element: () => (peek.handedOff() ? undefined : state.tabsPanel),
    distance: columnWidth,
  })

  const peek = createSidebarPeek({
    available: () => verticalTabs() && !columnOpen() && !sidebarMotion.present(),
    open: columnOpen,
    aside: () => state.tabsAside,
    panel: () => state.tabsPanel,
    paint: (shown) => {
      sidebar.peek = shown
      paintSidebarContents()
    },
    whenDocked: sidebarMotion.whenSettled,
  })

  guardClosingFocus({
    root: () => state.tabsAside,
    closing: () => !columnOpen() && sidebarMotion.present(),
    // The toggle that reopens the sidebar, outside it.
    target: () =>
      [...document.querySelectorAll<HTMLElement>('button[aria-controls="vertical-tabs-sidebar"]')].find(
        (button) => !state.tabsAside?.contains(button),
      ),
  })

  command.register("sidebar", () => {
    const commands: CommandOption[] = []

    if (verticalTabs() || treeAvailable())
      commands.push({
        ...sidebarToggleCommand,
        title: language.t("command.sidebar.toggle"),
        category: language.t("command.category.view"),
        onSelect: toggleSidebar,
      })

    if (treeAvailable())
      commands.push({
        id: "sidebar.tree.toggle",
        title: language.t("command.sidebar.tree.toggle"),
        keywords: "minimize hide sidebar projects tree minimizar ocultar proyectos",
        category: language.t("command.category.view"),
        section: "navigation",
        keybind: "f9",
        // F9 isn't typing, so it should work with the composer focused too.
        editable: true,
        onSelect: () => {
          const open = !appSidebar.state.treeOpen
          appSidebar.setTreeOpen(open)

          // Restoring the tree from a closed column brings the column back with it.
          if (open) preferences.appearance.setSidebarOpen(true)
        },
      })

    return commands
  })
  // Every surface has a palette: routes with their own register under the same key, and the newest wins.
  command.register("palette", () => [
    {
      id: "command.palette",
      title: language.t("command.palette"),
      hidden: true,
      onSelect: async () => {
        const conn = servers.visible.find((item) => servers.current(item)) ?? servers.visible[0]

        if (!conn) return
        const { HomeCommandPalette } = await import("@/home/start/command-palette")
        void dialog.show(() => (
          <HomeCommandPalette
            server={conn}
            onSelectSession={(entry) => {
              if (!entry.sessionID || !entry.directory || !entry.server) return
              const sessionID = entry.sessionID
              const server = entry.server
              global.ensureServerCtx(conn).projects.touch(entry.project?.worktree ?? entry.directory)
              void startTransition(() => {
                tabs.select(tabs.addSessionTab({ server, sessionId: sessionID }))
              })
            }}
          />
        ))
      },
    },
  ])
  command.register("commands", () => [
    {
      id: COMMAND_SEARCH_ID,
      title: language.t("command.commands.search"),
      category: language.t("command.category.view"),
      onSelect: async () => {
        const { DialogCommandSearch } = await import("@/shell/commands/command-search")
        void dialog.show(() => <DialogCommandSearch />)
      },
    },
  ])
  const bottomTitlebar = () => mobile() && preferences.general.mobileTitlebarPosition() === "bottom"
  const dragInset = () => windowDragEnabled(platform) && !mobile()

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        // Mobile panels only need clearance for their outer border.
        "--shell-inline-inset": mobile() ? "1px" : "8px",
        // A bottom mobile titlebar leaves main's top edge to the safe area. Native Windows chrome supplies the gap;
        // retain outer-outline clearance.
        "--shell-top-inset": bottomTitlebar()
          ? "0px"
          : platform.platform === "desktop" && platform.os === "windows"
            ? "1px"
            : "8px",
        "--shell-bottom-inset": bottomTitlebar()
          ? "8px"
          : "max(0px, calc(8px - var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))))",
      }}
    >
      <Titlebar verticalTabs={verticalTabs() ? { mount: state.tabsMount } : undefined} />
      <div class="relative flex flex-1 min-h-0 min-w-0 flex-row">
        {/* The empty inset above the panels moves the window, as the titlebar does. */}
        <Show when={dragInset()}>
          <div
            data-slot="shell-drag-inset"
            aria-hidden="true"
            class="absolute inset-x-0 top-0 h-[var(--shell-top-inset,8px)]"
            data-tauri-drag-region
          />
        </Show>
        <Show when={verticalTabs() || treeShown()}>
          <aside
            id="vertical-tabs-sidebar"
            data-slot="vertical-tabs-sidebar"
            data-state={columnOpen() ? "open" : "closed"}
            data-peek={peek.shown() ? "" : undefined}
            style={{ "--sidebar-peek-width": `${columnWidth()}px` }}
            ref={(element) => setState("tabsAside", element)}
            class="relative z-10 h-full min-h-0 shrink-0"
          >
            {/* Skipped rather than display: none or inert, so neither direction restyles the sidebar's contents and
                a reopen reuses their layout. */}
            <div
              ref={(element) => setState("tabsPanel", element)}
              data-slot="vertical-tabs-panel"
              class="absolute inset-0 overflow-hidden [contain:layout_style_paint]"
              classList={{ "[content-visibility:hidden]": !sidebarMotion.present() && !peek.shown() }}
            >
              {/* Under a peek's contents, so they dim over the sidebar's own background, as when docking, rather than
                  showing the content beneath through them. */}
              <div
                ref={peekSurface}
                data-slot="vertical-tabs-peek-surface"
                aria-hidden="true"
                class="pointer-events-none absolute inset-y-0 end-0 bg-v2-background-bg-deep shadow-[var(--v2-elevation-floating)]"
                style={{ width: `${columnWidth()}px` }}
              />
              <div
                ref={(element) => setState("columnMount", element)}
                data-slot="vertical-tabs-mount"
                class="absolute inset-y-0 end-0 contain-strict will-change-[opacity] flex min-h-0 flex-col bg-v2-background-bg-deep pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]"
                style={{
                  width: `${columnWidth()}px`,
                  "padding-bottom": "max(10px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
                }}
              >
                <Show when={verticalTabs()}>
                  {/* The portal replaces its mount's class list, so the section keeps the padding and the height. */}
                  <div
                    data-slot="vertical-tabs-portal"
                    class="flex min-h-0 flex-col pe-2.5 ps-4.5"
                    classList={{ "flex-1": !treeShown() }}
                    style={{
                      height: treeShown()
                        ? `min(${appSidebar.state.tabsHeight}px, calc(100% - ${COLUMN_TREE_MIN}px))`
                        : undefined,
                    }}
                  >
                    <div ref={(element) => setState("tabsMount", element)} class="flex min-h-0 flex-1 flex-col" />
                  </div>
                </Show>
                <Show when={verticalTabs() && treeShown()}>
                  <div class="relative h-0 shrink-0">
                    <ResizeHandle
                      direction="vertical"
                      edge="end"
                      size={appSidebar.state.tabsHeight}
                      min={120}
                      max={Math.max(140, columnHeight() - COLUMN_TREE_MIN)}
                      onResize={(height) => appSidebar.setState("tabsHeight", height)}
                    />
                  </div>
                </Show>
                <Show when={treeAvailable()}>
                  <div
                    class="flex min-h-0 flex-1 flex-col"
                    classList={{ "border-t border-v2-border-border-muted pt-1.5": verticalTabs() && treeShown() }}
                    style={{ display: treeShown() ? undefined : "none" }}
                  >
                    <Sidebar />
                  </div>
                </Show>
              </div>
            </div>
            {/* Takes the pointer while the sidebar closes, without restyling its contents. */}
            <div class="absolute inset-0 z-20" classList={{ hidden: columnOpen() || !sidebarMotion.present() }} />
            <Show when={columnOpen()}>
              <ResizeHandle
                class="-end-1"
                direction="horizontal"
                size={columnWidth()}
                min={treeShown() ? COLUMN_MIN : COLUMN_MIN_TABS_ONLY}
                max={COLUMN_MAX}
                onResize={(width) => appSidebar.setState("width", width)}
              />
            </Show>
          </aside>
        </Show>
        {/* Size containment collapses percentage-height descendants in WebKit. */}
        <main
          class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col items-start contain-content"
          style={{
            "padding-top": bottomTitlebar() ? "env(safe-area-inset-top, 0px)" : "0px",
            "padding-bottom":
              bottomTitlebar() || settings.active()
                ? "0px"
                : "var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))",
            "--settings-bottom-inset": bottomTitlebar()
              ? "40px"
              : "var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <PluginServerCover>
            <Suspense>{props.children}</Suspense>
          </PluginServerCover>
        </main>
        <CollapsedSidebarToggle />
      </div>
      <PluginSlot at="window.bottom" input={{}} />
      <ToastRegion />
      <UploadToastHost />
    </div>
  )
}

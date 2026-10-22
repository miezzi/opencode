# Sidebar fork

Update checklist: [`ACTUALIZAR.md`](./ACTUALIZAR.md) (Spanish, also kept at `~/Apps/OpenCode-Dev-ACTUALIZAR.md`).

Adds a persistent left sidebar to the desktop app that groups sessions by project and, inside each
project, by worktree:

```
▾ lumen                    12
  ▾ main                    4      ← root worktree
      Fix flaky reconnect   now
  ▾ feat/login              6      ← branch name, not the random worktree directory
      Login validation      1h
▸ harbor                    8
```

The tree lives in `packages/app/src/sidebar/`. `group.ts` is the pure grouping (and its tests);
`sidebar.tsx` is the UI; `state.tsx` holds the open/width/expanded state.

## Layout

The tab sidebar and the tree share one left column, tabs on top:

```
┌ tabs ───────────────────┐  ← upstream's vertical tabs, height from `tabsHeight`
│                         │
├──────── divider ────────┤  ← drag to resize; the height persists
│ [search]                │  ← Ctrl+Shift+F
│ Projects              + │  ← the project/worktree/session tree
│   …                     │
└─────────────────────────┘
```

- One width for the whole column (`sidebar.width`, persisted), shared with upstream's
  dock/peek/motion machinery; the divider between the two sections sets `sidebar.tabsHeight`.
- One toggle for the whole column: `Ctrl+Shift+B`, the tab header's toggle, and View ›
  Toggle Sidebar all show or hide tabs and tree together.
- The tree also folds on its own: the row at its foot (or `F9`) hides only the tree and gives the
  space back to the tabs. `F9`, `Ctrl+B`, `Ctrl+Shift+F` and `Ctrl+Shift+G` restore it. Settings
  and Help are not in the tree; they stay in Home and the mobile tabs menu.
- The tree is deliberately bare: it holds only its search field, the projects header, the tree
  itself and the Minimize row. Home, session search and new session stay in the tab section above,
  and the "Active" list lives in the tab sidebar's inbox, not here.
- Below 1024px the tree is not shown; the tabs column still is when the tab layout is vertical.
- Home hides its own projects column while the column is open.

## Build

```bash
./script/fork-build.sh
```

It copies the CLI from the installed official app (`/opt/OpenCode/resources/opencode-cli`, override
with `OPENCODE_CLI_SOURCE`) and produces
`packages/desktop/dist/opencode-desktop-linux-x86_64.AppImage`.

## Coexistence with the official app

- Channel `dev`: appId `ai.opencode.desktop.dev`, product "OpenCode Dev", package `opencode-dev`.
  The official app (`/opt/OpenCode`) is untouched and keeps auto-updating.
- **No self-update**: `fork-build.sh` exports `OPENCODE_FORK=1`, which drops the dev channel's update feed
  and disables the updater in the packaged app. Without it the app would pull upstream's dev build (its dev
  channel _does_ have a feed) and replace itself with a build that has no sidebar and bundles a different
  CLI, restarting the shared service.
- Sessions, projects, auth and config are shared: both apps talk to the same background service
  (`~/.local/state/opencode/service.json`).
- UI preferences (theme, tab layout, keybinds, sidebar state) live in this app's own userData.
- The bundled CLI version must match the service the official app runs, otherwise `ensure()` restarts
  that shared service. The build script copies the official CLI for exactly that reason.
- The built AppImage is copied to `~/Apps/OpenCode-Dev.AppImage` and launched from the desktop app
  grid as **OpenCode Dev**, through a user entry at
  `~/.local/share/applications/ai.opencode.desktop.dev.desktop` (icons under
  `~/.local/share/icons/hicolor/*/apps/`). The path never changes across rebuilds, so the entry
  survives updates. It deliberately does not claim `x-scheme-handler/opencode`, so `opencode://`
  links keep opening the official app.

## Remotes

- `origin` — upstream, `anomalyco/opencode`. Fetch-only for us.
- `mine` — this fork, `miezzi/opencode`.

## Updating

The short, step-by-step operator guide (Spanish, also copied to `~/Apps/OpenCode-Dev-ACTUALIZAR.md`) is
[`ACTUALIZAR.md`](./ACTUALIZAR.md).

```bash
git fetch origin --tags
cat /opt/OpenCode/resources/opencode-cli.version   # the version the official app runs
git rebase v2.2.0              # the matching tag; `origin/dev` when the tag does not exist yet
bun install --frozen-lockfile  # only if package.json / bun.lock changed
./script/fork-build.sh         # re-copies the official CLI, rebuilds and installs the AppImage
git push --force-with-lease --no-verify mine sidebar
```

Only the single `feat(app): project and worktree sidebar` commit sits on top of the tag, so the rebase is
usually clean. `origin/dev` works too if you prefer the moving tip. If the official app is an AppImage
instead of `/opt/OpenCode`, point the script at its CLI with
`OPENCODE_CLI_SOURCE=/path/to/resources/opencode-cli ./script/fork-build.sh`.

`--force-with-lease` is required because the rebase rewrites the branch. `--no-verify` skips the
repository pre-push hook, which demands bun >= 1.4.4; the commit already passed typecheck, lint and the
unit tests here. On another machine:

```bash
git clone --branch sidebar https://github.com/miezzi/opencode
cd opencode && bun install && ./script/fork-build.sh
```

## Current limits

- The tree only groups sessions into worktrees the project inventory still reports: a worktree removed
  from disk (even `rm -rf` without `git worktree prune`) disappears on the next inventory refresh, which
  happens when the window regains focus. Its sessions stay reachable from Home and search.
- The first run expands the most recently active project; projects without sessions stay behind a
  "Show N more projects" row until you ask for them.
- Hidden below 1024px (the mobile layout keeps its own navigation).
- Shows the focused server only.
- Sessions come from the same 64-per-directory index Home uses; older sessions are not listed. The Projects
  tree shows only the last month: `Ctrl+Shift+F` still searches everything in the index, older sessions
  included, and the counts next to each project follow the visible window.
- Hover a project, worktree or session for its row actions, with tooltips: `+` starts a session in that
  project or worktree and `×` removes the row. Right-click the row and pick "Remove … from sidebar" for
  the same removal. Nothing is deleted: hidden items never show in the sidebar again, and they stay
  reachable from `Ctrl+K` and the `/session` command.
- The context menu is scoped to what you right-click: on a project it lists that project's hidden
  worktrees and sessions; on a worktree, only its hidden sessions; on empty space (or the hidden-projects
  row) it lists hidden projects. Each scope restores one item or everything in that scope. A project with
  hidden rows shows "N hidden", and clicking it restores that project. A session's menu also offers
  "Delete session…", which asks for confirmation in the same dialog Home uses.
- The search field under the nav filters projects, worktrees and sessions as you type; matches expand
  automatically and `Esc` clears it.
- Sessions inside a worktree are grouped by age: Today, Yesterday, Last 7 days, Last 15 days, Last 30 days
  and Older (headers only when a worktree spans more than one bucket).
- Pin a session to keep it on top of its worktree: right-click → "Pin session", or focus the row and press
  `p`. Pinned rows show a pin marker and live under a "Pinned" header above the age groups.
- An "Active" section between the search field and the projects lists running agents plus sessions that
  finished, asked a question or raised a permission request (up to 5, then "+N more").
- A worktree's context menu can delete it for real (`git worktree remove`, with an optional force that
  discards uncommitted changes), next to the hide action.
- `Ctrl+B` focuses the sidebar, `Ctrl+Shift+G` jumps from the open chat to that session's row (opening
  and unhiding the tree on the way), `Ctrl+Shift+F` jumps to its search field, `Ctrl+Alt+A` jumps to the
  Active list (expanded, first running or attention session focused) and `Ctrl+Shift+M` focuses the chat
  composer, so you can move around without the mouse. `F9` folds or restores just the tree, even with
  the composer focused.
- These are ordinary commands, so **Settings → Shortcuts → Navigation** lists them with their current
  keys and lets you rebind them (the `Ctrl+K` palette shows them too); the list below is only the default.
- No drag & drop or rename from the sidebar yet; those stay on Home. A session can be deleted from its
  context menu, behind the same confirmation Home uses.
- `Ctrl+Shift+B` (or the command palette) toggles the sidebar. With it hidden, Home shows its own
  project column again, and opening it leaves the focus inside, ready for the arrow keys. `F9` folds
  only the tree, leaving the tabs in place.
- `Ctrl+B` focuses the sidebar without touching the mouse. Then `↑`/`↓` move between rows, `→`
  expands a project/worktree (or moves into its children), `←` collapses it (or moves to the parent),
  `Enter` opens the focused session (and toggles a project/worktree), `Home`/`End` jump, `Esc` leaves.

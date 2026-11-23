---
title: "Fork update to OpenCode v2.4.1: rebase conflicts and the moving target"
author: Miezzi
date: 2026-11-23
branch: sidebar
id: l-76a35b38
scope: repo
status: active
src: agent
---

The rebase target is not 'latest upstream': it is the tag in /opt/OpenCode/resources/opencode-cli.version, because the fork and the official app share the background service and fork-build.sh copies the official CLI. The official app auto-updates, so re-read that file right before the rebase and again before the build: on 2026-11-23 it moved from 2.3.2 to 2.4.1 mid-session and the first build bundled 2.4.1 for a 2.3.2 tree.

v2.4.x conflict points and how they were resolved:
- home/route.tsx: upstream added navigationPrototype, projectScope/searchInline/providerTip and now derives scroll from props.search.result.groups. Keep HomeView's props API (the new home.standalone.stories.tsx depends on it), let HomeOverview pull {projects,sessions,search} from useHomeData(), and gate the projects column with showProjects() = !mobile() && !props.projectScope && !(sidebarOpen && wide && treeOpen).
- home/provider.tsx must pass settings.appearance.navigationPrototype to createHomeSessionSearchController; otherwise the inline search of the navigation prototype never turns on.
- shell.tsx: keep upstream's data-focus-scope and use columnOpen() for data-state; the fork's columnWidth() replaces state.tabsWidth everywhere (the store no longer has tabsWidth).
- gui-plugins/src/updater/main.ts: the fork flag and the upstream check are not alternatives; the safe merge is packaged && !OPENCODE_FORK && existsSync(app-update.yml).
- ui/src/icons/catalog.ts: upstream now ships pin/home/branch, so the fork's own copies are duplicates and must be dropped (branch was added twice by the merge).
- home.standalone.stories.tsx: the fake controller data needs the fork's indexed/archived accessors.

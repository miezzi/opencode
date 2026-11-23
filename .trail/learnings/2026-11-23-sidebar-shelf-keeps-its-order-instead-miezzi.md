---
title: Sidebar shelf keeps its order instead of following project activity
author: Miezzi
date: 2026-11-23
branch: sidebar
id: l-a0fa4af2
scope: repo
status: active
src: agent
touches:
  - packages/app/src/sidebar/sidebar.tsx
  - packages/app/src/sidebar/group.ts
  - packages/app/src/sidebar/state.tsx
  - packages/core/src/project.ts
  - packages/app/src/runtime/server/sync.tsx
---

The server lists projects by time_active (Project.list orders by desc(time_active)) and Project.activate bumps it on every Location boot and on any durable session event, throttled to 60s per project. With background agents running, the project list changes every few seconds; the client applyProjectUpdate re-sorts by time.active and the sidebar used that order verbatim, so a running session dragged its whole project subtree to the front. The earlier focus fix only removed one trigger (worktree.refresh on focus); Locations and session events still activate projects, so the shelf cannot depend on recency. Fix (8549faf9d2): sidebar/state.tsx persists the order each project first took; group.ts orderSidebarProjects/nextProjectOrder apply it and append new projects. Verified by polling /api/project on the live service: the top-5 order changed 6 times in 75 seconds.

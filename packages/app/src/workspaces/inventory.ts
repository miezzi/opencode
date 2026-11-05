import type { QueryClient } from "@tanstack/solid-query"
import type { WorktreeDirectory } from "@opencode/client/promise"
import type { ServerApi } from "@/runtime/server/api"
import type { ServerScope } from "@/runtime/server/scope"
import type { Project } from "@/runtime/server/types"
import { sameDirectory } from "@opencode/util/path"

export function worktreeInventoryKey(scope: ServerScope, projectID: string) {
  return [scope, "worktree", projectID] as const
}

export function worktreeInventoryViewKey(scope: ServerScope, projectID?: string) {
  return [scope, "settings-workspace-inventory", projectID ?? null] as const
}

// Project metadata arrives without worktrees; a loaded inventory supplies the workspace list.
export function withWorktreeInventory(project: Project, worktrees: readonly WorktreeDirectory[] | undefined): Project {
  if (!worktrees) return project

  return {
    ...project,
    worktrees: [...worktrees],
    sandboxes: worktrees
      .map((item) => item.directory)
      .filter((directory) => !sameDirectory(project.worktree, directory)),
  }
}

// Rewriting an identical inventory replaces every project object and rebuilds the tree, which drops hover and
// pointer state while the sidebar is in use. Compare everything `withWorktreeInventory` would derive and leave
// the store alone when nothing changed.
export function sameWorktreeInventory(project: Project, next: readonly WorktreeDirectory[]) {
  if (!project.worktrees || project.worktrees.length !== next.length) return false

  const sameWorktrees = project.worktrees.every(
    (item, index) => item.directory === next[index]?.directory && item.strategy === next[index]?.strategy,
  )

  if (!sameWorktrees) return false

  const sandboxes = next.flatMap((item) => (sameDirectory(project.worktree, item.directory) ? [] : [item.directory]))

  return (
    (project.sandboxes?.length ?? 0) === sandboxes.length &&
    (project.sandboxes ?? []).every((directory, index) => directory === sandboxes[index])
  )
}

// Reads use saved inventory; explicit demand also discovers external worktree changes.
export function createWorktreeInventory(input: {
  scope: ServerScope
  queryClient: QueryClient
  api: () => Pick<ServerApi["worktree"], "list" | "refresh">
  updated: (projectID: string, worktrees: WorktreeDirectory[]) => void
}) {
  const options = (projectID: string) => ({
    queryKey: worktreeInventoryKey(input.scope, projectID),
    queryFn: () =>
      input
        .api()
        .list({ projectID })
        .then((items) => {
          input.updated(projectID, items)

          return items
        }),
    // `worktree.updated` and reconnect invalidation drive list reloads; time alone does not re-list.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })

  return {
    cached: (projectID: string) =>
      input.queryClient.getQueryData<WorktreeDirectory[]>(worktreeInventoryKey(input.scope, projectID)),
    list: (projectID: string) =>
      input.queryClient.fetchQuery({ ...options(projectID), staleTime: 0 }).catch(() => undefined),
    refresh: (projectID: string) =>
      input
        .api()
        .refresh({ projectID })
        .catch(() => undefined),
  }
}

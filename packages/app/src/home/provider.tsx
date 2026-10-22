import { createSimpleContext } from "@opencode/ui/context"
import { createHomeController } from "./model"
import { createHomeProjectsController } from "./projects/controller"
import { createHomeSessionsController } from "./sessions/controller"
import { createHomeSessionSearchController } from "./sessions/search"

/**
 * Home's data layer lives in the shell instead of the route: the app sidebar shows projects and sessions
 * on every screen, and duplicating these controllers would duplicate their session index and commands.
 */
export const { use: useHomeData, provider: HomeDataProvider } = createSimpleContext({
  name: "HomeData",
  gate: false,
  init: () => {
    const home = createHomeController()
    const projects = createHomeProjectsController(home)
    const sessions = createHomeSessionsController(home)
    const search = createHomeSessionSearchController(home, sessions)

    return { home, projects, sessions, search }
  },
})

# Actualizar el fork de OpenCode con sidebar

Guía corta de operación. El diseño y el detalle de cada cambio están en [`FORK.md`](./FORK.md).

## Qué es esto

- App: **OpenCode Dev** (el fork con la sidebar proyecto → worktree → sesiones).
- Binario: `~/Apps/OpenCode-Dev.AppImage` (el build lo deja ahí mismo).
- Se abre desde el buscador de aplicaciones como **OpenCode Dev**; la entrada
  `~/.local/share/applications/ai.opencode.desktop.dev.desktop` apunta a esa ruta, así que sobrevive a
  cada rebuild.
- Código: este repo, branch `sidebar`, **un solo commit** encima del tag de la app oficial.

## Actualizar (después de que se actualice la app oficial)

```bash
cd /media/miezzi/data_linux/Source/opencode
git fetch --tags origin

# Versión que corre la app oficial; el rebase va al tag que le corresponde.
cat /opt/OpenCode/resources/opencode-cli.version

git rebase v2.2.0          # o origin/dev si el tag todavía no existe
bun install --frozen-lockfile

./script/fork-build.sh     # recompila y reemplaza ~/Apps/OpenCode-Dev.AppImage
git push --force-with-lease --no-verify mine sidebar
```

Antes de dar por buena una actualización:

```bash
bun run --cwd packages/app typecheck
bun test --conditions=solid --isolate --preload ../ui/test/solid-jsx.ts \
  --preload ./happydom.ts ./src/sidebar        # desde packages/app
```

Después cerrá **todas** las ventanas de OpenCode Dev y abrila de nuevo: la instancia en marcha sigue con
el binario viejo hasta que la reiniciás.

## La regla que importa: el CLI bundleado

El fork y la app oficial **comparten el background service** (`~/.local/state/opencode/service.json`):
mismas sesiones, proyectos y auth. Si el CLI que trae el fork no es idéntico al que corre el servicio,
al abrirlo lo reinicia.

Por eso `fork-build.sh` copia el CLI desde `/opt/OpenCode/resources/` en cada build. Si la app oficial está
instalada en otra ruta:

```bash
OPENCODE_CLI_SOURCE=/ruta/a/resources/opencode-cli ./script/fork-build.sh
```

## El updater está apagado a propósito

`fork-build.sh` exporta `OPENCODE_FORK=1`. Con ese flag:

- el empaquetado **no lleva feed de updates** (no se genera `app-update.yml`);
- el updater queda **desactivado** en el proceso main.

Sin eso, el appId compartido con el canal `dev` de upstream hace que la app se baje sola el nightly de
upstream (`0.0.0-dev-88` y siguientes) y se instale encima: te quedás sin sidebar, con otro CLI y con el
servicio reiniciado. **Si OpenCode Dev te ofrece una actualización, estás corriendo el build de upstream**:
cerralo sin aceptar y volvé a correr `./script/fork-build.sh`.

## Si el rebase tiene conflictos

El commit toca, sobre todo, `packages/app/src/shell/shell.tsx`, `packages/app/src/sidebar/` y
`packages/app/src/home/`. Si upstream volvió a mover el shell, resolvé a mano manteniendo estos puntos:

1. `HomeDataProvider` + `SidebarProvider` envuelven `<Shell>` en `shell/routes/routes.tsx`.
2. La columna vive en `shell.tsx`: tabs arriba (`sidebar.tabsHeight`), divisor, árbol abajo.
3. `Home` consume `useHomeData()` y `useSidebar()` en vez de crear los controllers.
4. El comando de la columna es `sidebar.toggle` (de upstream); el árbol usa `sidebar.tree.toggle`.

## Atajos y comportamiento

- La columna comparte un solo ancho: tabs arriba y el árbol abajo. El divisor del medio reparte el alto y
  se recuerda.
- El árbol tiene el buscador, la lista de proyectos y una fila **Minimizar** al pie: Home, buscar
  sesiones, nueva sesión y la lista de activas viven en la sección de tabs de arriba.
- `Ctrl+Shift+B` muestra u oculta la columna entera (también el toggle del header de tabs, View › Toggle
  Sidebar y la paleta).
- `F9` minimiza solo el árbol —las tabs quedan arriba— y `F9` lo vuelve a mostrar. También lo restauran
  `Ctrl+B`, `Ctrl+Shift+F` y `Ctrl+Shift+G`.
- `Ctrl+B` lleva el foco al árbol. Después: `↑`/`↓` mover, `→` expandir/entrar, `←` colapsar/volver al
  padre, `Enter` abrir la sesión (o expandir un grupo), `Home`/`End`, `Esc` salir.
- `Ctrl+Shift+G` va desde el chat a la fila de esa sesión; `Ctrl+Shift+F` al buscador del sidebar;
  `Ctrl+Alt+A` a las sesiones activas; `Ctrl+Shift+M` al composer.
- Buscador debajo del nav: filtra proyectos, worktrees y sesiones; `Esc` limpia.
- Botón derecho con alcance: en un proyecto lista sus worktrees/sesiones ocultos; en un worktree, sus
  sesiones; en vacío, los proyectos. Nada se borra: lo oculto sigue en `Ctrl+K` y `/session`.
- Menú del worktree → `Borrar worktree…` lo elimina de verdad (`git worktree remove`, con opción de forzar).
- Fijar sesiones: botón derecho → `Fijar sesión`, o `p` con la fila enfocada.
- Todo esto son comandos: se ven y se cambian en **Ajustes → Atajos → Navegación**.
- El estado del sidebar (abierto, ancho, alto de tabs, árbol minimizado, filas expandidas) se guarda por
  app, no se comparte con la oficial.

## Si algo sale mal

```bash
cd /media/miezzi/data_linux/Source/opencode
git rebase --abort            # si quedó a mitad de rebase
git checkout sidebar
git log --oneline -3          # debería ser un commit sobre el tag
```

Volver a un AppImage anterior: `~/Apps/OpenCode-Dev.AppImage` no guarda historial, así que se recompila con
`./script/fork-build.sh` desde el commit que quieras. La app oficial (`/opt/OpenCode`) no se toca en ningún
momento: podés usarla mientras el fork no compile.

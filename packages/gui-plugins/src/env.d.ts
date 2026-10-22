interface ImportMetaEnv {
  /** The commit a beta desktop build was built from; undefined in every other build. */
  readonly OPENCODE_COMMIT?: string
  /** A beta desktop build's commit, recent history and notes as JSON (packages/desktop/script/beta-notes.ts). */
  readonly OPENCODE_BETA_NOTES?: string
  /** True in a fork build (script/fork-build.sh), which pins its own AppImage and must never self-update. */
  readonly OPENCODE_FORK: boolean
}

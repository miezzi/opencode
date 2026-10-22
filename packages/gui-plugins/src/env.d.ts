interface ImportMetaEnv {
  /** True in a fork build (script/fork-build.sh), which pins its own AppImage and must never self-update. */
  readonly OPENCODE_FORK: boolean
}

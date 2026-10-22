interface ImportMetaEnv {
  readonly OPENCODE_CHANNEL: string
  readonly OPENCODE_VERSION?: string
  readonly OPENCODE_FORK: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/// <reference types="vite/client" />

// libheif-js ships its .mjs bundle without a matching declaration file.
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factory: (options?: Record<string, unknown>) => Promise<any>
  export default factory
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

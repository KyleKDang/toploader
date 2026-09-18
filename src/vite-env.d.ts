/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  readonly VITE_SENTRY_DSN: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';

/*
 * Source maps exist only to make Sentry's stack traces readable, so they are
 * built only where they can be uploaded: where SENTRY_AUTH_TOKEN is set, which
 * is the Render build. They are "hidden" (no sourceMappingURL comment),
 * uploaded, then deleted from dist/ before Render publishes it, so the
 * deployed site never serves them.
 */
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  build: { sourcemap: uploadSourceMaps ? 'hidden' : false },
  plugins: [
    react(),
    tailwindcss(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !uploadSourceMaps,
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    }),
  ],
});

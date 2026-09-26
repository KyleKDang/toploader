import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';

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
    /*
     * Installability (spec, Architecture; ADR-0002): the manifest, and the
     * service worker in src/sw.ts, into which the build injects the list of
     * files the offline shell caches. The app registers the worker itself
     * (src/main.tsx). The name is the one #33 settled, used verbatim.
     */
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      // The glob below already takes in every icon.
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
      },
      manifest: {
        name: 'Toploader',
        short_name: 'Toploader',
        description:
          'Organize in-person trades with other collectors in your city.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // --color-bg, light: the splash screen and the window's frame. The
        // page itself sets a dark theme color for dark mode (index.html).
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // The worker in `npm run dev` too, so push works there as it did.
      devOptions: { enabled: true, type: 'module' },
    }),
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

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      // Seam 1: supabase-js clients against the local stack (`supabase start`).
      'tests/db/**/*.test.ts',
      // Seam 2: edge/scheduled functions against the same stack, external HTTP
      // faked at the network edge.
      'tests/functions/**/*.test.ts',
      // The test harness's own wait for the stack, PostgREST faked at the
      // network edge.
      'tests/local-stack.test.ts',
      // The browser suite's check of the edge runtime, faked at the network
      // edge.
      'tests/browser-global-setup.test.ts',
    ],
    globalSetup: ['tests/db/global-setup.ts'],
    environment: 'node',
  },
});

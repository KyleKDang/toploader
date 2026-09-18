import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Seam 1: supabase-js clients against the local stack (`supabase start`).
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/global-setup.ts'],
    environment: 'node',
  },
});

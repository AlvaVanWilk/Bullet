import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Relative base: the same build runs in /bullet/ and in /bullet-test/.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'safari15',
    // The single-file preview carries its fonts inside.
    assetsInlineLimit: process.env.VITE_PREVIEW ? 10_000_000 : 4096,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});

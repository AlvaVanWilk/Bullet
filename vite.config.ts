import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

/**
 * The text recognition for photos of invoices (tesseract.js) runs on the
 * device. Its worker, core and German language data are served from our own
 * folder ocr/ instead of a foreign CDN, and are only loaded when needed.
 */
const OCR_FILES: Record<string, string> = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'deu.traineddata.gz': '@tesseract.js-data/deu/4.0.0_best_int/deu.traineddata.gz',
};
const ocrFile = (name: string) => readFileSync(join(__dirname, 'node_modules', OCR_FILES[name]));

function ocrFiles(): Plugin {
  return {
    name: 'bullet-ocr-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/\/ocr\/([^?]+)/)?.[1];
        if (!name || !OCR_FILES[name]) return next();
        res.setHeader('Content-Type', name.endsWith('.gz') ? 'application/octet-stream' : 'text/javascript');
        res.end(ocrFile(name));
      });
    },
    generateBundle() {
      // the single-file preview has no text recognition
      if (process.env.VITE_PREVIEW) return;
      for (const name of Object.keys(OCR_FILES)) {
        this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: ocrFile(name) });
      }
    },
  };
}

// Relative base: the same build runs in /bullet/ and in /bullet-test/.
export default defineConfig({
  base: './',
  plugins: [preact(), ocrFiles()],
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

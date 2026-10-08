// Reading the text of a photo (an invoice) on the device with tesseract.js.
// Nothing leaves the device; the recognition and its German language data are
// loaded from our own folder ocr/ the first time, then kept by the browser.

import type { Worker } from 'tesseract.js';

let worker: Promise<Worker> | null = null;
let progress: ((share: number) => void) | null = null;

function start(): Promise<Worker> {
  const base = new URL('ocr/', location.href).href;
  return import('tesseract.js').then(({ createWorker, OEM }) => createWorker('deu', OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base,
    logger: (m) => {
      if (m.status === 'recognizing text') progress?.(m.progress);
    },
  }));
}

/** The text on the picture; onProgress gets 0…1 while reading. */
export async function readText(picture: Blob, onProgress?: (share: number) => void): Promise<string> {
  worker ??= start().catch((err) => {
    worker = null;
    throw err;
  });
  const w = await worker;
  progress = onProgress ?? null;
  try {
    const { data } = await w.recognize(picture);
    return data.text;
  } finally {
    progress = null;
  }
}

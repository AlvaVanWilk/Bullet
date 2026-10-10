// A very small PDF writer: one picture (JPEG) per A4 page, filling it. Enough
// to share or print a task as it looks (Share.tsx draws the pages).

export interface PdfPage {
  /** JPEG bytes */
  jpeg: Uint8Array;
  /** size of the picture in pixels */
  width: number;
  height: number;
}

/** A4 in points */
const A4: [number, number] = [595.28, 841.89];

export function makePdf(pages: PdfPage[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, body: () => void) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%âãÏÓ\n');
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    const image = page + 1;
    const content = page + 2;
    const draw = `q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`;
    object(page, () => push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`,
    ));
    object(image, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
    object(content, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

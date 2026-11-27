// Minimal PNG decode/encode for tools/shot.mjs stitching (8-bit RGB/RGBA, non-interlaced — what Chrome writes).
import { inflateSync, deflateSync } from "node:zlib";

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };

/** -> { width, height, data: Buffer (RGBA, 4 bytes/px) } */
export function decodePNG(buf) {
  let p = 8, width = 0, height = 0, depth = 0, ctype = 0, inter = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; ctype = body[9]; inter = body[12]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 || (ctype !== 6 && ctype !== 2) || inter) throw new Error(`png: unsupported format (depth ${depth}, color ${ctype}, interlace ${inter})`);
  const bpp = ctype === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height); let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
    prev = out;
  }
  if (bpp === 4) return { width, height, data: px };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) { rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = 255; }
  return { width, height, data: rgba };
}

/** Stack images top to bottom (widths must match). */
export function stackPNG(imgs) {
  const width = imgs[0].width; if (imgs.some((i) => i.width !== width)) throw new Error("png: slice widths differ");
  return { width, height: imgs.reduce((s, i) => s + i.height, 0), data: Buffer.concat(imgs.map((i) => i.data)) };
}

export function encodePNG({ width, height, data }) {
  const stride = width * 4, raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 2; const cur = data.subarray(y * stride, (y + 1) * stride), dst = raw.subarray(y * (stride + 1) + 1);   // filter "Up"
    if (y === 0) cur.copy(dst); else { const up = data.subarray((y - 1) * stride, y * stride); for (let i = 0; i < stride; i++) dst[i] = (cur[i] - up[i]) & 255; } }
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type, "latin1"), body]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(tb)); return Buffer.concat([len, tb, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

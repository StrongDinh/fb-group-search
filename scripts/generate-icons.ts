/**
 * Generate simple PNG icons for the extension.
 * Creates flat-color rounded-rect icons with a magnifying glass (text-based).
 * No dependencies — builds valid PNG from scratch.
 */

import * as fs from "fs";
import * as path from "path";
import { deflateSync } from "zlib";

function createPNG(width: number, height: number): Buffer {
  // BGRA pixel data
  const pixels = Buffer.alloc(width * height * 4);

  // Colors
  const [bgR, bgG, bgB] = [0x18, 0x77, 0xf2]; // Facebook blue
  const [fgR, fgG, fgB] = [0xff, 0xff, 0xff]; // White

  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.35;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Rounded rect background
      const cornerR = Math.min(width, height) * 0.15;
      let inBg = true;
      if (x < cornerR && y < cornerR) {
        inBg = Math.hypot(x - cornerR, y - cornerR) <= cornerR;
      } else if (x >= width - cornerR && y < cornerR) {
        inBg = Math.hypot(x - (width - cornerR - 1), y - cornerR) <= cornerR;
      } else if (x < cornerR && y >= height - cornerR) {
        inBg = Math.hypot(x - cornerR, y - (height - cornerR - 1)) <= cornerR;
      } else if (x >= width - cornerR && y >= height - cornerR) {
        inBg = Math.hypot(x - (width - cornerR - 1), y - (height - cornerR - 1)) <= cornerR;
      }

      if (inBg) {
        // Magnifying glass circle
        const dx = x - cx + r * 0.3;
        const dy = y - cy + r * 0.3;
        const dist = Math.hypot(dx, dy);
        const glassRing = dist >= r * 0.7 && dist <= r;
        const handleThick = r * 0.3;

        // Handle line (diagonal from bottom-right of circle)
        const hx = x - (cx + r * 0.55);
        const hy = y - (cy + r * 0.55);
        const hProj = (hx * 0.707 + hy * 0.707); // project onto diagonal
        const hPerp = Math.abs(-hx * 0.707 + hy * 0.707);
        const handle = hProj >= 0 && hProj <= r * 0.8 && hPerp <= handleThick;

        if (glassRing || handle) {
          pixels[idx] = fgB;     // B
          pixels[idx + 1] = fgG; // G
          pixels[idx + 2] = fgR; // R
          pixels[idx + 3] = 255;  // A
        } else {
          pixels[idx] = bgB;
          pixels[idx + 1] = bgG;
          pixels[idx + 2] = bgR;
          pixels[idx + 3] = 255;
        }
      } else {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  return encodePNG(width, height, pixels);
}

function encodePNG(width: number, height: number, pixels: Buffer): Buffer {
  // Filter byte (0 = None) before each row
  const rawRows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    rawRows.push(Buffer.from([0])); // filter: None
    rawRows.push(pixels.subarray(rowStart, rowStart + width * 4));
  }
  const raw = Buffer.concat(rawRows);
  const compressed = deflateSync(raw);

  // PNG chunks
  const chunks: Buffer[] = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  chunks.push(pngChunk("IHDR", ihdr));

  // IDAT
  chunks.push(pngChunk("IDAT", compressed));

  // IEND
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBytes, data]);
  const crc = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeBytes, data, crcBuf]);
}

// CRC32 for PNG
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c;
}

function crc32(data: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Main ──

const OUT_DIR = path.resolve(__dirname, "../extension/icons");
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = createPNG(size, size);
  fs.writeFileSync(path.join(OUT_DIR, `icon${size}.png`), png);
  console.log(`  ✅ icon${size}.png (${png.length} bytes)`);
}
console.log("Icons generated!");

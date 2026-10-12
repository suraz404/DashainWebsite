import { randomBytes } from "crypto";
import { deflateSync } from "zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function ihdr(width: number, height: number, colorType: number) {
  const d = Buffer.alloc(13);
  d.writeUInt32BE(width, 0);
  d.writeUInt32BE(height, 4);
  d[8] = 8; // bit depth
  d[9] = colorType;
  return chunk("IHDR", d);
}

interface Options {
  width?: number;
  height?: number;
  /** 6 = RGBA (what our exporter makes), 2 = RGB (no alpha). */
  colorType?: 2 | 6;
  /** "ink": a visible dark stroke on transparent. "blank": every pixel fully transparent. "noise": incompressible. */
  content?: "ink" | "blank" | "noise";
}

/** Builds a genuinely decodable PNG (correct CRCs and zlib stream). */
export function makePng({ width = 400, height = 160, colorType = 6, content = "ink" }: Options = {}): Buffer {
  const bpp = colorType === 6 ? 4 : 3;
  const rowLen = width * bpp;
  const raw = Buffer.alloc((rowLen + 1) * height); // filter byte 0 per row, pixels default to 0 (transparent black)
  for (let y = 0; y < height; y++) {
    const row = y * (rowLen + 1);
    if (content === "noise") randomBytes(rowLen).copy(raw, row + 1);
    else if (content === "ink" || colorType === 2) {
      // a horizontal "stroke" across the middle third: dark ink, fully opaque
      if (colorType === 2 || (y > height * 0.4 && y < height * 0.6)) {
        for (let x = Math.floor(width * 0.1); x < width * 0.9; x++) {
          const i = row + 1 + x * bpp;
          raw[i] = 0x1a;
          raw[i + 1] = 0x1a;
          raw[i + 2] = 0x2e;
          if (bpp === 4) raw[i + 3] = 255;
        }
      }
    }
  }
  const idat = content === "noise" ? deflateSync(raw, { level: 0 }) : deflateSync(raw);
  return Buffer.concat([SIG, ihdr(width, height, colorType), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

/** A valid header followed by garbage pixel data: passes header checks, fails a real decode. */
export function makeCorruptPng(width = 400, height = 160): Buffer {
  return Buffer.concat([SIG, ihdr(width, height, 6), chunk("IDAT", randomBytes(200)), chunk("IEND", Buffer.alloc(0))]);
}

/** Header says it's big, pixel data is tiny: lets us test dimension limits cheaply. */
export function makeHeaderOnlyPng(width: number, height: number): Buffer {
  return Buffer.concat([SIG, ihdr(width, height, 6), chunk("IEND", Buffer.alloc(0))]);
}

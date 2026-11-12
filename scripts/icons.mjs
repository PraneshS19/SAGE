import { Buffer } from "node:buffer";
import sharp from "sharp";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#111"/><path d="M27 35c14-3 27 0 37 8 10-8 23-11 37-8v58c-14-3-27 0-37 8-10-8-23-11-37-8V35Z" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="M64 44v55M40 52l12 4M40 66l12 4M77 56l12-4M77 70l12-4" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`;
for (const size of [16, 32, 48, 128])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${size}.png`);

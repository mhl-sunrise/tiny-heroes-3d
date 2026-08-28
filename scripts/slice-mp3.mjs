// Usage: node scripts/slice-mp3.mjs <in.mp3> <out.mp3> <startSec> <durSec>
// Extracts a time slice from an MPEG1 Layer III MP3 by concatenating whole
// frames (works for CBR and VBR) -- no re-encoding, quality preserved.
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath, startArg, durArg] = process.argv;
if (!inPath || !outPath || !startArg || !durArg) {
  console.error("Usage: node scripts/slice-mp3.mjs <in.mp3> <out.mp3> <startSec> <durSec>");
  process.exit(1);
}
const startSec = Number(startArg);
const durSec = Number(durArg);
const data = readFileSync(inPath);

// skip ID3v2 tag if present
let off = 0;
if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
  const size =
    ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f);
  off = 10 + size;
}
// align to first MPEG frame sync
while (off < data.length - 4 && !(data[off] === 0xff && (data[off + 1] & 0xe0) === 0xe0)) off++;

const word = (at) =>
  ((data[at] << 24) | (data[at + 1] << 16) | (data[at + 2] << 8) | data[at + 3]) >>> 0;
const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]; // kbps, MPEG1 L3
const SAMPLE_RATES = [44100, 48000, 32000, 0];

function parseFrame(at) {
  const x = word(at);
  if (((x >>> 21) & 7) !== 7) return null; // bad sync
  const version = (x >>> 19) & 3; // 3 = MPEG1
  const layer = (x >>> 17) & 3; // 1 = Layer III
  if (version !== 3 || layer !== 1) return null; // only MPEG1 Layer 3 supported here
  const br = BITRATES[(x >>> 12) & 0xf] * 1000;
  const sr = SAMPLE_RATES[(x >>> 10) & 3];
  const padding = (x >>> 9) & 1;
  if (!br || !sr) return null;
  return { br, sr, frameSize: Math.floor((144 * br) / sr) + padding, frameDur: 1152 / sr };
}

// Walk frames from the start, accumulating time. Works for CBR and VBR
// (each frame's duration is always 1152/sr for MPEG1 Layer III).
const frames = [];
let at = off;
let time = 0;
while (at + 4 <= data.length) {
  const f = parseFrame(at);
  if (!f || at + f.frameSize > data.length) break;
  frames.push({ at, size: f.frameSize, dur: f.frameDur });
  at += f.frameSize;
  time += f.frameDur;
  if (time > startSec + durSec + 10) break; // no need to parse the whole file
}
if (time < startSec + durSec) {
  console.error(`Requested slice ends past end of file (parsed ${time.toFixed(1)}s total)`);
  process.exit(1);
}

// find first frame at/after startSec, then take whole frames until we have durSec
let i = 0;
let acc = 0;
while (i < frames.length && acc < startSec) {
  acc += frames[i].dur;
  i++;
}
const picked = [frames[i]];
acc += frames[i].dur;
while (acc < startSec + durSec && i + 1 < frames.length) {
  i++;
  picked.push(frames[i]);
  acc += frames[i].dur;
}
const startByte = picked[0].at;
const endByte = picked[picked.length - 1].at + picked[picked.length - 1].size;
writeFileSync(outPath, data.subarray(startByte, endByte));
const sliceBytes = endByte - startByte;
console.log(
  `OK: +${startSec}s for ${durSec}s -> ${sliceBytes / 1024 / 1024} MB, ` +
    `${picked.length} frames (${picked.reduce((s, fr) => s + fr.dur, 0).toFixed(1)}s)`
);

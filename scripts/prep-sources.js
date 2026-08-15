// Builds sources/: each accessory as a clean, trimmed, transparent PNG.
// These are what the studio's move/resize tool re-renders layers from.
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { removeWhite } = require('./remove-white');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'sources');

const ITEMS = [
  ['C:/Users/rigby/Downloads/ciggy (1) trait.png', 'cig.png'],
  ['C:/Users/rigby/Downloads/bnb earing.jpg', 'bnb earring.png'],
  ['C:/Users/rigby/Downloads/HAT TRAIT.png', 'black cap.png'],
  ['C:/Users/rigby/Downloads/gold chain trait.png', 'gold chain.png'],
];

async function prep(src, destName) {
  let work = src;
  const meta = await sharp(src).metadata();
  if (!meta.hasAlpha) {
    work = path.join(os.tmpdir(), 'prep-' + destName);
    await removeWhite(src, work);
  }
  const { data, info } = await sharp(work).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toFile(path.join(OUT, destName));
  console.log('source ready: sources/' + destName);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [src, dest] of ITEMS) await prep(src, dest);
})().catch((e) => { console.error(e); process.exit(1); });

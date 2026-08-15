// Cleans white-blended anti-aliasing fringe on images that ALREADY have transparency
// (ChatGPT transparent exports): erodes the visible edge inward, then feathers it.
// Usage: node scripts/defringe.js "<src.png>" "<dest.png>" [erodePx=1]
const sharp = require('sharp');

async function defringe(src, dest, erode = 1) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  // background = transparent-ish pixels
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) if (data[p * 4 + 3] < 40) mask[p] = 1;

  for (let e = 0; e < erode; e++) {
    const ring = [];
    for (let p = 0; p < W * H; p++) {
      if (mask[p]) continue;
      const x = p % W, y = (p / W) | 0;
      let touch = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1 && !touch; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[ny * W + nx]) touch = true;
        }
      }
      if (touch) ring.push(p);
    }
    for (const p of ring) mask[p] = 1;
  }
  for (let p = 0; p < W * H; p++) if (mask[p]) data[p * 4 + 3] = 0;

  // feather: 3x3 box blur on alpha, two passes
  for (let pass = 0; pass < 2; pass++) {
    const src2 = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) src2[p] = data[p * 4 + 3];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            sum += src2[ny * W + nx];
            n++;
          }
        }
        data[(y * W + x) * 4 + 3] = Math.round(sum / n);
      }
    }
  }

  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(dest);
  console.log('defringed ' + dest + ' (erode ' + erode + 'px)');
}

module.exports = { defringe };

if (require.main === module) {
  const [src, dest, erode] = process.argv.slice(2);
  if (!src || !dest) { console.error('usage: node scripts/defringe.js <src> <dest> [erodePx]'); process.exit(1); }
  defringe(src, dest, parseInt(erode, 10) || 1).catch((e) => { console.error(e); process.exit(1); });
}

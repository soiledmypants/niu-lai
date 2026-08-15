// Removes a flat white/near-white studio background by flood-filling from the image borders,
// so white/cream areas INSIDE the character (muzzle, eyes) are preserved.
// Usage: node scripts/remove-white.js "<src.png>" "<dest.png>"
const sharp = require('sharp');

const BG_MIN = 225;   // min(r,g,b) must be at least this to count as background
const BG_NEUTRAL = 14; // max(r,g,b) - min(r,g,b) must be under this (grays/whites only)

async function removeWhite(src, dest) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const isBg = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
    return mn >= BG_MIN && mx - mn <= BG_NEUTRAL;
  };

  const mask = new Uint8Array(W * H); // 1 = background
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }

  while (stack.length) {
    const p = stack.pop();
    if (mask[p]) continue;
    if (!isBg(p * 4)) continue;
    mask[p] = 1;
    const x = p % W, y = (p / W) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - W);
    if (y < H - 1) stack.push(p + W);
  }

  let removed = 0;
  for (let p = 0; p < W * H; p++) {
    if (mask[p]) { data[p * 4 + 3] = 0; removed++; }
  }

  // feather: soften bright neutral pixels that touch the removed region (kills the white fringe)
  for (let p = 0; p < W * H; p++) {
    if (mask[p]) continue;
    const x = p % W, y = (p / W) | 0;
    const touching =
      (x > 0 && mask[p - 1]) || (x < W - 1 && mask[p + 1]) ||
      (y > 0 && mask[p - W]) || (y < H - 1 && mask[p + W]);
    if (!touching) continue;
    const i = p * 4;
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    if (mn >= 180 && mx - mn <= 24) {
      data[i + 3] = Math.max(0, Math.min(255, (235 - mn) * 4 + 60));
    }
  }

  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(dest);
  const pct = ((removed / (W * H)) * 100).toFixed(1);
  console.log('wrote ' + dest + ' (' + pct + '% background removed)');
}

const [src, dest] = process.argv.slice(2);
if (!src || !dest) { console.error('usage: node scripts/remove-white.js <src> <dest>'); process.exit(1); }
removeWhite(src, dest).catch((e) => { console.error(e); process.exit(1); });

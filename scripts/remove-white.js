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

  // erode the character edge inward — eats the white-blended anti-aliasing ring
  const ERODE = 2;
  for (let e = 0; e < ERODE; e++) {
    const ring = [];
    for (let p = 0; p < W * H; p++) {
      if (mask[p]) continue;
      const x = p % W, y = (p / W) | 0;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) {
        for (let dx = -1; dx <= 1 && !touch; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) { touch = true; break; }
          if (mask[ny * W + nx]) touch = true;
        }
      }
      if (touch) ring.push(p);
    }
    for (const p of ring) mask[p] = 1;
  }

  let removed = 0;
  for (let p = 0; p < W * H; p++) {
    if (mask[p]) { data[p * 4 + 3] = 0; removed++; }
  }

  // soften the cut: 3x3 box blur on the alpha channel (two passes) for a smooth edge
  for (let pass = 0; pass < 2; pass++) {
    const src = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) src[p] = data[p * 4 + 3];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            sum += src[ny * W + nx];
            n++;
          }
        }
        data[(y * W + x) * 4 + 3] = Math.round(sum / n);
      }
    }
  }

  await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toFile(dest);
  const pct = ((removed / (W * H)) * 100).toFixed(1);
  console.log('wrote ' + dest + ' (' + pct + '% background removed, edge eroded ' + ERODE + 'px + feathered)');
}

const [src, dest] = process.argv.slice(2);
if (!src || !dest) { console.error('usage: node scripts/remove-white.js <src> <dest>'); process.exit(1); }
removeWhite(src, dest).catch((e) => { console.error(e); process.exit(1); });

// Places a standalone item render (product-shot style) onto the 1254x1254 layer canvas.
// Usage: node scripts/place-trait.js --src "<item.png>" --dest "<layer.png>" --width 280 --left 630 --top 660 [--rotate deg] [--flipv] [--fliph] [--canvas 1254]
const sharp = require('sharp');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith('--')) {
    const name = k.slice(2);
    const next = process.argv[i + 1];
    if (!next || next.startsWith('--')) { args[name] = true; } else { args[name] = next; i++; }
  }
}

const CANVAS = parseInt(args.canvas, 10) || 1254;

async function main() {
  let img = sharp(args.src).ensureAlpha();
  let { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  // if the item has no real transparency (JPG / white product shot), flood-fill the white away
  let hasRealAlpha = false;
  for (let p = 3; p < data.length; p += 4) if (data[p] < 250) { hasRealAlpha = true; break; }
  if (!hasRealAlpha || args.white) {
    const isBg = (i) => {
      const mn = Math.min(data[i], data[i + 1], data[i + 2]);
      const mx = Math.max(data[i], data[i + 1], data[i + 2]);
      return mn >= 225 && mx - mn <= 14;
    };
    const mask = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const p = stack.pop();
      if (mask[p] || !isBg(p * 4)) continue;
      mask[p] = 1;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    // erode 1px ring + zero out
    const ring = [];
    for (let p = 0; p < W * H; p++) {
      if (mask[p]) continue;
      const x = p % W, y = (p / W) | 0;
      if ((x > 0 && mask[p - 1]) || (x < W - 1 && mask[p + 1]) || (y > 0 && mask[p - W]) || (y < H - 1 && mask[p + W])) ring.push(p);
    }
    for (const p of ring) mask[p] = 1;
    for (let p = 0; p < W * H; p++) if (mask[p]) data[p * 4 + 3] = 0;
  }

  // trim to content bbox
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
  if (maxX <= minX) throw new Error('no visible content found in ' + args.src);

  let item = sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
  if (args.fliph) item = item.flop();
  if (args.flipv) item = item.flip();
  if (args.rotate) item = sharp(await item.png().toBuffer()).rotate(parseFloat(args.rotate), { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const width = parseInt(args.width, 10);
  const buf = await sharp(await item.png().toBuffer()).resize({ width }).png().toBuffer();
  const m = await sharp(buf).metadata();

  // oversized canvas + extract so negative left/top (item poking off-canvas) works
  const PAD = 600;
  const big = await sharp({ create: { width: CANVAS + PAD * 2, height: CANVAS + PAD * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: buf, left: PAD + parseInt(args.left, 10), top: PAD + parseInt(args.top, 10) }])
    .png()
    .toBuffer();
  await sharp(big).extract({ left: PAD, top: PAD, width: CANVAS, height: CANVAS }).png().toFile(args.dest);
  console.log('placed ' + args.src + ' -> ' + args.dest + ' at (' + args.left + ',' + args.top + ') ' + m.width + 'x' + m.height);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });

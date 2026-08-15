// Shared renderer: draws a placed accessory (one or more parts of the same source item)
// onto the 1254x1254 layer canvas. Used by the server's /api/place and by scripts.
const sharp = require('sharp');

const CANVAS = 1254;
const PAD = 600; // lets parts hang off-canvas (e.g. hat poking above the top edge)

async function renderPlacement(srcPath, parts, destPath) {
  const overlays = [];
  for (const p of parts) {
    let item = sharp(srcPath);
    if (p.fliph) item = item.flop();
    if (p.flipv) item = item.flip();
    const resized = await item
      .resize(p.height
        ? { width: Math.max(2, Math.round(p.width)), height: Math.max(2, Math.round(p.height)), fit: 'fill' }
        : { width: Math.max(2, Math.round(p.width)) })
      .png()
      .toBuffer();
    overlays.push({ input: resized, left: PAD + Math.round(p.left), top: PAD + Math.round(p.top) });
  }
  const big = await sharp({
    create: { width: CANVAS + PAD * 2, height: CANVAS + PAD * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(overlays)
    .png()
    .toBuffer();
  await sharp(big).extract({ left: PAD, top: PAD, width: CANVAS, height: CANVAS }).png().toFile(destPath);
}

module.exports = { renderPlacement, CANVAS };

// One-shot import of the Aug 15 batch: 16 bodies + 7 backgrounds.
// Opaque 1254 masters go through white removal; transparent 1000s get upscaled to 1254.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { removeWhite } = require('./remove-white');

const DL = 'C:/Users/rigby/Downloads/';
const ROOT = path.join(__dirname, '..');

const BODIES = [
  ['purple bull.png', 'bull/purple skin.png'],
  ['purple cow.png', 'cow/purple skin.png'],
  ['light gray bull.png', 'bull/gray skin.png'],
  ['light gray cow.png', 'cow/gray skin.png'],
  ['pink bull.png', 'bull/pink skin.png'],
  ['hot pink cow.png', 'cow/pink skin.png'],
  ['cyan bull.png', 'bull/cyan skin.png'],
  ['cyan cow.png', 'cow/cyan skin.png'],
  ['brown bull.png', 'bull/brown skin.png'],
  ['brown cow.png', 'cow/brown skin.png'],
  ['lime bull.png', 'bull/lime skin.png'],
  ['lime cow.png', 'cow/lime skin.png'],
  ['teal bull.png', 'bull/teal skin.png'],
  ['teal cow.png', 'cow/teal skin.png'],
  ['navy bull.png', 'bull/navy skin.png'],
  ['navy cow.png', 'cow/navy skin.png'],
];

const BACKGROUNDS = [
  ['chinese coyunmtry side.png', 'chinese countryside.png'],
  ['gas station background.png', 'gas station.png'],
  ['strip mall.png', 'strip mall.png'],
  ['beach bg.png', 'beach.png'],
  ['back alley.png', 'back alley.png'],
  ['suburban.png', 'suburban.png'],
  ['247 store bg.png', '247 store.png'],
];

async function importBody(srcName, rel) {
  const src = DL + srcName;
  const dest = path.join(ROOT, 'layers', '02-body', rel);
  const m = await sharp(src).metadata();
  if (!m.hasAlpha) {
    // white-bg master at 1254 → flood-fill removal
    await removeWhite(src, dest);
  } else {
    // already transparent → just normalize to the 1254 canvas
    await sharp(src).resize(1254, 1254).png().toFile(dest);
    console.log('wrote ' + dest + ' (transparent source, upscaled ' + m.width + '→1254)');
  }
}

async function main() {
  for (const [srcName, rel] of BODIES) await importBody(srcName, rel);
  for (const [srcName, destName] of BACKGROUNDS) {
    const dest = path.join(ROOT, 'layers', '01-background', destName);
    await sharp(DL + srcName).resize(1254, 1254).png().toFile(dest);
    console.log('wrote ' + dest);
  }
  console.log('batch import done');
}

main().catch((e) => { console.error(e); process.exit(1); });

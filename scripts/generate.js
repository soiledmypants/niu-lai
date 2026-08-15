// Headless collection generator — no studio needed.
//
//   npm run generate                       → 4,444 NFTs into output/
//   npm run generate -- --count 100        → smaller test batch
//   npm run generate -- --base ipfs://CID  → set the image base URI at generation time
//   npm run generate -- --rebase ipfs://CID
//       → AFTER images are uploaded to IPFS: rewrites the image field in the existing
//         output/metadata/*.json to the real CID WITHOUT regenerating (keeps the same tokens!)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const srv = require('../server.js');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith('--')) {
    const next = process.argv[i + 1];
    if (!next || next.startsWith('--')) args[k.slice(2)] = true;
    else { args[k.slice(2)] = next; i++; }
  }
}

async function main() {
  if (args.rebase) {
    const base = String(args.rebase).replace(/\/+$/, '');
    const metaDir = path.join(srv.OUT_DIR, 'metadata');
    if (!fs.existsSync(metaDir)) throw new Error('no output/metadata yet — generate first');
    const files = fs.readdirSync(metaDir).filter((f) => /^\d+\.json$/.test(f));
    const all = [];
    for (const f of files) {
      const m = JSON.parse(fs.readFileSync(path.join(metaDir, f), 'utf8'));
      m.image = base + '/' + m.edition + '.png';
      fs.writeFileSync(path.join(metaDir, f), JSON.stringify(m, null, 2));
      all[m.edition - 1] = m;
    }
    fs.writeFileSync(path.join(srv.OUT_DIR, '_metadata.json'), JSON.stringify(all, null, 2));
    console.log('rebased ' + files.length + ' metadata files to ' + base + ' — images untouched');
    return;
  }

  const count = parseInt(args.count, 10) || 4444;
  const name = args.name || 'Niu Lai';
  const description = args.desc || '';
  const baseUri = (args.base || 'ipfs://REPLACE_WITH_CID').replace(/\/+$/, '');

  const layers = srv.readLayers().filter((l) => l.traits.length > 0);
  if (!layers.length) throw new Error('no layers found');
  const total = srv.countValidCombos(layers);
  if (total < count) throw new Error('only ' + total + ' unique combos possible, need ' + count);

  const first = layers[0].traits[0];
  const meta = await sharp(path.join(srv.LAYERS_DIR, layers[0].dir, first.rel)).metadata();
  const width = parseInt(args.width, 10) || meta.width;
  const height = parseInt(args.height, 10) || meta.height;

  console.log('generating ' + count + ' of ' + total + ' possible combos at ' + width + 'x' + height + ' ...');
  const combos = srv.pickCombos(layers, count);

  const tick = setInterval(() => {
    const j = srv.getJob();
    if (j.total) process.stdout.write('\r' + j.done + ' / ' + j.total + '   ');
  }, 1000);
  await srv.runJob(layers, combos, { name, description, baseUri, width, height });
  clearInterval(tick);

  const j = srv.getJob();
  if (j.error) throw new Error(j.error);
  console.log('\ndone in ' + Math.round(j.ms / 1000) + 's -> ' + srv.OUT_DIR);
  console.log('next: upload output/images/ to IPFS, then: npm run generate -- --rebase ipfs://<CID>');
}

main().catch((e) => { console.error('ERROR: ' + (e.message || e)); process.exit(1); });

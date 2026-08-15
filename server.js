// bnb-nft trait studio — serves the layer-matching UI and generates the final collection
const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PORT = 5311;
const ROOT = __dirname;
const LAYERS_DIR = path.join(ROOT, 'layers');
const OUT_DIR = path.join(ROOT, 'output');

const IMG_RE = /\.(png|webp|gif|jpg|jpeg)$/i;

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/layers', express.static(LAYERS_DIR));

// ---- layer scanning -------------------------------------------------------

function readLayers() {
  if (!fs.existsSync(LAYERS_DIR)) return [];
  const dirs = fs
    .readdirSync(LAYERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return dirs.map((dir) => {
    const files = fs
      .readdirSync(path.join(LAYERS_DIR, dir))
      .filter((f) => IMG_RE.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const traits = files.map((file) => {
      const base = file.replace(IMG_RE, '');
      const m = base.match(/^(.*?)#(\d+)$/); // hashlips-style "name#weight.png"
      const name = (m ? m[1] : base).replace(/[_]+/g, ' ').trim();
      const weight = m ? Math.max(1, parseInt(m[2], 10)) : 1;
      return {
        file,
        name,
        weight,
        url: '/layers/' + encodeURIComponent(dir) + '/' + encodeURIComponent(file),
      };
    });
    const label = dir.replace(/^\d+[-_. ]*/, '').replace(/[-_]+/g, ' ').trim() || dir;
    return { dir, label, traits };
  });
}

app.get('/api/layers', (_req, res) => {
  res.json({ layers: readLayers() });
});

// ---- combo picking --------------------------------------------------------

function weightedPick(traits) {
  const total = traits.reduce((a, t) => a + t.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < traits.length; i++) {
    r -= traits[i].weight;
    if (r <= 0) return i;
  }
  return traits.length - 1;
}

function pickCombos(layers, count) {
  const sizes = layers.map((l) => l.traits.length);
  const total = sizes.reduce((a, b) => a * b, 1);

  if (total <= 300000) {
    // enumerate every combo, then weighted shuffle (Efraimidis–Spirakis) and take the top `count`
    const keyed = [];
    for (let n = 0; n < total; n++) {
      let x = n;
      const idx = [];
      let w = 1;
      for (let li = 0; li < sizes.length; li++) {
        const t = x % sizes[li];
        x = Math.floor(x / sizes[li]);
        idx.push(t);
        w *= layers[li].traits[t].weight;
      }
      keyed.push({ idx, key: Math.pow(Math.random(), 1 / w) });
    }
    keyed.sort((a, b) => b.key - a.key);
    return keyed.slice(0, count).map((k) => k.idx);
  }

  // huge trait space: rejection sampling
  const seen = new Set();
  const out = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 500) {
    attempts++;
    const idx = layers.map((l) => weightedPick(l.traits));
    const dna = idx.join('-');
    if (seen.has(dna)) continue;
    seen.add(dna);
    out.push(idx);
  }
  if (out.length < count) throw new Error('could not find enough unique combos — add traits or lower the count');
  return out;
}

// ---- generation job -------------------------------------------------------

let job = { running: false, done: 0, total: 0, error: null, outDir: OUT_DIR, ms: 0 };

app.get('/api/progress', (_req, res) => res.json(job));

app.post('/api/generate', async (req, res) => {
  if (job.running) return res.status(409).json({ error: 'a generation is already running' });

  const body = req.body || {};
  const count = Math.max(1, parseInt(body.count, 10) || 1111);
  const name = (body.name || 'BNB NFT').trim();
  const description = (body.description || '').trim();
  const baseUri = (body.baseUri || 'ipfs://REPLACE_WITH_CID').trim().replace(/\/+$/, '');
  let width = parseInt(body.width, 10) || 0;
  let height = parseInt(body.height, 10) || 0;

  const layers = readLayers().filter((l) => l.traits.length > 0);
  if (!layers.length) return res.status(400).json({ error: 'no layer folders with images found in /layers' });

  const total = layers.reduce((n, l) => n * l.traits.length, 1);
  if (total < count) {
    return res.status(400).json({ error: `only ${total} unique combos possible, need ${count} — add more traits` });
  }

  // default output size = dimensions of the first trait image
  if (!width || !height) {
    const first = layers[0].traits[0];
    const meta = await sharp(path.join(LAYERS_DIR, layers[0].dir, first.file)).metadata();
    width = width || meta.width;
    height = height || meta.height;
  }

  let combos;
  try {
    combos = pickCombos(layers, count);
  } catch (e) {
    return res.status(400).json({ error: String((e && e.message) || e) });
  }

  res.json({ ok: true, count, width, height });
  runJob(layers, combos, { name, description, baseUri, width, height }); // async, progress via /api/progress
});

async function runJob(layers, combos, opts) {
  const started = Date.now();
  job = { running: true, done: 0, total: combos.length, error: null, outDir: OUT_DIR, ms: 0 };
  try {
    const imgDir = path.join(OUT_DIR, 'images');
    const metaDir = path.join(OUT_DIR, 'metadata');
    fs.rmSync(imgDir, { recursive: true, force: true });
    fs.rmSync(metaDir, { recursive: true, force: true });
    fs.mkdirSync(imgDir, { recursive: true });
    fs.mkdirSync(metaDir, { recursive: true });

    // cache each trait resized to the output size (traits are reused across many tokens)
    const cache = new Map();
    async function traitBuf(li, ti) {
      const t = layers[li].traits[ti];
      const key = layers[li].dir + '/' + t.file;
      if (!cache.has(key)) {
        cache.set(
          key,
          await sharp(path.join(LAYERS_DIR, layers[li].dir, t.file))
            .resize(opts.width, opts.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer()
        );
      }
      return cache.get(key);
    }

    const all = [];
    for (let i = 0; i < combos.length; i++) {
      const id = i + 1;
      const inputs = [];
      for (let li = 0; li < layers.length; li++) inputs.push({ input: await traitBuf(li, combos[i][li]) });

      await sharp({
        create: { width: opts.width, height: opts.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite(inputs)
        .png()
        .toFile(path.join(imgDir, id + '.png'));

      const meta = {
        name: opts.name + ' #' + id,
        description: opts.description,
        image: opts.baseUri + '/' + id + '.png',
        edition: id,
        attributes: layers.map((l, li) => ({ trait_type: l.label, value: l.traits[combos[i][li]].name })),
      };
      fs.writeFileSync(path.join(metaDir, id + '.json'), JSON.stringify(meta, null, 2));
      all.push(meta);
      job.done = id;
    }

    fs.writeFileSync(path.join(OUT_DIR, '_metadata.json'), JSON.stringify(all, null, 2));

    // trait rarity summary
    const rarity = {};
    layers.forEach((l, li) => {
      rarity[l.label] = {};
      combos.forEach((c) => {
        const v = l.traits[c[li]].name;
        rarity[l.label][v] = (rarity[l.label][v] || 0) + 1;
      });
    });
    fs.writeFileSync(path.join(OUT_DIR, 'rarity.json'), JSON.stringify(rarity, null, 2));

    job.ms = Date.now() - started;
    job.running = false;
  } catch (e) {
    job.error = String((e && e.message) || e);
    job.running = false;
  }
}

app.listen(PORT, () => {
  console.log('trait studio running at http://localhost:' + PORT);
  console.log('layers dir: ' + LAYERS_DIR);
});

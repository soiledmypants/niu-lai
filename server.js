// bnb-nft trait studio — serves the layer-matching UI and generates the final collection
const express = require('express');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { renderPlacement } = require('./scripts/compose');

const PORT = 5311;
const ROOT = __dirname;
const LAYERS_DIR = path.join(ROOT, 'layers');
const OUT_DIR = path.join(ROOT, 'output');
const SOURCES_DIR = path.join(ROOT, 'sources');
const VARIANTS_DIR = path.join(ROOT, 'variants');
const PLACEMENTS_PATH = path.join(ROOT, 'placements.json');

const IMG_RE = /\.(png|webp|gif|jpg|jpeg)$/i;

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use('/layers', express.static(LAYERS_DIR));
app.use('/sources', express.static(SOURCES_DIR));
app.use('/variants', express.static(VARIANTS_DIR));

// ---- movable accessory placements ----------------------------------------

function readPlacements() {
  try { return JSON.parse(fs.readFileSync(PLACEMENTS_PATH, 'utf8')); } catch { return {}; }
}

app.get('/api/placements', (_req, res) => res.json(readPlacements()));

// per-skin variant file for a trait, e.g. variants/04-hat/bull/black cap@navy skin.png
function variantPath(key, skin) {
  return path.join(VARIANTS_DIR, key.replace(/\.png$/i, '') + '@' + skin + '.png');
}

// traits that share one position: adjusting either re-renders both (user tunes once)
const LINKED = [
  ['05-cig/bull/cig.png', '05-cig/bull/joint.png'],
  ['05-cig/cow/cig.png', '05-cig/cow/joint.png'],
];
function linkedPartner(key) {
  for (const [a, b] of LINKED) {
    if (key === a) return b;
    if (key === b) return a;
  }
  return null;
}

const SKIN_RE = /^[\w][\w \-]*$/;

app.post('/api/place', async (req, res) => {
  const { key, src, parts, skin, remove } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key is required' });
  const dest = path.join(LAYERS_DIR, key);
  if (!dest.startsWith(LAYERS_DIR)) return res.status(400).json({ error: 'bad path' });
  if (skin && !SKIN_RE.test(skin)) return res.status(400).json({ error: 'bad skin name' });

  const all = readPlacements();

  // remove a skin override → that skin falls back to the default position
  function removeOverride(k) {
    if (all[k] && all[k].overrides) {
      delete all[k].overrides[skin];
      if (!Object.keys(all[k].overrides).length) delete all[k].overrides;
    }
    try { fs.rmSync(variantPath(k, skin), { force: true }); } catch {}
  }
  if (skin && remove) {
    removeOverride(key);
    const partner = linkedPartner(key);
    if (partner) removeOverride(partner);
    fs.writeFileSync(PLACEMENTS_PATH, JSON.stringify(all, null, 2));
    return res.json({ ok: true });
  }

  if (!src || !Array.isArray(parts) || !parts.length) {
    return res.status(400).json({ error: 'src and parts are required' });
  }
  const srcPath = path.join(ROOT, src);
  if (!srcPath.startsWith(SOURCES_DIR)) return res.status(400).json({ error: 'bad source path' });
  if (!fs.existsSync(srcPath)) return res.status(400).json({ error: 'source not found: ' + src });

  // writes one trait's placement (its own source, the shared parts)
  async function apply(k, kSrc) {
    const kSrcPath = path.join(ROOT, kSrc);
    if (!kSrcPath.startsWith(SOURCES_DIR) || !fs.existsSync(kSrcPath)) return;
    if (skin) {
      const vp = variantPath(k, skin);
      fs.mkdirSync(path.dirname(vp), { recursive: true });
      await renderPlacement(kSrcPath, parts, vp);
      all[k] = all[k] || { src: kSrc, parts };
      all[k].overrides = all[k].overrides || {};
      all[k].overrides[skin] = parts;
    } else {
      const d = path.join(LAYERS_DIR, k);
      fs.mkdirSync(path.dirname(d), { recursive: true });
      await renderPlacement(kSrcPath, parts, d);
      all[k] = { src: kSrc, parts, ...(all[k] && all[k].overrides ? { overrides: all[k].overrides } : {}) };
    }
  }

  try {
    await apply(key, src);
    const partner = linkedPartner(key);
    if (partner && all[partner]) await apply(partner, all[partner].src);
    fs.writeFileSync(PLACEMENTS_PATH, JSON.stringify(all, null, 2));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

// ---- layer scanning -------------------------------------------------------

function parseTrait(dir, group, file) {
  const base = file.replace(IMG_RE, '');
  const m = base.match(/^(.*?)#(\d+)$/); // hashlips-style "name#weight.png"
  const name = (m ? m[1] : base).replace(/[_]+/g, ' ').trim();
  const weight = m ? Math.max(1, parseInt(m[2], 10)) : 1;
  const parts = [dir, group, file].filter(Boolean).map(encodeURIComponent);
  const rel = group ? group + '/' + file : file;
  return { file, rel, name, weight, group, url: '/layers/' + parts.join('/') };
}

function readLayers() {
  if (!fs.existsSync(LAYERS_DIR)) return [];
  const dirs = fs
    .readdirSync(LAYERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return dirs.map((dir) => {
    const byName = (a, b) => a.localeCompare(b, undefined, { numeric: true });
    const entries = fs.readdirSync(path.join(LAYERS_DIR, dir), { withFileTypes: true });
    // subfolders = mutually exclusive groups (e.g. 02-body/bull, 02-body/cow → each NFT gets ONE)
    const groups = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort(byName);
    const rootFiles = entries.filter((e) => e.isFile() && IMG_RE.test(e.name)).map((e) => e.name).sort(byName);

    const traits = rootFiles.map((f) => parseTrait(dir, null, f));
    for (const g of groups) {
      const files = fs.readdirSync(path.join(LAYERS_DIR, dir, g)).filter((f) => IMG_RE.test(f)).sort(byName);
      for (const f of files) traits.push(parseTrait(dir, g, f));
    }
    const label = dir.replace(/^\d+[-_. ]*/, '').replace(/[-_]+/g, ' ').trim() || dir;
    return { dir, label, groups, traits };
  });
}

// exact count of valid combos: grouped layers must all agree on the group
// (ungrouped traits inside a grouped layer count as compatible with every group)
function countValidCombos(layers) {
  const withTraits = layers.filter((l) => l.traits.length > 0);
  if (!withTraits.length) return 0;
  const grouped = withTraits.filter((l) => l.traits.some((t) => t.group));
  const ungroupedProduct = withTraits
    .filter((l) => !l.traits.some((t) => t.group))
    .reduce((n, l) => n * l.traits.length, 1);
  if (!grouped.length) return ungroupedProduct;

  const G = [...new Set(grouped.flatMap((l) => l.traits.filter((t) => t.group).map((t) => t.group)))];
  let sum = 0;
  for (const g of G) {
    sum += grouped.reduce((n, l) => n * l.traits.filter((t) => t.group === g || !t.group).length, 1);
  }
  // combos where every grouped layer picked an ungrouped trait got counted once per group
  const allUniversal = grouped.reduce((n, l) => n * l.traits.filter((t) => !t.group).length, 1);
  return ungroupedProduct * (sum - (G.length - 1) * allUniversal);
}

function comboIsValid(layers, idx) {
  let g = null;
  for (let li = 0; li < layers.length; li++) {
    const tg = layers[li].traits[idx[li]].group;
    if (!tg) continue;
    if (g && tg !== g) return false;
    g = tg;
  }
  return true;
}

app.get('/api/layers', (_req, res) => {
  const layers = readLayers();
  res.json({ layers, validCombos: countValidCombos(layers) });
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
    // enumerate every combo, drop group-mismatched ones, then weighted shuffle
    // (Efraimidis–Spirakis) and take the top `count`
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
      if (!comboIsValid(layers, idx)) continue;
      keyed.push({ idx, key: Math.pow(Math.random(), 1 / w) });
    }
    keyed.sort((a, b) => b.key - a.key);
    return keyed.slice(0, count).map((k) => k.idx);
  }

  // huge trait space: rejection sampling constrained to one group per combo
  const G = [...new Set(layers.flatMap((l) => l.traits.filter((t) => t.group).map((t) => t.group)))];
  const seen = new Set();
  const out = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 500) {
    attempts++;
    const g = G.length ? G[Math.floor(Math.random() * G.length)] : null;
    let idx = [];
    let ok = true;
    for (const l of layers) {
      const pool = l.traits.some((t) => t.group)
        ? l.traits.map((t, ti) => ({ t, ti })).filter((x) => !x.t.group || x.t.group === g)
        : l.traits.map((t, ti) => ({ t, ti }));
      if (!pool.length) { ok = false; break; }
      idx.push(pool[weightedPick(pool.map((x) => x.t))].ti);
    }
    if (!ok) continue;
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

  const total = countValidCombos(layers);
  if (total < count) {
    return res.status(400).json({ error: `only ${total} unique combos possible, need ${count} — add more traits` });
  }

  // default output size = dimensions of the first trait image
  if (!width || !height) {
    const first = layers[0].traits[0];
    const meta = await sharp(path.join(LAYERS_DIR, layers[0].dir, first.rel)).metadata();
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
    const placementsAll = readPlacements();
    const bodyLi = layers.findIndex((l) => l.dir === '02-body');
    async function traitBuf(li, ti, bodySkin) {
      const t = layers[li].traits[ti];
      const key = layers[li].dir + '/' + t.rel;
      // per-skin position override? use the variant rendered for that body skin
      let file = path.join(LAYERS_DIR, layers[li].dir, t.rel);
      const pl = placementsAll[key];
      if (bodySkin && pl && pl.overrides && pl.overrides[bodySkin]) {
        const vp = variantPath(key, bodySkin);
        if (fs.existsSync(vp)) file = vp;
      }
      if (!cache.has(file)) {
        cache.set(
          file,
          await sharp(file)
            .resize(opts.width, opts.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer()
        );
      }
      return cache.get(file);
    }

    const all = [];
    for (let i = 0; i < combos.length; i++) {
      const id = i + 1;
      const bodySkin = bodyLi >= 0 ? layers[bodyLi].traits[combos[i][bodyLi]].name : null;
      const inputs = [];
      for (let li = 0; li < layers.length; li++) inputs.push({ input: await traitBuf(li, combos[i][li], bodySkin) });

      await sharp({
        create: { width: opts.width, height: opts.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite(inputs)
        .png()
        .toFile(path.join(imgDir, id + '.png'));

      const attributes = [];
      const species = layers.map((l, li) => l.traits[combos[i][li]].group).find(Boolean);
      if (species) attributes.push({ trait_type: 'species', value: species });
      layers.forEach((l, li) => attributes.push({ trait_type: l.label, value: l.traits[combos[i][li]].name }));
      const meta = {
        name: opts.name + ' #' + id,
        description: opts.description,
        image: opts.baseUri + '/' + id + '.png',
        edition: id,
        attributes,
      };
      fs.writeFileSync(path.join(metaDir, id + '.json'), JSON.stringify(meta, null, 2));
      all.push(meta);
      job.done = id;
    }

    fs.writeFileSync(path.join(OUT_DIR, '_metadata.json'), JSON.stringify(all, null, 2));

    // trait rarity summary
    const rarity = {};
    const speciesCounts = {};
    combos.forEach((c) => {
      const g = layers.map((l, li) => l.traits[c[li]].group).find(Boolean);
      if (g) speciesCounts[g] = (speciesCounts[g] || 0) + 1;
    });
    if (Object.keys(speciesCounts).length) rarity.species = speciesCounts;
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

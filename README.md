# BNB NFT — Trait Studio

Layer-matching studio + collection generator for a **1,111**-piece NFT collection on BNB Chain.
You make the art here, generate the 1,111 finals, and send the `output/` folder to your friend for minting.

## Run it

```
npm install
npm run samples   # optional: placeholder art so you can play with the studio
npm start         # http://localhost:5311
```

## The math for 1,111 NFTs

Unique combos = product of trait counts per layer. You need ≥ 1,111.

| backgrounds | bodies | colors | combos |
|---|---|---|---|
| **10** | **12** | **10** | **1,200** ← recommended (89 spare) |
| 11 | 11 | 10 | 1,210 |
| 10 | 10 | 11 | 1,100 — NOT enough |

32 images is the minimum total. The studio header shows live combo math as you drop files in.

## How layers work

```
layers/
  01-background/     bottom layer (the shitty 3D render scenes)
  02-body/
    bull/            bull bodies — each NFT is EITHER a bull or a cow, never both
    cow/             cow bodies
```

- Folder number prefix = stacking order. `01` is drawn first (bottom).
- **Subfolders inside a layer = exclusive species groups.** Each NFT picks ONE group; if a
  later layer (faces, hats) also has `bull/` + `cow/` subfolders, the generator only combines
  same-species traits, and metadata gets a `species` attribute. Files directly in the layer
  folder (no subfolder) work with both species.
- Add more layers any time by adding folders (`03-face/`, `04-hat/`, etc.).
- **Every PNG must be the same canvas size (1254×1254) with the character in the same position** — layers are stacked 1:1.
- Rarity weights: name a file `lime#40.png` → weight 40. No `#` = weight 1. Higher = more common.
- New art arrives on a white background? Strip it with
  `node scripts/remove-white.js "<src.png>" "layers/02-body/bull/name.png"`
  (flood-fills from the edges, so white INSIDE the character survives).

## Generate

Set supply (1,111), name, description, and Base URI in the UI, hit GENERATE. Output:

```
output/
  images/1.png … 1111.png
  metadata/1.json … 1111.json   (ERC-721 metadata, BNB Chain ready)
  _metadata.json                (all metadata in one file)
  rarity.json                   (how many of each trait were used)
```

Your friend uploads `images/` to IPFS, puts the real CID in the metadata Base URI, and points the contract's `baseTokenURI` at the metadata folder. Every combo is guaranteed unique.

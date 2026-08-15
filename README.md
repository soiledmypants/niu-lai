# NIU LAI — 4,444 bulls & cows on BNB Chain

Complete trait system + generator for the NIU LAI NFT collection.
**Everything needed to produce the final collection is in this repo** — all art, all trait
positions (per species AND per skin), the generator, and the preview studio.

## For the mint dev — quickest path

```
npm install
npm run generate
```

That's it. A few minutes later `output/` contains the whole collection:

```
output/
  images/1.png … 4444.png       final art, 1254×1254, every token a unique trait combo
  metadata/1.json … 4444.json   ERC-721 metadata (one per token)
  _metadata.json                everything in one file
  rarity.json                   how many of each trait was actually minted
```

Then:

1. Upload `output/images/` to IPFS → you get a `<CID>`
2. `npm run generate -- --rebase ipfs://<CID>` — rewrites the `image` field in all existing
   metadata to the real CID **without regenerating** (token set stays identical — never
   run plain `generate` again after uploading, it would reshuffle the collection)
3. Upload `output/metadata/` to IPFS, point the contract's `baseTokenURI` at it

Options: `--count 100` (test batch), `--name`, `--desc`, `--base ipfs://CID` (if you already
know the CID up front), `--width/--height` (default = native 1254).

Metadata shape per token:

```json
{
  "name": "Niu Lai #1",
  "image": "ipfs://<CID>/1.png",
  "edition": 1,
  "attributes": [
    { "trait_type": "species", "value": "bull" },
    { "trait_type": "background", "value": "beach" },
    { "trait_type": "body", "value": "purple skin" },
    { "trait_type": "earring", "value": "bnb" },
    { "trait_type": "hat", "value": "black cap" },
    { "trait_type": "cig", "value": "joint" }
  ]
}
```

## The math

`17 backgrounds × (13 bull + 13 cow skins) × 2 earring × 2 hat × 3 smoke (none/cig/joint)
= 5,304 unique combos` → 4,444 minted, 860 never exist. Every token is unique; a token is
EITHER a bull or a cow, never both, and accessories always use the position tuned for that
species (and, where set, for that exact skin).

## How the trait system works

- `layers/NN-name/` = one trait layer, drawn bottom (01) to top (05 — the cig/joint is
  always the top layer). Subfolders `bull/` + `cow/` = species-exclusive versions of a trait.
- `placements.json` + `variants/` = saved accessory positions. Defaults per species; per-skin
  overrides render as `variants/<layer>/<species>/<trait>@<skin>.png` and the generator
  automatically uses them for matching bodies.
- Rarity weights: rename any trait file `name#40.png` → weight 40 (no `#` = 1, higher =
  more common). Works on every layer including `none.png`.
- Preview/tuning studio (optional): `npm start` → http://localhost:5311 — click traits
  together, scroll-wheel through layers, move/resize accessories with live sliders.

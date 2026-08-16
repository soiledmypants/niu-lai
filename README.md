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

Metadata shape per token (flap.sh-style attributes):

```json
{
  "name": "Niu Lai #1",
  "image": "ipfs://<CID>/1.png",
  "edition": 1,
  "attributes": [
    { "trait_type": "Species", "value": "Bull" },
    { "trait_type": "Background", "value": "Beach" },
    { "trait_type": "Body", "value": "Purple Skin" },
    { "trait_type": "Earring", "value": "BNB" },
    { "trait_type": "Hat", "value": "Black Cap" },
    { "trait_type": "Cig", "value": "Joint" }
  ]
}
```

## Launching on flap.sh (bBroker Vault)

The vault's `artSource` supports **external JSON metadata in directory mode**: a URL ending
in `/`, from which it fetches `<base>/1.json`, `<base>/2.json`, … — exactly how `output/metadata/`
is named.

1. `npm run generate`
2. Host `output/images/` somewhere HTTPS-reachable (IPFS + a public gateway works:
   `https://ipfs.io/ipfs/<imagesCID>/`)
3. `npm run generate -- --rebase https://ipfs.io/ipfs/<imagesCID>` so every metadata `image`
   points at a URL the vault's renderers can actually fetch (plain `ipfs://` URIs don't load
   in most browsers)
4. Host `output/metadata/` the same way → `https://ipfs.io/ipfs/<metadataCID>/`
5. When creating the vault, set `artSource = https://ipfs.io/ipfs/<metadataCID>/`
   (**must end with `/`** — that's what switches it to directory mode)
6. `maxNFTSupply = 4444`; remember flap's limit `maxNFTSupply × tokenCostPerNFT ≤ 1,000,000,000`
   → burn cost per NFT can be at most ~225,000 tokens at this supply

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

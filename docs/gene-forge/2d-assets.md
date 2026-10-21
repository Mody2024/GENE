# GENE Forge: Native 2D Assets

## API

`POST /api/forge/2d` accepts JSON:

```json
{
  "prompt": "A cheerful skeleton player for a cartoon city game",
  "kind": "character",
  "quality": "standard",
  "style": "cartoon low-poly"
}
```

Supported kinds: `character`, `tileset`, `ui`, `background`, and `icon`.
Quality values are `performance`, `standard`, and `high`. They are metadata today; the current generator does not claim different raster resolutions or artistic fidelity by quality tier.

## Response and files

Successful responses contain:
- `asset.svg`: self-contained SVG artwork.
- `asset.manifest`: dimensions, frame dimensions, frame count/names, palette, prompt, and provenance.
- `asset.qualityReport`: deterministic size and structural metadata.
- `files.sprite.svg` and `files.asset.json`: ready-to-save file contents.

Character sheets are four 128×128 vector poses in a horizontal strip. The frame labels suggest idle/walk poses, but they are **not a skeletal rig and are not guaranteed to be a seamless animation**. Tilesets contain four 96×96 tile regions; UI, background, and icon assets are static vector artwork.

## Provenance and limitations

This feature is the **GENE native procedural 2D generator**, not an external image-generation model. It uses prompt keywords and a small curated palette to build safe vector shapes. It does not download artwork, use external references, or produce detailed painterly images. Use licensed external artwork or a configured image model when the game needs higher-fidelity illustrations.

The SVG is intended for safe integration into projects that support SVG. For engines requiring raster images, convert it using an approved local image-conversion worker and verify the resulting dimensions/alpha channel before importing. Never claim that the file has been imported into a game unless the workspace integration actually writes it and a build/test confirms it.

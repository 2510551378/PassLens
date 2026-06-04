# Pass Lens Brand Notes

Pass Lens should feel like a practical open-source compiler tool: clear,
compact, technical, and trustworthy. It should not look like a generic AI app,
cosmic horror illustration, cyberpunk dashboard, or literal eye symbol.

## Reference Principles

- Prefer a simple mark that remains readable at small sizes.
- Keep SVG as the source asset and export PNG for README / marketplace usage.
- Preserve clear space around the mark.
- Keep color usage stable: deep ink, cyan, blue, and a small amber signal accent.
- Treat backend-specific samples as examples, not part of the core identity.

References consulted:

- CNCF Brand Guidelines: clear space, stable color usage, and do-not-stretch /
  do-not-change-elements rules.
- Git logo downloads: separate full-color, one-color, light-background,
  dark-background, bitmap, and vector assets.

## Current Visual Concept

The logo combines:

- a magnifying lens for inspection;
- a horizontal compiler pass rail;
- pass nodes on the rail;
- one amber node for first-signal / first-bad-pass localization.

The logo intentionally avoids:

- literal eyes;
- tentacles, monsters, horror, or occult shapes;
- glowing AI brain / neural-network cliches;
- 3D rendering, heavy gradients, and tiny details;
- backend-specific symbols such as Triton, NPU, or AscendC.

## Generation Prompt

Use this prompt for raster exploration only. The final project asset should be
hand-cleaned or recreated as SVG before shipping.

```text
Create a clean, professional open-source software project logo mark for a
compiler debugging tool named Pass Lens. Logo mark only, no text, no letters,
no wordmark.

Style: flat vector design, simple geometric construction, high legibility at
32px, suitable for GitHub README, VS Code extension icon, and SVG conversion.

Concept: compiler pass pipeline observability. Visual metaphor: a compact
magnifying lens combined with a left-to-right pass pipeline trace. Use a circular
lens ring made from two simple strokes, with three or four small connected nodes
passing through the center to suggest compiler passes, and one subtle amber
highlighted node to imply first bad pass localization.

Color palette:
- deep neutral ink #0f172a
- clear cyan #22d3ee
- calm blue #2563eb
- small amber accent #f59e0b
- white or transparent background

Geometry: balanced, simple silhouette, rounded stroke ends, generous whitespace,
minimal detail, no shadows except very subtle export-only depth if needed.

Avoid: literal human eye, monster, tentacles, cosmic horror, occult symbol,
glowing AI brain, neural network cliche, robot face, cyberpunk, excessive
gradients, photorealism, 3D, heavy shadow, tiny text, watermark, backend-specific
hardware imagery.

The result should look like a modern open-source infrastructure/devtool logo:
trustworthy, minimal, friendly, and technically precise.
```

## Asset Files

- `docs/images/pass-lens-logo.svg`: source logo mark.
- `docs/images/pass-lens-logo.png`: README PNG export.
- `media/pass-lens-icon.png`: VS Code extension icon export.
- `docs/images/pass-lens-hero.svg`: README hero source.
- `docs/images/pass-lens-hero.png`: README hero PNG export.

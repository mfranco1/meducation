---
name: meducation-icons
description: Discover, adapt, validate and preview Meducation subject and topic SVG icons. Use for medical catalog artwork and its provenance, not general UI icons or raster illustrations.
---

# Meducation icons

Read [the icon design specification](../../../docs/design-system.md#meducation-icon-design-specification) before selecting or adapting artwork. Follow repository AGENTS.md. Accepting a displayed replacement authorizes its production assignment as part of the same change, unless the user explicitly asks for artwork approval only.

## Discover and propose

Run from the repository root:

```sh
npm run icons -- search "cardiology"
npm run icons -- propose "renal physiology" --json
npm run icons -- preview
```

Search includes existing production glyphs, registered candidates and their source shortlists. Download Iconify collection JSON files into ignored `.cache/icons/catalogs` for broader offline search. Use a pinned commit, not a floating branch, when recording provenance:

```sh
mkdir -p .cache/icons/catalogs
curl -fLsS https://raw.githubusercontent.com/iconify/icon-sets/bffe38b2e6b13b47191823d350fd84d18c581bc7/json/healthicons.json -o .cache/icons/catalogs/healthicons.json
```

The same path supports `medical-icon`, `medical`, `lucide`, `tabler`, `ph`, and `material-symbols` collections when available at the selected revision. Use `--catalogs directory` for another catalog directory. For Bioicons, use a local checkout:

```sh
git clone --depth 1 https://github.com/duerrsimon/bioicons.git .cache/icons/bioicons
npm run icons -- search "bacteriophage" --bioicons .cache/icons/bioicons
```

Reuse Meducation first, then Health Icons, Bioicons and medical collections, then general libraries. Adapt licensed assets before drawing original vectors. Search ranking uses source priority and lexical synonyms; it does **not** certify medical accuracy or aesthetic quality. `--json` returns structured output after npm's own command banner; invoke the package script with `npm run --silent icons -- ... --json` when piping JSON.

Assess each shortlist for anatomical accuracy, semantic relevance, readability at 20–24px, optical weight, family consistency and licensing. Record reasons in `notes` and alternative `assessment` fields. Do not choose a decorative heart for cardiac anatomy. Do not substitute an organ silhouette when the intended concept requires a specific structure, such as a nephron.

## Create and register a candidate

Prepare a reduced SVG in the allowed static subset. Preserve landmarks and meaningful negative space. Use existing vector contours where possible; create geometry intentionally rather than asking the CLI to invent anatomy. Import normalizes the viewBox without stretching, converts paint to `currentColor`, preserves deliberate opacity, and optimizes with SVGO. It does not choose tint regions, simplify anatomy or make optical corrections automatically.

```sh
npm run icons -- create "Renal physiology" --from /tmp/kidney.svg --metadata /tmp/kidney-metadata.json --id renal-physiology-v2
```

`--from` also accepts an ID returned by search. A `bioicons:` ID additionally requires `--bioicons checkout`. Metadata is JSON with `keywords`, `notes`, `source`, and optional `alternatives`, following the `IconRecord` type in `scripts/branding/iconStudio.ts`. Candidates and their metadata live only in ignored `.cache/icons/workspace`; the workspace is created on demand. Paths in metadata are relative to that workspace. A metadata template (replace all illustrative provenance before importing):

```json
{
  "keywords": ["kidney", "renal"],
  "notes": "Describe the selected artwork and intentional changes.",
  "source": {
    "collection": "Source collection",
    "asset": "Exact source asset name",
    "url": "https://example.com/source",
    "revision": "Exact source revision",
    "author": "Original author",
    "license": "CC0-1.0",
    "licenseUrl": "https://example.com/license",
    "attribution": ""
  },
  "alternatives": []
}
```

The source needs collection, exact asset, pinned source URL/revision, author, SPDX license, license evidence URL and attribution (an empty attribution is allowed only for CC0). Original artwork needs an explicit author and license declaration. Keep downloaded license evidence and optional source comparisons in the temporary workspace only while needed for review. Source snapshots omit editor metadata and artboard clips but retain original artwork colors.

Verify each source against its actual revision. Iconify is a distributor, not a blanket license. Health Icons' current artwork license is CC0; older notices and distributor metadata may say MIT. Keep existing notices. Bioicons licenses vary per asset; its website license does not license its artwork. Unknown or unsupported licenses block import. The validator checks metadata completeness and supported licenses, not the truth of an author's license claim.

The static subset excludes CSS, scripts, event handlers, external resources, embedded images, animation, clipping, masks and filters. Do not automatically sanitize arbitrary input and assume it is safe. Inspect rejected source files and deliberately reduce them to static vector geometry before retrying. Keep source credits in candidate metadata during review and include required attribution and license notices in the shipped app when integrating.

## Review and approve

```sh
npm run icons -- validate
npm run icons -- preview
```

Open the printed standalone HTML path in a browser. Compare light and dark panels, 20/24/46/64px samples, badge contexts, source comparisons and current Meducation artwork. Check focal clarity, anatomy, stroke weight, alignment, clipping and proportions. The gallery is ignored and is never shipped with the application.

Present candidates and obtain visual approval before integrating them. Accepting a displayed replacement authorizes integration immediately; do not ask for a second approval or stop after recording acceptance. Apply the reviewed artwork to its existing production glyph definition, preserve glyph keys and topic or subject IDs, reuse MUI `SvgIcon`, and keep icons decorative beside their labels. Add the selected source, pinned revision, attribution and required license notice to `public/icon-licenses.txt`, reusing an existing notice for the same source/license where applicable.

Integration includes cleanup. Delete integrated candidate SVGs and their registry entries, source comparisons, downloaded license copies, task-specific scripts and galleries. Remove the workspace directory when no undecided candidates remain, and stop task preview servers. Shared catalog caches may remain. Do not create an approved-artwork archive, approval hash record, duplicate production SVG or duplicate permanent license file. The app glyph definition and shipped notices are the maintained copies. If the user explicitly defers integration, leave the accepted proposal in the temporary workspace until it can be integrated. Do not overwrite another proposal under review; use a new candidate ID for a revision.

Run the focused tests and checks listed in [testing](../../../docs/testing.md#icon-studio). Report visual limitations honestly.

---
name: meducation-icons
description: Discover, adapt, validate and preview Meducation subject and topic SVG icons. Use for medical catalog artwork and its provenance, not general UI icons or raster illustrations.
---

# Meducation icons

Read [the icon design specification](../../../docs/design-system.md#meducation-icon-design-specification) before selecting or adapting artwork. Follow repository AGENTS.md. Production assignments require explicit user approval.

Codex can discover this repository skill. Claude Code and other agents can read this same SKILL.md by path; no duplicate installation or agent-specific wrappers are required.

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

`--from` also accepts an ID returned by search. A `bioicons:` ID additionally requires `--bioicons checkout`. Metadata is JSON with `keywords`, `notes`, `source`, and optional `alternatives`, following the `IconRecord` type in `scripts/branding/iconStudio.ts`. The registry may be empty. Paths in metadata are relative to `assets/icons`. A metadata template (replace all illustrative provenance before importing):

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
    "attribution": "",
    "licenseFile": "licenses/source.txt"
  },
  "alternatives": []
}
```

Before importing, store the license notice under `assets/icons/licenses`. The source needs collection, exact asset, source URL/revision, author, SPDX license, license evidence URL, local license file, and attribution (an empty attribution is allowed only for CC0). Original artwork also needs an explicit author and license declaration. Preserve source comparisons under `assets/icons/sources` when useful; keep their individual license metadata with them. Source snapshots omit editor metadata and artboard clips but retain original artwork colors.

Verify each source against its actual revision. Iconify is a distributor, not a blanket license. Health Icons' current artwork license is CC0; older notices and distributor metadata may say MIT. Keep existing notices. Bioicons licenses vary per asset; its website license does not license its artwork. Unknown or unsupported licenses block import. The validator checks metadata completeness and supported licenses, not the truth of an author's license claim.

The static subset excludes CSS, scripts, event handlers, external resources, embedded images, animation, clipping, masks and filters. Do not automatically sanitize arbitrary input and assume it is safe. Inspect rejected source files and deliberately reduce them to static vector geometry before retrying. Keep attribution in registry metadata and license notices even when editor metadata is removed.

## Review and approve

```sh
npm run icons -- validate
npm run icons -- preview
```

Open the printed standalone HTML path in a browser. Compare light and dark panels, 20/24/46/64px samples, badge contexts, source comparisons and current Meducation artwork. Check focal clarity, anatomy, stroke weight, alignment, clipping and proportions. The gallery is ignored and is never shipped with the application.

Present candidates to the user and require visual approval before marking them approved or assigning them in production. After explicit approval, set that registry record's `status` to `approved` and add `approval: { "reviewer": "<actual reviewer>", "sha256": "<reviewed file hash>" }`. Obtain the exact hash with `shasum -a 256 assets/icons/candidates/<id>.svg`, then validate again. Do not fabricate approval or infer it from successful checks.

Creation never overwrites an existing asset. Revisions get a new candidate ID and a fresh approval. A later, separately authorized production assignment should reuse MUI `SvgIcon`, keep icons decorative beside their text labels, and ship all required attribution and notices in `public/icon-licenses.txt`. Approval of artwork alone does not change production mappings.

Run the focused tests and checks listed in [testing](../../../docs/testing.md#icon-studio). Report visual limitations honestly.

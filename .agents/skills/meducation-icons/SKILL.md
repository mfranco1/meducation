---
name: meducation-icons
description: Find, draw, iterate on and integrate Meducation subject and topic SVG icons. Use for medical catalog artwork and its provenance, not general UI icons or raster illustrations.
---

# Meducation icons

## Rules

Two rules are fixed:

1. **License.** Use only free and open-source artwork with recorded provenance (below).
2. **Brand.** Meet the [brand rules](../../../docs/design-system.md#meducation-icon-design-specification).

Everything else is judgment. Aim for premium craft: a clear silhouette, deliberate negative space, and stroke weight that matches the existing family. Reuse, adapt, combine or draw original art, whichever looks best. Search ranking does not certify medical accuracy or quality.

## Find

Search several terms; there is no synonym table. Iconify aliases and categories are searchable.

```sh
npm run icons -- search "kidney" [--json] [--catalogs dir] [--bioicons checkout]
```

Download Iconify collections (`healthicons`, `medical-icon`, `medical`, `lucide`, `tabler`, `ph`, `material-symbols`) into ignored `.cache/icons/catalogs`. Pin a commit, not a branch:

```sh
mkdir -p .cache/icons/catalogs
curl -fLsS https://raw.githubusercontent.com/iconify/icon-sets/bffe38b2e6b13b47191823d350fd84d18c581bc7/json/healthicons.json -o .cache/icons/catalogs/healthicons.json
git clone --depth 1 https://github.com/duerrsimon/bioicons.git .cache/icons/bioicons
```

Allowed licenses: CC0-1.0, MIT, ISC, Apache-2.0, CC-BY-3.0, CC-BY-4.0, CC-BY-SA-3.0, CC-BY-SA-4.0. Anything but CC0 needs attribution. Iconify is a distributor, not a license. Health Icons is CC0 now, but older notices may say MIT. Bioicons licenses each asset separately. An unknown license blocks import. The validator checks completeness, not whether a claim is true.

## Draft and iterate

Write or adapt an SVG in the static subset: no CSS, scripts, external references, images, animation, clip, mask or filters. Inspect rejected files and reduce them by hand; do not auto-sanitize.

Write metadata JSON (`keywords`, `notes`, `source`; see `IconRecord` in `scripts/branding/iconStudio.ts`). Third-party source, pinned and with license evidence:

```json
{ "keywords": ["kidney"], "notes": "What changed.",
  "source": { "collection": "Health Icons", "asset": "kidneys", "url": "https://github.com/...", "revision": "<commit>",
    "author": "...", "license": "CC0-1.0", "licenseUrl": "https://...", "attribution": "" } }
```

Original art uses `"collection": "Meducation original"` and omits url, revision and licenseUrl.

```sh
npm run icons -- create "Renal physiology" --from <search-id-or-file.svg> --metadata meta.json --id renal-physiology-v2 [--fill]
npm run icons -- sheet
```

`create` fits art into the 20-unit live area of the 24 grid (`--fill` uses all 24 for deliberately oversized art), converts black and currentColor paint to currentColor, rejects white or colored paint (cut knockouts with evenodd or `fill="none"`), and corrects stroke widths, warning when a stroke renders outside 1.25 to 1.75. `--from` accepts a search ID; `bioicons:` IDs need `--bioicons`. Candidates live in ignored `.cache/icons/workspace`.

Read `.cache/icons/sheet.png`. It shows each candidate beside production icons at 24px and in the 64px badge. Critique it, revise, and re-create under a new id until it holds up at 24px beside the family.

## Present

Run `npm run icons -- preview` and open the standalone HTML (light and dark, 20/24/46/64px, badges, family strip, sources). Show the user 2 to 3 strong options. Accepting one authorizes integration in the same change.

## Integrate

1. `npm run icons -- jsx <id>` prints a JSX fragment for the `TopicIcon` `icons` map (also `SubjectIcon` art). Paste it into the existing glyph definition. Keep glyph keys and subject and topic IDs.
2. If the set or license is new, add the source and notice to `public/icon-licenses.txt`. Reuse existing notices.
3. Delete the integrated candidate from `.cache/icons/workspace`.
4. Run the checks in [testing](../../../docs/testing.md#icon-studio). Report visual limitations honestly.

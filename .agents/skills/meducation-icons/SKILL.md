---
name: meducation-icons
description: Find, draw, iterate on and integrate Meducation subject and topic SVG icons. Use for medical catalog artwork, not general UI icons or raster illustrations.
---

# Meducation icons

## Rules

1. **License.** Adapt only CC0-1.0, MIT, ISC or Apache-2.0 artwork, or draw original art. Iconify is a distributor, not a license: check the set's own license. An unknown license blocks use.
2. **Brand.** Meet the [brand rules](../../../docs/design-system.md#meducation-icon-design-specification).

Everything else is judgment. Aim for premium craft: a clear silhouette, deliberate negative space, and weight that matches the family. Reuse, adapt, combine or draw original art, whichever looks best. Search ranking does not certify medical accuracy or quality.

## Find

Download Iconify collections (`healthicons`, `medical-icon`, `medical`, `lucide`, `tabler`, `ph`, `material-symbols`) into the ignored `.cache/icons/catalogs`, then search several terms. Production glyphs are searchable too.

```sh
mkdir -p .cache/icons/catalogs
curl -fLsS https://raw.githubusercontent.com/iconify/icon-sets/master/json/healthicons.json -o .cache/icons/catalogs/healthicons.json
npm run icons -- search "kidney" [--json]
npm run icons -- get healthicons:kidneys [name]   # copies the raw SVG into .cache/icons/workspace
```

## Draft and iterate

Candidates are plain SVG files in `.cache/icons/workspace/<name>.svg`. Write, edit or combine them using the static subset: no CSS, scripts, references, images, animation, clips, masks or filters. Reduce rejected files by hand.

```sh
npm run icons -- sheet
```

`sheet` normalizes every candidate and renders `.cache/icons/sheet.png`: each one beside production icons at 24px and in the 64px badge, in light and dark. Normalizing keeps art drawn on a `0 0 24 24` viewBox as drawn and fits any other viewBox into the 20-unit live area. It converts black paint to currentColor, rejects white or colored paint (cut knockouts with evenodd or `fill="none"`) and warns when a stroke renders outside 1.25 to 1.75.

Read the sheet, critique it, and revise until the icon holds up at 24px beside the family.

## Present

Show the user the sheet with 2 to 3 strong options. Accepting one authorizes integration in the same change.

## Integrate

1. `npm run icons -- jsx <name>` prints a JSX fragment for the `TopicIcon` `icons` map (also `SubjectIcon` art). Paste it into the existing glyph definition. Keep glyph keys and subject and topic IDs.
2. For adapted art, add a one-line source comment above the glyph, such as `// Health Icons "kidneys", CC0`. If the set is new, add its name and license to the `TopicIcon.tsx` header comment and its notice to `public/icon-licenses.txt`.
3. Delete the integrated candidate from `.cache/icons/workspace`.
4. Run the checks in [testing](../../../docs/testing.md#icon-studio). Report visual limitations honestly.

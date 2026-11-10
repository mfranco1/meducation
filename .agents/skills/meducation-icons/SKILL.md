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

Download Iconify collections (`healthicons`, `medical-icon`, `lucide`, `tabler`, `ph`, `material-symbols`, `mdi`) into the ignored `.cache/icons/catalogs`, then search all your terms in one command (loading takes about 10 seconds). Results are grouped per query, or keyed by query with `--json`. Production glyphs are searchable too.

```sh
mkdir -p .cache/icons/catalogs
for set in healthicons medical-icon lucide tabler ph material-symbols mdi; do
  curl -fLsS https://raw.githubusercontent.com/iconify/icon-sets/master/json/$set.json -o .cache/icons/catalogs/$set.json
done
npm run icons -- search "kidney" "renal" "nephron" [--json]
npm run icons -- get healthicons:kidneys [name]   # copies the raw SVG into .cache/icons/workspace
```

## Draft and iterate

Candidates are plain SVG files in `.cache/icons/workspace/<name>.svg`. Name a replacement `<key>-a`, `<key>-b` and so on, where `<key>` is the production topic glyph. Write, edit or combine them using the static subset: no CSS, scripts, references, images, animation, clips, masks or filters. Reduce rejected files by hand.

```sh
npm run icons -- sheet
```

`sheet` normalizes every candidate and renders `.cache/icons/sheet.png`: each one as a 24px glyph and a 64px glyph in an 88px badge, in light and dark. A candidate named `<key>` or `<key>-<suffix>` shows the current production `<key>` glyph in a column labeled "current" right after it, then the family columns. Normalizing keeps art drawn on a `0 0 24 24` viewBox as drawn and fits any other viewBox into the 20-unit live area. It converts black paint to currentColor, rejects white or colored paint (cut knockouts with evenodd or `fill="none"`) and warns when a stroke renders outside 1.25 to 1.75.

Read the sheet, critique it, and revise until the icon holds up at 24px beside the family.

## Present

Show the user the sheet with 2 to 3 strong options. Accepting one authorizes integration in the same change.

## Integrate

1. `npm run icons -- integrate <key>=<candidate> [<key>=<candidate> ...] [--source "Health Icons \"kidneys\", CC0"]` normalizes each candidate, sets it as that key in the `TopicIcon` `icons` map (replacing the entry and its old source comment, or adding one in alphabetical order), formats the file and deletes the candidate from `.cache/icons/workspace`. `--source` (one pair only) writes a `// ` credit line above the entry. Keep glyph keys and subject and topic IDs. For `SubjectIcon` art, `npm run icons -- jsx <name>` prints a JSX fragment to paste into the existing glyph.
2. For adapted art, pass `--source`. If the set is new, add its name and license to the `TopicIcon.tsx` header comment and its notice to `public/icon-licenses.txt`.
3. Run the checks in [testing](../../../docs/testing.md#icon-studio). Report visual limitations honestly.

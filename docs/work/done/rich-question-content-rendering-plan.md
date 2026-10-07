# Rich question content rendering plan

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

## Goal and scope

Render basic embedded HTML and images in canonical question `stem` and `rationale` strings while preserving existing GFM behavior. Keep choices, choice explanations, and rationale sources on their current restricted Markdown policy. Keep the schema at version 4 and the current canonical bank unchanged; this feature does not require an S3 integration or a content migration.

## Current boundaries

- `src/app/components/content/MarkdownContent.tsx` renders all learner Markdown through `react-markdown` and `remark-gfm`, currently with `skipHtml` and no image component.
- `src/content/markdownValidation.ts` rejects raw HTML and images in stems and rationales. `src/admin/core/validateAdminBank.ts` and `src/qa/ContentQaPanel.tsx` use this validation.
- `QuizScreen.tsx` and `QuizBrowseScreen.tsx` render stems; `ExplanationContent.tsx` renders rationales and sources. `MarkdownContent` also renders choices and choice explanations.
- `docs/architecture.md`, `docs/question-schema.md`, `docs/content-management.md`, and `docs/design-system.md` explicitly describe the existing prohibition and need coordinated updates.

## Library choice

Keep the existing `react-markdown` and `remark-gfm` packages. Add the maintained unified/rehype packages [`rehype-raw`](https://github.com/rehypejs/rehype-raw) to parse embedded HTML and [`rehype-sanitize`](https://github.com/rehypejs/rehype-sanitize) to enforce a narrow allowlist. The [`react-markdown` documentation](https://github.com/remarkjs/react-markdown/blob/main/readme.md#appendix-a-html-in-markdown) describes this pairing for HTML in Markdown. Install versions compatible with the repository's current React Markdown/unified versions; no separate HTML string injection or custom sanitizer is needed.

## Implementation steps

1. **Define the supported authoring contract.** Keep `stem` and `rationale` as GFM strings that may contain a small HTML subset: paragraphs, line breaks, emphasis, subscript/superscript, lists, blockquotes, tables, links, and images. Support both Markdown image syntax and `<img>`. Require useful image `alt` text. Define permitted attributes per tag; reject scripts, iframes, SVG, forms, event handlers, inline style, and arbitrary classes/IDs. Do not change stored IDs, order, answers, or existing content.
2. **Create a shared content safety policy.** Define a restrictive `rehype-sanitize` schema for supported tags and attributes in a small `src/content` module; do not rely on its broader default schema alone. Put link and image URL rules alongside it for both rendering and validation. Continue to allow `https:`, `http:`, and `mailto:` for links as appropriate. Allow only app-local image paths and explicitly approved HTTPS image origins. Keep the approved origin list in a shared configuration that both the build and content-validation script load, so a future S3 or CloudFront image origin can be added without changing question records or a component. Reject `javascript:`, `data:`, `blob:`, protocol-relative URLs, and unsupported image origins. Preserve query strings needed by an approved asset URL. Document the exact authoring form for local assets and future hosted image URLs.
3. **Extend the shared renderer with an explicit rich-content mode.** In that mode, configure `react-markdown` with `remark-gfm`, then `rehype-raw` (`tagfilter: true`), then `rehype-sanitize` with the shared schema; apply the URL policy to `href` and `src` with `urlTransform`. Keep restricted rendering as the default for choices, choice explanations, and sources. Add a semantic wrapper or explicit content-kind API so only stems and rationales opt into rich content. Map allowed HTML/Markdown images to one reusable responsive image primitive with `alt`, `loading="lazy"`, bounded width, and readable spacing. Retain the existing MUI typography, GFM table scrolling, and external-link behavior. Do not inject unsanitized HTML directly into the DOM.
4. **Wire the two content paths.** Use the rich mode for stems in `QuizScreen`, `QuizBrowseScreen`, and the content QA preview, and for rationales in `ExplanationContent`. Ensure the rationale sources disclosure and choice surfaces remain restricted. Check nested HTML/Markdown layout inside MUI components so paragraphs, tables, and figures remain valid and fit small screens.
5. **Align validation and admin previews.** Update `markdownValidation.ts` to use the same tag/attribute and URL policy. Add an inspection pass before `tagfilter` or sanitization so disallowed tags, attributes, and URLs produce field/question-specific errors instead of being silently stripped at runtime. Accept supported HTML and image nodes only in stems/rationales, and validate image alt text and URLs. Keep source fields restricted. The same rules must apply to canonical validation and admin change-set preview/staging; replace the existing admin test that assumes every raw HTML element is forbidden.
6. **Update tests with focused fixtures.** Add renderer tests for mixed GFM/basic HTML, `<sub>`/`<sup>`, Markdown and HTML images, alt text, lazy loading, responsive sizing, approved local and HTTPS image URLs, and safe links. Assert that scripts, event attributes, CSS, SVG/iframe markup, and unsafe URLs do not become executable DOM or loadable images. Add validation tests for accepted and rejected stem/rationale content, restricted sources, and matching admin preview behavior; verify that choices and choice explanations still use the restricted renderer. Add screen-level checks that both quiz and Browse Answers show a stem image and a rationale image, including the answer-unavailable path. Keep the full-bank validation test.
7. **Update documentation.** Revise the architecture, schema, content-management, design-system, and testing docs with the supported subset, URL policy, image sizing/alt expectations, and the future S3-origin configuration point. Include a concise authoring example for Markdown and HTML images. Note that image storage/upload and S3 permissions are separate future work.
8. **Verify and review.** Run `npm run validate:content`, `npm test`, and `npm run build`. Review a question fixture at narrow and desktop widths, including a failed image URL, for layout and fallback behavior. Confirm existing canonical JSON is byte-for-byte unchanged and that no runtime LLM or backend dependency was introduced. Move this tracker to `docs/work/done/` when all steps pass.

## Acceptance criteria

- A valid embedded HTML fragment and image render in a stem and rationale in both quiz modes.
- Existing Markdown rendering, source disclosure, choice rendering, and answer behavior remain intact.
- Unsafe HTML and URLs are rejected during content validation and cannot execute if malformed content reaches the browser.
- Images are accessible, responsive, and work with a future approved S3/CloudFront HTTPS origin without a schema change.
- Content validation, tests, and build pass.

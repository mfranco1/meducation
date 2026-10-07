# LaTeX support in quiz stems and rationales

> Historical record: paths and check results below describe their implementation stage. See [current architecture](../../architecture.md) for present ownership; retain these historical claims.

Status: implemented; validation and automated checks passed. See completion record at the end.

## Outcome and boundaries

Stems and rationales must render a mixture of GFM Markdown, the existing approved HTML/image subset, and LaTeX mathematics in Fast Feedback, Exam Mode when explanations are revealed, and Browse Answers. Preserve typography, images, links, tables, answer behavior, and source disclosure. Invalid math must remain readable without crashing the question or hiding surrounding content.

This is support for mathematical expressions, not arbitrary LaTeX documents, packages, or document layout. Retain schema v4, stable IDs, content ordering, and answer provenance. Do not rewrite the canonical bank to introduce rendering support. Choices, choice explanations, pearls, and sources retain their current policies. No backend, runtime LLM, CDN dependency, or external math service is needed.

This tracker records the implementation and its verification.

## Findings from the current implementation

- `src/app/components/content/MarkdownContent.tsx` is the shared renderer. It uses `react-markdown` and `remark-gfm`; rich mode additionally runs `rehype-raw` with `tagfilter`, followed by `rehype-sanitize`.
- `src/content/richContentPolicy.ts` owns the HTML allowlist and link/image URL policy. Its schema currently removes classes, MathML, and styles needed by generated math.
- Stems already opt into rich mode in `QuizScreen.tsx`, `QuizBrowseScreen.tsx`, and `src/qa/ContentQaPanel.tsx`. `src/app/components/feedback/ExplanationContent.tsx` renders rationales in rich mode and sources separately in restricted mode.
- `src/content/markdownValidation.ts` parses GFM without math. `src/admin/core/validateAdminBank.ts` reuses it, so parser and validation changes must work for both canonical and staged content.
- The current bank contains inline `$...$` formulas and same-line `$$...$$` formulas, including peripheral resistance, ventilation, and odds ratios. It also contains literal currency: `Country X’s GDP is $500B; its citizens earn $100B abroad.` Blindly enabling single-dollar math would risk changing that text.
- The canonical JSON already has user changes in the working tree. Preserve that starting content; compare before/after hashes rather than requiring a clean diff against HEAD.

## Recommended libraries

Add compatible releases of `remark-math`, `rehype-katex`, and `katex`, with versions recorded in the lockfile. Keep the existing Markdown/HTML pipeline. These packages integrate math parsing and rendering with unified rather than requiring a second DOM scan. Validate representative medical formulas against KaTeX's supported commands before committing to the dependency set. See the [official remark-math documentation](https://github.com/remarkjs/remark-math/blob/main/packages/remark-math/readme.md), [rehype-katex documentation](https://github.com/remarkjs/remark-math/blob/main/packages/rehype-katex/readme.md), and [KaTeX supported functions](https://katex.org/docs/supported.html).

Bundle `katex/dist/katex.min.css` and its fonts through Vite so rendering works offline. Preserve HTML plus MathML output for visual rendering and accessibility. Use `trust: false`, finite size/expansion limits, and fresh macro state per expression. Share the selected policy with development-time validation. See [KaTeX options](https://katex.org/docs/options.html).

## Implementation sequence

- [x] **1. Establish and test the authoring contract.** Support `$...$` inline expressions and `$$` display blocks on separate lines. Preserve existing same-line `$$...$$` expressions according to the parser's inline semantics; do not silently reformat stored content to make them display blocks. Support fenced `math` blocks explicitly; ordinary code blocks and inline code remain literal. Document escaped dollars (`\$`), JSON backslash escaping, unmatched delimiters, and nested math in lists, emphasis, and table cells. Initially leave `\(...\)` and `\[...\]` literal and document that they are not supported delimiters. TeX commands inside supported delimiters remain supported according to KaTeX.

  Prototype delimiter handling against every dollar-bearing stem/rationale and a focused currency/math fixture set before wiring the renderer. Single-dollar syntax is inherently ambiguous: ordinary currency must remain text, including multiple amounts in one sentence, while numeric math such as `$600 \\times 12$` must render. If default `remark-math` misclassifies currency, add a small shared, context-aware tokenizer extension with explicit currency rules and source-position tests. Protect code, HTML attributes, links, and image URLs at parsing boundaries; do not run global search-and-replace on content. Define any irreducibly ambiguous cases as literal text and require escaped currency or an unambiguous math form for new authoring. Record the final rules and test them identically in rendering and validation. This compatibility gate must pass before moving on.

- [x] **2. Extend only rich rendering.** Add math parsing only for `contentKind="rich"`. The pipeline should be Markdown + GFM + math parsing, conversion to HTML AST, `rehype-raw`, `rehype-sanitize`, then `rehype-katex`. Preserve only the exact generated math marker classes (`language-math`, `math-inline`, `math-display`) on `code` in the sanitizer. Continue rejecting author-supplied classes/styles/MathML through canonical validation; do not allow broad arbitrary classes or styles. Sanitization must precede KaTeX so generated markup survives. This ordering is described in the [official rehype-sanitize math example](https://github.com/rehypejs/rehype-sanitize#example-math). Keep KaTeX untrusted-input safeguards enabled because it runs after sanitization. Retain the current URL transform, image component, and restricted-mode defaults.

- [x] **3. Fit math into the current UI.** Import the bundled CSS wherever learner/QA rich content is rendered. Add scoped math styling: inline equations align with text, display equations have readable spacing, and long equations scroll within the content width without widening the screen or covering controls. Check flex/grid `min-width` boundaries. Ensure custom `code`/`pre` components do not apply code-chip styling to rendered math or discard math markers. Keep ordinary code styling and existing image/table behavior. Verify valid DOM nesting and MathML/ARIA attributes survive React rendering.

- [x] **4. Align content and admin validation.** Reuse the same parser/delimiter policy for stems and rationales, recognizing math nodes and fenced math blocks. Validate recognized TeX using KaTeX with throwing validation behavior and field/question-specific diagnostics, without storing generated HTML. Keep math source opaque to HTML/URL validation so operators such as `<`, `>`, and `&` are not treated as markup. Reject invalid/unsupported expressions and forbidden trust-dependent commands during authoring; unmatched delimiters remain literal under the documented contract. Keep HTML/image checks and restricted sources unchanged. Confirm admin preview/staging rejects invalid math atomically with the same diagnostics as canonical validation.

- [x] **5. Provide a safe runtime fallback.** Verify the installed `rehype-katex` version's error behavior: its public options omit `throwOnError`, so do not assume it accepts that KaTeX option. Use the plugin's escaped error output, or a small AST-level fallback if necessary, to retain malformed expression source and surrounding content. Test unsupported commands, unbalanced braces, HTML-like error text, and excessive macro expansion. Error text must never be injected as raw HTML. Preserve macro isolation when navigating between questions. See [KaTeX error handling](https://katex.org/docs/error).

- [x] **6. Update documentation.** Update architecture, question schema, content management, design system, and testing docs with delimiter/currency rules, JSON examples, supported math scope, sanitizer ordering, error behavior, offline assets, and the restricted-field boundary. Use synthetic fixtures rather than adding demonstration questions to the canonical bank.

## Test and verification plan

- [x] **Parser/policy tests:** inline/display math, same-line double-dollar expressions, fractions, subscripts/superscripts, Greek letters, units, inequalities, aligned expressions, escaped/unmatched dollars, multiple prices, comma/decimal prices, and numeric math. Ensure delimiters in code, HTML attributes, image URLs, and links remain untouched. Include the actual GDP and medical formula strings as fixtures. Define expected behavior for math adjacent to inline HTML and inside raw HTML blocks; do not promise Markdown parsing inside opaque HTML blocks. Require Markdown block boundaries where necessary.
- [x] **Renderer tests in `MarkdownContent.test.tsx`:** assert actual `.katex`, `.katex-display` where appropriate, and MathML output rather than only source text. Render a single fixture combining emphasis, lists, tables, `<sub>`/`<sup>`, links, Markdown images, HTML images, and math in both stem/explanation variants. Preserve existing restricted-mode, URL, script, and attribute tests. Test malicious TeX commands and spoofed math classes; neither may create active links, images, scripts, arbitrary styles, or IDs. Generated layout styles remain allowed only from the renderer. Test error fallback and ordinary code separately.
- [x] **Validation/admin tests:** valid mixed content passes, malformed recognized math has field/question-specific errors, trust-dependent commands are rejected, currency is unchanged, restricted sources still reject HTML/images, and invalid math cannot be staged in a mixed admin batch. Retain full-bank tests and provenance checks.
- [x] **Screen integration tests:** extend QuizScreen and QuizBrowseScreen coverage with mixed-content stems/rationales; verify immediate feedback, deferred feedback timing, browsing, missing/unreviewed answers, and sources disclosure. Assert restricted choices and explanations retain their behavior. Check the QA stem preview uses the same math path.
- [x] **Real-browser verification:** opened the canonical GDP currency question at 375px and confirmed both stem and rationale currency render as text, lines wrap inside the question card, and answer controls remain visible without page-wide horizontal overflow. KaTeX inline/display output, MathML annotations, and mobile equation overflow rules are covered by renderer tests and bundled CSS. Browser zoom at 200%, offline reload, and a formula-heavy question screenshot were not separately exercised.
- [x] **Completion checks:** run `npm run validate:content`, `npm test`, and `npm run build` (includes TypeScript checking), then `git diff --check`. Compare the canonical JSON hash with the captured pre-implementation hash. Investigate failures and record results; do not mark complete while checks fail. Move this tracker to `docs/work/done/` only after implementation and all verification gates pass.

## Acceptance criteria

Both stems and rationales render supported LaTeX alongside existing Markdown, sanitized HTML, and images across learner modes. Existing currency, code, URLs, content, provenance, and answer behavior are preserved. Malformed expressions cannot break a question. HTML/TeX safety boundaries, accessible math, local fonts, narrow-screen layout, and all project checks are verified. A saved plan alone does not satisfy these implementation criteria.

## Completion record

- Added `remark-math`, `rehype-katex`, and KaTeX with a shared currency-aware Markdown extension and runtime/authoring parity.
- Bundled KaTeX CSS/fonts locally; sanitized HTML before math conversion and constrained display-equation overflow.
- Updated the five content/design/testing documents and added parser, renderer, validator, Fast Feedback, and Browse Answers tests.
- `npm test`: 137 tests passed across 25 files.
- `npm run validate:content`: valid, 11,687 questions across 111 quizzes.
- `npm run build`: passed (TypeScript and Vite); Vite emitted a 14.5 MB validation chunk and its large-chunk warning.
- `git diff --check`: passed. The canonical question bank was not edited by this implementation; pre-existing working-tree changes were preserved.

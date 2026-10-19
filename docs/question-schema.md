# Question schema

Defines the schema-v6 quiz document stored in paired drafts and releases and written to deterministic `questionBank.json` exports. Preserve array and choice order, exact authored strings, omitted optional fields, answers, and established IDs ([AGENTS.md](../AGENTS.md#content-invariants)). The server assigns new IDs when a record is created.

The document has `schemaVersion: 6` and top-level `subjects`, `topics`, `quizzes`, and `questions` collections. IDs are compact, type-prefixed strings: subjects use `s*`, topics `t*`, quizzes `q*`, and questions `i*`. Subjects, topics and quizzes may have an optional `description`: plain text, at most 500 characters, no line breaks (the same rule applies to deck descriptions). A topic is `{ id, subjectId, name }`; a quiz stores `topicId` and a question `quizId`, with no redundant subject IDs. Topics are ordered within their subject and may be empty. Questions are grouped by quiz in canonical array order; their position within each quiz determines the one-based learner display number. The database stores a zero-based global collection ordinal per table to reconstruct each array exactly ([architecture](architecture.md#releases)).

The `subjects` and `topics` collections are also the authoritative registry for flashcards: decks reference these stable topic IDs from the paired flashcard document; do not duplicate subjects or topics there. `question.metadata.topic` remains optional descriptive text and is unrelated to the topic records.

Each question has a stable ID, canonical GFM `stem`, ordered `choices`, a required `answer` (a choice ID), a required GFM `rationale`, optional `rationaleMeta.sources`, optional `pearls`, and sparse optional metadata. Put per-choice explanations in the rationale. `questionCount` is derived from the indexed questions and is not stored on a quiz.

IDs are opaque database identifiers; do not derive subject, quiz, ordering, or display meaning from them.

## Markdown and rationale metadata

`stem` and `rationale` are canonical GitHub Flavored Markdown with inline LaTeX in `$...$` and display math in `$$` blocks on separate lines. Fenced `math` blocks are also supported. Use `\$` for a literal dollar next to a number when it could be read as math; common currency amounts followed by prose (for example `$500B; its citizens...` or `$10 per item and $20 each`) are preserved as text. A dollar pair that looks like an amount ending in an incomplete arithmetic operation is preserved as text too. Use TeX such as `$600 \times 12$` for unambiguous numeric math. An unmatched delimiter and `\(...\)` or `\[...\]` remain literal. Ordinary fenced code and inline code are not interpreted as math.

Stems and rationales may also include a limited HTML subset: paragraphs, headings, emphasis, subscript, superscript, lists, blockquotes, tables, code, links, and images. Markdown image syntax and `<img>` are supported. Images require meaningful alt text and may use an app-local path such as `/content/figures/nerve.png`; the app also renders HTTPS origins listed in `VITE_CONTENT_IMAGE_ORIGINS`, but API validation currently accepts app-local images only. Scripts, iframes, SVG, forms, event handlers, inline styles, arbitrary classes and IDs, unsafe link protocols, data URLs, and protocol-relative URLs are forbidden. `rationaleMeta.sources` and choices remain restricted Markdown and do not render math. Content is validated at development time and sanitized at rendering time through one shared component; it is never rewritten by the browser. Math is rendered locally with KaTeX and bundled fonts; the sanitizer preserves only the allowlisted math marker classes needed by the rendering pipeline.

`rationaleMeta.sources` is shown in a disclosure below the rationale. The app never generates explanations at runtime.

`metadata` is omitted when no classification is known. `difficulty` is `easy`, `medium` or `hard`. Do not store a duplicate discipline label or an empty metadata object.
Optional fields are omitted rather than stored as `null`. The bank loader and authoring validator reject unknown nested metadata keys and malformed values. API responses preserve omitted optional fields; the browser hydrates a missing `metadata` field only after checking the response.

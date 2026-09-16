# Testing

Run `npm test` for domain and question-bank tests, `npm run validate:content` for structural data validation, and `npm run build` before handoff. Add fixture-based tests for every imported content edge case or scoring behavior. When changing session behavior, cover start, resume, checkpoint, leave, abort, and finish using repository interfaces. When changing the extraction pipeline, compare representative PDF output before replacing generated content.

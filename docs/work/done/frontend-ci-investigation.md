# Frontend CI investigation

- [x] Inspect the latest pushed workflow and its job/step conclusions.
- [x] Read failure annotations and inspect the failing test and rendering lifecycle.
- [x] Replace the stale-node assertion with a retried visibility assertion.
- [x] Run lint, formatting, and the focused integration test locally.
- [x] Finish full local test suite and document findings.

## Evidence

GitHub run [37409777564](https://github.com/mfranco1/meducation/actions/runs/37409777564) tested commit `eb45e72fa18106ca4aaf071167676dd23a7e4dca`. Backend and browser-smoke passed. Frontend lint and formatting passed; `npm test` failed, so content validation and build were skipped.

The failure annotation points to `src/app/App.progressive.test.tsx:178`, in “loads the quiz screen after its questions arrive and keeps the attempt in browser storage”: `toBeVisible()` received an element that was no longer in the document. The query found the question stem, then its DOM node became detached before the assertion.

Likely rendering trigger: finishing Suspense loading updates the shell's loading state, and `MarkdownContent` supplies freshly defined renderer components on each render, allowing its heading node to be replaced. The assertion awaits `findByText` and then checks a potentially stale element outside the retry callback. Use `waitFor` with a fresh query and the visibility assertion in the same callback to tolerate legitimate rerenders without relaxing the expected visible result.

The test now runs the fresh text query and visibility check inside `waitFor`, so React can replace the heading during the loading-state rerender without leaving the assertion attached to a removed node. The focused integration suite passed locally (6 tests), as did the full suite (44 files, 271 tests), lint, formatting, and the TypeScript/production build. The build retains its existing large-chunk warning. Full authenticated job logs were unavailable through the public API; check annotations supplied the exact failure.

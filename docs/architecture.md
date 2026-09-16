# Architecture

`src/content` is source-derived, human-editable question-bank data. `src/domain` holds pure quiz rules and types. `src/persistence` implements local storage behind repository interfaces. Active attempts include an optional stable current-question ID, allowing the UI to resume saved progress while remaining compatible with attempts stored before checkpoints were added. `src/analytics` aggregates structured completed attempts. `src/app` is presentation only.

The runtime never calls a generative AI service. Future API repositories can implement the existing repository interfaces without changing quiz logic or components.

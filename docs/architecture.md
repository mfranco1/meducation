# Architecture

`src/content` is source-derived, human-editable question-bank data. `src/domain` holds pure quiz rules and types. `src/persistence` implements local storage behind repository interfaces. Active attempts include an optional stable current-question ID plus persisted accumulated active time and a running-session timestamp, allowing the UI to resume both progress and the stopwatch. Legacy attempts without the timing fields remain compatible through the domain timing helpers. `src/analytics` aggregates structured completed attempts. `src/app` is presentation only.

The runtime never calls a generative AI service. Future API repositories can implement the existing repository interfaces without changing quiz logic or components.

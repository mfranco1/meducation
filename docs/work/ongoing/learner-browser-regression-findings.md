# Learner browser findings from the admin audit

Date: 2026-10-12. Status: open; outside the admin implementation scope.

`npm run test:e2e` built the normal production bundle successfully and ran 16 Chromium tests: 13 passed, 3 failed. No learner production source, browser-test fixture, or canonical bank was changed by the admin audit.

- [ ] `dashboard stat cards stay readable across desktop and narrow layouts` (`e2e/learner-smoke.spec.ts:3`): the Flashcards locator expects **Completed decks**, **Average count**, and **Highest count**. The current dashboard uses **Completed**, **Average**, and **Highest** with shorter supporting text. Update selectors to current accessible labels while retaining numeric, layout, and styling assertions.
- [ ] `flashcards browse, resume an imported fixture deck, and finish without quiz analytics` (`e2e/learner-smoke.spec.ts:168`): its final dashboard assertions use the same obsolete labels. The preceding study flow completed; the failure occurs at the old Completed decks label.
- [ ] `API-backed quiz survives reload, completes, and opens Browse Answers` (`e2e/learner-smoke.spec.ts:351`): after resizing to 390×844, the Additional context heading cannot be found through its accessible role. The captured DOM still includes the heading; investigate mobile modal/drawer accessibility state before changing the assertion. Do not hide this failure with a CSS-only locator.

Full frontend unit verification passed (474 tests). The learner lazy-study test's initial ready wait was extended from the one-second Testing Library default after it failed under full-suite load and passed unchanged alone; its assertions remain intact. Admin checks and the enabled authoring build passed independently. These browser failures are not counted as passing verification in the completed admin audit.

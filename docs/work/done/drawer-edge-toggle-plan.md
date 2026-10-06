# Drawer edge toggle

## Status

Complete. Reusable drawer surface and edge toggle are implemented with expanded component and browser coverage.

## Intended behavior

Replace the menu-style expand/collapse control in the learner drawer with a small arrow at its right edge. Keep the arrow at the current toggle's vertical center, approximately 96px from the drawer top. It points left when expanded and rotates 180 degrees to point right when collapsed.

The entire visible right edge of the drawer is clickable. Hovering the arrow or any point along that edge reveals a subtle orange line for the full visible drawer height. Moving the pointer away hides the line. Keep the arrow visible at rest, with a muted color and no filled background. Neither hover nor pressing the control changes its background, and clicking produces no ripple.

Use the same behavior for the desktop drawer, the collapsed mobile rail, and the expanded mobile overlay. Keep the existing 240px/64px desktop widths, mobile overlay behavior, destination buttons, and guarded quiz/review navigation.

## Geometry and accessibility

- Keep the existing vertical spacing: the brand retains its 48px slot, and the old toggle row becomes a noninteractive 48px spacer. Quizzes and Flashcards retain their current vertical coordinates in both states. Anchor the arrow to the center of that spacer through a shared offset rather than duplicating unrelated numbers.
- Make the edge a narrow full-height hit area, initially 12px wide, inside the right boundary. Center a roughly 24px arrow target on the boundary at the toggle level. The arrow's hit area extends the same button rather than creating another nested button or a second Tab stop.
- Render the edge as one native button through MUI `ButtonBase`, with `disableRipple`, transparent hover/active backgrounds, an explicit pointer cursor, and a labelled expanded state. Use “Collapse navigation” / “Expand navigation”, `aria-expanded`, and `aria-controls` targeting the displayed drawer contents.
- Treat the arrow and orange line as decoration. They do not become separate accessible elements. Enter and Space activate the same action as a click. Keyboard focus shows the edge line plus a clearly visible focus indicator around the arrow target.
- Disabled bootstrap/failure controls must not toggle or show the interactive hover line. Keep the existing mobile Escape/backdrop dismissal and focus restoration.
- Place the control above the drawer surface but below global dialogs. Constrain the hit strip to the drawer so it does not intercept destination controls or main-content interaction. Reserve enough room for the arrow near the boundary without introducing horizontal document overflow.
- Animate only the arrow rotation and line opacity, using the existing short transition timing. Honor reduced motion by changing both immediately. Keep the border/line anchored to the moving drawer boundary during its width transition.

## Reusable composition

Introduce a controlled `DrawerEdgeToggle` primitive under `src/app/components/drawer/`:

- Inputs: `expanded`, `onToggle`, `disabled`, `controlsId`, accessible expand/collapse labels, and the arrow's vertical offset.
- Owns: the single edge hit target, arrow presentation, line hover/focus treatment, keyboard semantics, and reduced-motion styling.
- Does not own: destination selection, quiz exits, application navigation, persistence, or desktop/mobile expansion policy.

Add a small `DrawerSurface` wrapper in the same directory to compose a positioned surface, its scrollable content, and an optional edge control. Its outer layer allows the arrow to remain visible; its inner content layer keeps scrolling and clipping separate from the edge. Accept content and the control as composition slots. Retain MUI `Drawer` for the mobile modal and focus trap.

Keep expansion state in `AppNavigationDrawer`. The learner supplies its labels and control ID and composes the same primitives for the desktop/rail and overlay surfaces. Avoid building a general navigation framework or adding a dependency for this interaction.

## Implementation checklist

- [x] Inspect the current drawer geometry and capture expanded/collapsed control positions before replacing the toggle.
- [x] Add `DrawerEdgeToggle` and `DrawerSurface`, using theme colors and shared dimensions.
- [x] Remove `MenuRoundedIcon`, `MenuOpenRoundedIcon`, and the old inline `IconButton` from `AppNavigationDrawer`.
- [x] Preserve the old row's height as an inert layout spacer and position the new arrow at its center.
- [x] Attach the full-height edge control to the desktop/rail and mobile overlay surfaces. Keep the underlying rail inaccessible while the mobile modal is open, using MUI's existing modal behavior.
- [x] Route edge and arrow clicks to the same expansion callback exactly once; preserve mobile dismissal and focus restoration.
- [x] Keep the surface's content scrollable while the edge and arrow remain anchored to the visible drawer height.
- [x] Update component and browser coverage below, including disabled and reduced-motion behavior.
- [x] Update `docs/design-system.md`, `docs/architecture.md`, and `docs/testing.md` to describe the new edge interaction and composition boundary.
- [x] Record verification results and move this tracker to `docs/work/done` after implementation passes its checks.

## Relevant tests

### Primitive and drawer component tests

Add `DrawerEdgeToggle.test.tsx` for accessible labels, expanded state, correct controls reference, one button/Tab stop, callback behavior from arrow and edge clicks, disabled behavior, and decorative icon semantics. Verify reduced-motion presentation through the existing match-media test conventions. Keep actual hover geometry and CSS animation checks in Playwright.

Update `AppNavigationDrawer.test.tsx` to use the new edge toggle while retaining the existing brand, two destinations, mobile overlay, selection, and logo-ripple coverage. Verify toggling does not invoke a destination callback and disabled navigation cannot be expanded. If the surface wrapper introduces a scrolling boundary, cover composition with a child that retains its mounted state while expansion changes.

### Browser interaction and layout tests

Extend the existing navigation browser test in `e2e/learner-smoke.spec.ts`, preserving its dashboard switching and active-quiz leave/resume path:

- Expanded arrow points left; collapsed arrow points right. Check the final transform after rotation settles, and immediate rotation with reduced motion.
- Click the arrow, then click the edge near both its top and bottom, away from the arrow. Each click changes expansion exactly once. Check the drawer widths and `aria-expanded` after each action.
- Hover the arrow and several points along the edge. Verify the same full-height orange line appears, hides after pointer exit, and does not appear from hovering unrelated navigation content.
- Verify transparent control backgrounds before hover, during hover, and while the pointer is pressed. Confirm pointer interaction does not create a ripple.
- Activate by Enter and Space. Check the focus indicator and line remain visible while focused, with no duplicate toggle in the Tab order.
- Compare brand and destination vertical coordinates before/after collapse. Verify the arrow remains at the old toggle level and at the current drawer boundary.
- At 390px width, open via the rail edge and close via the overlay edge, Escape, and backdrop. Check focus restoration and that the hidden underlying control cannot be activated through the modal.
- Check no horizontal document overflow and no interception of destination/main-content clicks. Exercise short-height/scrolling drawer content in a primitive fixture if the two-item learner drawer cannot overflow naturally.
- Capture and inspect desktop expanded/collapsed and mobile overlay screenshots after transitions settle.

Keep existing quiz and review exit tests: expansion remains presentation state and does not trigger navigation, mutate progress, or remount the active screen.

## Verification

During implementation run the focused primitive/drawer tests and the navigation browser test. Before handoff run `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run test:e2e`, and `git diff --check`. Record actual outcomes; do not mark implementation complete while relevant checks fail.

## Verification results

- `npm test` — passed (44 files, 271 tests).
- `npm run lint` — passed.
- `npm run format:check` — passed.
- `npm run build` — passed; existing large-chunk warning remains.
- `npm run test:e2e` — passed (8 Chromium tests). After the final edge-keyboard and reduced-motion assertions were added, the focused navigation browser test passed again.
- `git diff --check` — passed.
- Visually inspected the desktop collapsed and mobile expanded drawer captures after transitions settled.

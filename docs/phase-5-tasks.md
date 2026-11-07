# Phase 5 Tasks: Polish

> **Draft:** not yet reviewed. Scope, order and success criteria may change before phase 5 starts.

This breaks down [Phase 5](implementation-plan.md#phase-5-polish) of the implementation plan into tasks. Each task says what problem it solves, what work or exploration it needs, and what done looks like. The site is live (phase 4), so every task ends with a deploy and a check against production.

Suggested order: the smaller, independent tasks first (favicon and meta tags, attribution, empty and error states), then the about modal and bottom sheet, then the accessibility pass, which has to come after both because it re-tests them. The wrap-up task closes the phase.

## 1. Favicon and meta tags

**Problem:** Every page load logs a 404 for `/favicon.ico`, the only console error left in the phase 4 checks. Browser tabs, bookmarks and phone home screens show a generic icon, and links shared in chat apps or social media get no preview beyond the page title. `web/index.html` has a title and description but nothing else.

**Work:**

- Design a simple icon that reads at 16 px (e.g. overlapping outlines in the two provider colours) as an SVG, plus a 180 px PNG `apple-touch-icon` for iOS, which doesn't use SVG icons.
- Decide whether to also ship a `favicon.ico`. With a `<link rel="icon">` most browsers stop requesting `/favicon.ico`, but some clients and crawlers still ask for it; a tiny `.ico` is the simplest way to end the 404 for good.
- Add `theme-color` (light and dark, matching the colour tokens in `styles.css`), Open Graph and Twitter card tags (title, description, URL). An `og:image` needs an absolute URL and a PNG of roughly 1200×630; decide whether a screenshot of the map is worth maintaining.
- Check that nginx serves the new top-level files with the right MIME types and cache rules (`location /` already sends `no-cache`), and that the CSP allows them (`img-src 'self'` should cover it).

**Done when:** no 404 or other errors in the console on load; the icon shows in desktop tabs and on an iOS home screen; a link preview (e.g. pasted into a chat app, or checked with an Open Graph debugger) shows the title and description; `curl -I` shows the expected headers for each new file.

## 2. Collapsed attribution on phones

**Problem:** On narrow screens MapLibre's compact attribution control starts expanded, and in the short 40%-height phone map it covers the bottom of the map until the first interaction (found in the phase 4 checklist).

**Work:**

- Find out how MapLibre 6 and `react-map-gl` decide the initial compact state, and whether there's a supported option to start collapsed. If not, the likely fix is removing the `maplibregl-compact-show` class once the map loads, which needs a test against the mocked map and a by-hand check, since it depends on MapLibre internals.
- Check the OpenStreetMap Foundation attribution guidelines and MapTiler's terms for what they require on first view. If credits must be visible at first, collapse after a few seconds instead of straight away.
- Make sure the control still collapses or expands correctly when the window is resized across the 768 px breakpoint.

**Done when:** at phone widths the attribution starts collapsed (or collapses after the allowed delay) and opens with its info button; desktop is unchanged; all credits still appear once each when expanded; the approach is recorded in the plan's Attribution section.

## 3. Empty and error states

**Problem:** The main failures are handled (data failing to load, with a retry button; stale providers; a provider's boundaries failing; providers with no data yet), but some cases still leave the user with a blank or confusing screen:

- If the basemap style fails (missing or restricted MapTiler key, network error, or the keyless fallback style, which the production CSP blocks), the map is blank with no message. `MapView` doesn't handle MapLibre's `error` event.
- If the browser has no WebGL, MapLibre throws and the map area shows nothing, even though the list and selection still work.
- On a fresh deploy before the first update finishes, `meta.json` is missing, so the user sees the generic "couldn't be loaded" error with a raw message, when the truth is "no data published yet".
- A search with no results says "0 extracts matching …" with no hint about why (e.g. the extract exists at another level or for the other provider).

**Work:**

- Go through each state above and decide the message and what stays usable. The extract list and selection panel should keep working when only the map fails.
- Add an error boundary or `error` handler around the map, and a WebGL check, with a short message in the map area.
- Tell "no data yet" (404 on `meta.json`) apart from other failures in `web/src/lib/load.ts`, and replace raw error text with plain wording (keeping details for the console).
- For an empty search, consider a hint such as "No matches at this level; try Smallest available or Both providers", and only show it when it would help.
- Tests for each state in `App.test.tsx`, `load.test.ts` and the component tests, including axe checks in the error states.

**Done when:** each state listed has a clear message and a way forward where there is one (retry, change level, use the list); there are tests for every state; a forced style failure and a forced missing `meta.json` are checked by hand in the browser.

## 4. About modal

**Problem:** The site doesn't explain itself beyond a one-line intro. People have to guess what the dashed "coarser" style means, why some extracts have replication badges and others don't, where the data comes from and how fresh it is. The phase 3 header left a place for an about link.

**Work:**

- Write the content, briefly: what the site is (and that it helps explore providers rather than replacing their download pages); what the levels mean, and what "coarser" and the hatched coverage gaps show ("nothing drawn at this level", not "no extract at all"); the replication badges, with each provider's default interval (Geofabrik daily, OSM-FR minutely), so a missing badge clearly means "normal"; that sizes are estimates from rounded figures; data sources and attribution; the refresh schedule (Geofabrik weekly, OSM-FR occasionally and by hand); and a link to the GitHub repo.
- Choose the dialog approach. A native `<dialog>` with `showModal()` gives focus containment, Escape and a backdrop for free, but check how well jsdom supports it for tests; a custom dialog needs its own focus trap.
- Add an "About" button to the header. Focus goes into the dialog on open and returns to the button on close; Escape and a close button both close it; the page behind is inert.
- On phones the modal should be full-screen or close to it, and scroll on its own.
- Component tests and keyboard-flow tests as listed in the plan's accessibility tests (focus trapped and returned, Escape closes), plus axe checks.

**Done when:** the modal opens from the header, covers every topic above in plain language, works with keyboard alone and with VoiceOver, reads well on a phone, and its tests pass. The wording matches the legend and badges.

## 5. Mobile bottom sheet

**Problem:** Below 768 px the map takes a fixed top 40% of the screen and the sidebar scrolls underneath. It works, but the map is small, and there's no way to give the map more room when exploring, or the list more room when searching. The plan calls for a draggable bottom sheet with collapsed, half and full positions.

**Work:**

- First check whether the sheet is still the right design, given the phase 4 phone fixes (fixed `40svh` map, no overscroll bounce). Sketch how it changes the main phone flow: tap a polygon, see it selected, copy its URL. If the current layout turns out good enough, record that decision in the plan instead.
- Decide whether the sheet overlays a full-height map (no map resize while dragging, so no redraws; the visible map area changes instead) or resizes it (simpler for the overlap picker and attribution, but MapLibre has to resize on every change). Overlaying is likely better, given the redraw problem phase 4 fixed.
- Build or choose the drag behaviour. A small pointer-events implementation is probably enough and avoids a dependency; if a library is used, pin a release at least two weeks old. Handle drag versus inner scroll (the list scrolls inside the sheet only when it's full), snap points, velocity flicks, iOS Safari toolbars and safe areas, and `prefers-reduced-motion`.
- Make it accessible: the drag handle is a button (at least 44 px) that cycles positions with a clear accessible name and state; positions can be changed without dragging; content in the collapsed sheet isn't reachable by keyboard or screen reader when hidden.
- Decide how the sheet reacts to the map: e.g. selecting a polygon while collapsed raises it to half so the selection is visible, and the docked overlap picker and attribution stay clear of the sheet.
- Keep desktop unchanged. Use the existing `web/src/lib/media.ts` for the breakpoint.
- Component tests for positions, the handle button and keyboard use; drag logic (snap point from position and velocity) as a pure function in `web/src/lib/` with unit tests. Real touch behaviour is checked by hand on a phone.

**Done when:** on a real phone the sheet moves smoothly between the three positions by dragging and by tapping the handle, the map doesn't redraw while dragging, the main flow works without fighting the sheet, the overlap picker and attribution stay usable, it works with VoiceOver on iOS, and desktop is unchanged. Or: the sheet is dropped with the reason written in the plan.

## 6. Accessibility pass

**Problem:** The automated tests and the phase 4 VoiceOver pass cover the phase 3 interface. The bottom sheet, the about modal and the new error states are new interactive pieces that need the same checks, and some things automated tests can't catch (reading order, how announcements sound, contrast in a real browser).

**Work:**

- Extend the automated tests for the new components: keyboard-only flows (reach every control with Tab, the sheet handle, the modal's focus trap), accessible names for icon-only buttons, and `aria-live` announcements where content changes.
- Add any new colour tokens (icon, error states, sheet) to `web/src/lib/contrast.test.ts`.
- Run axe in real Chrome (which, unlike jsdom, checks contrast) at desktop and phone widths, with the modal open, with a selection, and in an error state.
- Check 200% browser zoom and 320 px width reflow, and that `prefers-reduced-motion` is respected.
- Repeat the VoiceOver pass on desktop through the main flow plus the about modal, and do a VoiceOver pass on iOS through the bottom sheet. Write down what was found and fixed, as in the phase 4 results.

**Done when:** axe reports no issues in real Chrome in the states above; the keyboard flows have tests; both VoiceOver passes are done with findings fixed or recorded as decisions; the plan's Accessibility and mobile section describes the final behaviour.

## 7. Wrap-up

**Problem:** Each phase ends by recording what was built and decided, so the plan stays the source of truth, and by checking production.

**Work:**

- Run the release checklist against production after the last deploy, adding items for the new pieces (favicon, collapsed attribution on phones, about modal, bottom sheet, error states).
- Add a "Phase 5 results" section to the implementation plan, and update the sections the work changed (Controls, Attribution, Accessibility and mobile, the repository layout if files were added).
- Note anything deferred to phase 6 or later.

**Done when:** the release checklist passes against production, the phase 5 results are written, and the plan matches what's deployed.

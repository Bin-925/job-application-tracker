# Design QA

Date: 2026-09-23
final result: passed

## Evidence

Source visual truth:
- docs/planning/design/today-summary-concept.png
- docs/planning/design/month-calendar-concept.png
- docs/planning/design/applications-concept.png

Rendered implementation:
- docs/qa/today-mobile.png
- docs/qa/calendar-mobile.png
- docs/qa/calendar-mobile-final.png (production build, full browser screenshot)
- docs/qa/applications-mobile.png
- docs/qa/applications-small.png
- docs/qa/application-editor-small.png
- docs/qa/schedule-editor-mobile.png
- docs/qa/today-desktop.png
- docs/qa/calendar-dark.png

The source images are mobile concept renders, not fixed browser pixel specifications.
The month-calendar source and rendered calendar were opened together in one comparison input.
Today was also compared to its source. Production fixtures deliberately use labelled sample data,
so company names, dates, and counts are not an exact-content comparison.

Viewports: 412x915, 320x740, 1440x1000 CSS pixels.
The desktop browser reserves 15 CSS pixels for its scrollbar. The in-app capture API sometimes
crops to the visible content area: today/calendar mobile captures are 397x882 pixels,
the schedule editor and applications-mobile are 412x915, small-width captures are 305x705,
and desktop is 1425x990. These are treated as content captures, not exact full-viewport pixel diffs.
Source concept images: 853x1844 pixels; compared by full content width and overall hierarchy,
not by treating their larger raster typography as CSS font sizes.
No phone bezel or fake OS status bar was added. The dark screenshot is re-captured separately
after the viewport has settled; the initial immediate resize capture was incomplete.

## Comparison History

1. Initial month calendar had both an '일정' page title and a separate month title.
   P2: duplicate hierarchy pushed the second selected-day event below the useful mobile viewport.
   Fix: month title is the single h1; navigation/actions remain adjacent.
   Post-fix evidence: calendar-mobile.png shows the full month and both event rows.
2. Initial navigation retained page scroll position between routes.
   P2: a route could open partway down the page.
   Fix: pathname-based scroll reset; filters within the current page are not reset.
   Post-fix evidence: today-mobile.png and today-desktop.png start at the page heading.
3. Focused review: the schedule editor and 320px application editor have usable date/time fields,
   visible save/cancel controls, no horizontal overflow, and a native modal focus boundary.

## Required Fidelity Surfaces

- Fonts/typography: Korean system font fallback, compact 24–28px page headings, readable body hierarchy.
  The original oversized generated concept typography is intentionally reduced for repeated use.
  No viewport-proportional font sizing or negative letter spacing.
- Spacing/layout: paired summary boxes, unframed timeline sections, seven-column month calendar,
  four mobile navigation items. Desktop uses a sidebar instead of a framed phone.
- Colors: neutral white/gray surfaces with blue navigation, green interviews, amber deadlines.
  Dark mode uses charcoal and accessible lighter semantic colors, not a dark blue monochrome theme.
- Assets: Lucide navigation/action icons and rasterized notebook PWA icons.
  Source contains no photographic subject requiring preservation; no stock hero was added.
- Copy/content: support applied-date checkbox; schedule names and explicit completion/cancellation;
  the two home summaries link to the promised filtered lists. Placeholder alert bell is replaced with
  a working refresh action while push notifications remain a separate release task.

## Interaction Evidence

Actual local API login, status change with past applied date, future interview creation from a
selected calendar date, persistence after reload, applied-date preference persistence, completion
removing an application from upcoming-interview counts, and application creation were exercised.
Frontend console warning/error log for the QA tab was empty after the successful run.
Production preview login and application editing were also verified after replacing the checked-in
Railway API default with an explicit same-origin configuration. Its final console log was empty.

## Remaining Checks

No actionable P0/P1/P2 visual issue remains in the inspected states.
P3: final font rendering and touch target comfort should be checked on the user's Galaxy S25 Ultra.
This visual QA result is not a public-release/security/PWA-install certification.
Actual Android installation, OS keyboard/safe areas, service-worker update recovery,
PostgreSQL migration, and production security checks are still release gates.

## Checklist

- [x] Compact mobile calendar hierarchy
- [x] 320px input and list widths
- [x] Mobile and desktop navigation
- [x] Light and dark calendar
- [x] Save operations verified against the real local API
- [ ] Galaxy S25 Ultra physical-device QA
- [ ] HTTPS staging and store release QA

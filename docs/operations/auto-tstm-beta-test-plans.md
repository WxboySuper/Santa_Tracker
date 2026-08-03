# Auto-TSTM beta test plans

Auto-TSTM is available on beta for early user testing as of July 1, 2026. These plans are written for beta testers who are exercising the feature from the hosted beta app, not for CI or local development.

Use the [Auto-TSTM operations guide](./auto-tstm-operations.md) for API behavior, cache health, and emergency-disable details.

## Feature under test

Auto-TSTM adds cached general thunderstorm guidance to the Forecast editor:

1. Open the Forecast editor.
2. Use **Day 1** or **Day 2**.
3. Open the **Tools** tab.
4. Select **Auto-TSTM**.
5. Review the preview layer.
6. Use **Apply** to commit the guidance or **Cancel** to discard it.

Auto-TSTM should be unavailable on unsupported forecast days and should never apply guidance without an explicit tester action.

## Tester report format

Ask testers to include:

- Tester name or handle
- Date and local time tested
- Device and browser
- Desktop, tablet, phone portrait, or phone landscape
- Forecast day tested
- Whether Auto-TSTM preview loaded, applied, or failed
- Screenshots or screen recording for any visual issue
- Steps to reproduce anything unexpected
- Whether the issue blocks normal forecast creation

## Plan 1: Short beta test

Goal: prove the feature can be found, previewed, cancelled, applied, and used on common devices without breaking the forecast workflow.

Recommended testers: broad beta group.

Recommended coverage:

- One desktop browser
- One mobile phone in portrait
- One mobile phone in landscape, if possible

### Steps

1. Open the beta app and enter the Forecast editor.
2. Confirm the map loads and the normal toolbar tabs are usable.
3. Select **Day 1**.
4. Open **Tools** and confirm **Auto-TSTM** is visible.
5. Open **Auto-TSTM**.
6. Confirm a preview dialog appears.
7. Confirm the map remains visible and usable behind or around the preview.
8. Select **Cancel**.
9. Confirm the preview closes and the forecast does not change.
10. Reopen **Auto-TSTM** on **Day 1**.
11. Select **Apply**.
12. Confirm the general thunderstorm area is added to the forecast.
13. Use undo once.
14. Confirm the Auto-TSTM-applied area is removed by the undo action.
15. Switch to **Day 2** and repeat preview plus cancel.
16. Switch to **Day 3**.
17. Open **Tools** and confirm Auto-TSTM is disabled or clearly unavailable.

### Pass goals

- Auto-TSTM is discoverable from the Tools tab.
- Preview opens for Day 1 and Day 2 when cached guidance is available.
- Cancel leaves the forecast unchanged.
- Apply adds only the previewed TSTM guidance.
- Undo removes the applied Auto-TSTM guidance in one action.
- Day 3 and later do not allow Auto-TSTM.
- No toolbar, map control, legend, credit, warning badge, or modal overlap blocks the workflow.

### Failures to report immediately

- Auto-TSTM is missing on Day 1 or Day 2 when the tester has beta access.
- Apply happens automatically before the tester selects **Apply**.
- Cancel still changes the forecast.
- Undo fails to remove the applied Auto-TSTM guidance.
- The mobile layout hides the map or makes Tools unreachable.
- Any crash, blank map, or repeated loading state.

## Plan 2: Full forecast test

Goal: test Auto-TSTM as part of realistic forecast creation and compare the generated guidance against forecaster judgment.

Recommended testers: experienced beta testers, forecasters, and anyone comfortable filing detailed feedback.

Recommended coverage:

- At least one fresh forecast cycle
- Day 1 and Day 2
- Desktop plus one constrained viewport, preferably phone landscape

### Setup

Before opening Auto-TSTM, create a normal forecast workspace:

1. Start or load a forecast cycle.
2. Pan and zoom to the area of interest.
3. Add at least one manual categorical or hazard area that should remain separate from Auto-TSTM.
4. Save or export a before screenshot if the tester can.

### Preview quality

1. Open **Tools**.
2. Open **Auto-TSTM** for **Day 1**.
3. Compare the previewed area against current forecast reasoning.
4. Check whether the preview location, size, and shape are plausible.
5. Check whether the preview styling is visibly separate from already-applied forecast geometry.
6. Close with **Cancel**.
7. Confirm the manual forecast work is unchanged.

Pass goals:

- Preview styling is understandable and does not look like committed forecast geometry.
- The preview does not obscure critical map context.
- Existing manual forecast areas remain unchanged after cancel.
- Any unavailable-data message is understandable and does not create Sentry-style technical noise for testers.

### Apply behavior

1. Reopen **Auto-TSTM** for **Day 1**.
2. Select **Apply**.
3. Confirm the applied TSTM area appears as committed forecast geometry.
4. Confirm existing manually drawn areas still exist.
5. Save the forecast, reload the page, and confirm the applied TSTM area persists if this workflow normally persists other drawn geometry for the tester.
6. Use undo and redo around the Auto-TSTM apply action.

Pass goals:

- Apply commits the guidance once.
- Apply does not duplicate geometry when the tester presses the action once.
- Manual geometry is preserved.
- Save, reload, undo, and redo behave the same way they do for normal drawing operations.

### Context switching

1. Open Auto-TSTM on **Day 1**.
2. While preview is loading or visible, switch forecast day if the UI allows it.
3. Return to **Day 1** and **Day 2**.
4. Confirm stale previews do not apply to the wrong day.
5. Repeat after changing map zoom or active forecast context.

Pass goals:

- Day 1 guidance does not apply to Day 2.
- Day 2 guidance does not apply to Day 1.
- Late-loading previews do not mutate the forecast after the tester has moved to another context.
- The panel can be reopened after switching contexts.

### Responsive layout

Run the core preview and apply flow on a phone-sized viewport:

1. Phone portrait.
2. Phone landscape.
3. A narrow desktop window, if possible.

Pass goals:

- Navbar does not overflow.
- The map remains visible.
- Bottom toolbar tabs are reachable.
- Tools and Auto-TSTM controls are reachable without awkward two-direction scrolling.
- Floating map controls do not collide with the Auto-TSTM panel, legend, credits, or warning badge.
- Touch targets are large enough to use confidently.

## Optional operator check

This section is for maintainers, not general beta testers.

Use the public beta API to confirm cached guidance health before sending testers into the feature:

```sh
curl https://beta-gfc.weatherboysuper.com/api/capabilities/status
curl "https://beta-gfc.weatherboysuper.com/api/tstm/status"
curl "https://beta-gfc.weatherboysuper.com/api/tstm/latest?day=1&period=full"
curl "https://beta-gfc.weatherboysuper.com/api/tstm/latest?day=2&period=full"
```

Expected result:

- Capabilities report Auto-TSTM available on beta.
- Status reports Day 1 and Day 2 cache availability or a clear public-safe reason.
- Latest responses return GeoJSON-like feature payloads when cache is available.
- Disabled, stale, missing, or unavailable states return public-safe error messages without internal paths, stack traces, or stderr.

## Triage labels

Suggested labels when filing tester findings:

- `Component: Forecast`
- `Component: Map`
- `Component: UI`
- `quality`
- `e2e-validated` only after a maintainer reproduces and verifies a fix

Use the highest severity that matches the impact:

- **Blocking:** crash, blank map, data loss, wrong-day apply, or Apply/Cancel mutating the wrong state.
- **High:** mobile workflow cannot be completed, Auto-TSTM unavailable when expected, or saved forecast state is wrong.
- **Medium:** confusing preview state, poor generated shape quality, duplicate geometry, or undo/redo inconsistency.
- **Low:** copy, styling, or minor layout polish that does not block testing.

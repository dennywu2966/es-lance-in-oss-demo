# Demo UI Theme Switch Design

## Goal
- Default the Demo UI visual language to an Aliyun-style theme.
- Provide a runtime switch to Kibana 9.x style.
- Keep search/vector/dataset behavior unchanged.

## Scope
- Styling system only:
  - Add global UI theme tokens (Aliyun + Kibana).
  - Add UI theme state and persistence.
  - Add a small switch control for users.
- No backend/API/schema changes.
- No changes to search logic or routing.

## Architecture
- Add `UiThemeProvider` in root layout:
  - Reads persisted theme from `localStorage`.
  - Applies `data-ui-theme` on `<html>`.
  - Exposes `theme` + `setTheme` via React context.
- Add `UiThemeSwitcher`:
  - Fixed top-right, always visible.
  - Two options: `Aliyun` and `Kibana 9.x`.
- Move core color behavior to CSS variables:
  - Theme token sets selected via `[data-ui-theme=...]`.
  - Existing semantic helper classes (`glass-card`, gradients, grid, markdown colors) consume tokens.
  - Compatibility overrides added for commonly used utility classes in light mode.

## Safety / No Regression Strategy
- TDD for theme utility behavior:
  - default fallback
  - localStorage read/write
  - DOM attribute apply
- UI switch interaction test:
  - default theme is Aliyun
  - switching updates DOM attribute and persistence
- Run lint + unit tests + full regression script.
- Playwright screenshot verification for visual result.

## Acceptance Criteria
- App boots with Aliyun-like light visual style by default.
- User can switch to Kibana 9.x style from UI control.
- Refresh keeps last selected theme.
- Existing functional tests pass without regression.

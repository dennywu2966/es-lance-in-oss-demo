# Branding + IA + I18N Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reframe the demo as a productized experience with stronger branding, clear audience/value messaging, and separated information architecture while preserving core demo flows and avoiding regressions.

**Architecture:** Keep existing search/vector APIs and core interactive components intact, but reorganize presentation into distinct pages: concise home, core flow page, and extended value/marketing page. Add bilingual page variants (`/zh/*`) and keep theme system global with a corrected Kibana 9.x light theme.

**Tech Stack:** Next.js App Router, React client/server components, existing feature modules (`features/vector-mgmt`, `features/live-demo`), Tailwind/CSS tokens, Jest tests, existing regression suites.

---

### Task 1: Theme Correction (Kibana 9.x Light)

**Files:**
- Modify: `app/globals.css`

**Steps:**
1. Update `:root[data-ui-theme='kibana']` design tokens to a Kibana-like light palette.
2. Ensure compatibility overrides for legacy utility classes (`text-white`, translucent white backgrounds, borders) also apply in Kibana light mode.
3. Keep switch labels and storage behavior unchanged so existing theme tests continue to pass.

### Task 2: New Information Architecture

**Files:**
- Modify: `app/page.tsx`
- Create: `app/core-flow/page.tsx`
- Create: `app/solutions/page.tsx`
- Create: `app/zh/page.tsx`
- Create: `app/zh/core-flow/page.tsx`
- Create: `app/zh/solutions/page.tsx`
- Create: `components/site/site-nav.tsx`
- Create: `components/site/site-footer.tsx`

**Steps:**
1. Replace current long-scroll home with concise, conversion-oriented summary sections.
2. Add `/core-flow` page containing the core product flow (dataset generation/management + live demo).
3. Add `/solutions` page for non-core showcase (audience, scenarios, lighthouse cases, rollout/TTV).
4. Add Chinese page variants for home/core-flow/solutions with localized copy and mirrored navigation.
5. Reuse existing core components instead of rewriting their behavior.

### Task 3: Branding Content + Sales Methodology Doc

**Files:**
- Create: `docs/branding-saling-strategies.md`

**Steps:**
1. Document target audiences, scenario mapping, value proposition, TTV (time-to-value) methods, lighthouse case framework.
2. Add practical campaign/enablement guidance (positioning, proof assets, demo script, objection handling, rollout metrics).
3. Align docs language with implemented page structure.

### Task 4: Remove/De-emphasize Redundant Non-Core Surfaces

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/solutions/page.tsx`

**Steps:**
1. Remove non-core heavy sections from home.
2. Keep only value-critical showcase content on `/solutions`.
3. Avoid dead code in active routes by removing unused imports/render paths.

### Task 5: Tests + Regression Verification

**Files:**
- Create: `tests/site-navigation.test.tsx`
- Create: `tests/kibana-theme-light.test.ts`
- Possibly update: existing theme tests only if labels/interfaces intentionally changed.

**Steps:**
1. Add tests for new nav IA and language links.
2. Add tests asserting Kibana theme is configured as light (token-level contract).
3. Run existing UI/theme/api tests.
4. Run stack restart through `starter_project.sh`, then run full and comprehensive regression suites.


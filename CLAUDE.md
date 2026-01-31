# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js marketing/demo website for the Lance Vector Plugin for Elasticsearch - a production-ready vector search solution using Lance datasets stored in Alibaba Cloud OSS with memory-safe operations (256MB cap).

**Key Technologies:**
- Next.js 16 with App Router (TypeScript, React 19)
- Tailwind CSS v4 + Framer Motion for animations
- Alibaba Cloud OSS (ali-oss) for Lance dataset storage
- Server-side Python execution for Lance dataset generation

## Canonical Commands

```bash
# Development
npm run dev          # Start dev server on localhost:3000

# Build & Production
npm run build        # Build for production (TypeScript errors ignored)
npm start            # Start production server

# Code Quality
npm run lint         # Run ESLint via next lint
```

**Note:** `next.config.ts` has `typescript.ignoreBuildErrors: true` - TypeScript errors will not block builds.

## Architecture

### Directory Structure
```
app/                 # Next.js App Router
  layout.tsx         # Root layout (dark mode, metadata)
  page.tsx           # Homepage with all sections
  globals.css        # Tailwind + custom styles
  api/
    search/          # kNN search proxy to Elasticsearch
    vectors/         # Vector dataset management (list/generate/delete/fetch)
components/          # React UI components (section-based)
lib/
  oss-client.ts      # Alibaba Cloud OSS integration + Python Lance generation
  utils.ts           # Helper functions (cn, vector generation, formatting)
  data.ts            # Static content (validation phases, metrics, code examples)
  animations.ts      # Framer Motion variants
```

### Key Architectural Patterns

1. **Component Composition**: Homepage (`app/page.tsx`) is composed of section components (`Hero`, `Architecture`, `ValidationTimeline`, `PerformanceDashboard`, `VectorManagement`, `LiveDemo`, etc.)

2. **API Routes**: Server Actions at `app/api/*/route.ts` handle:
   - Vector dataset generation (spawns Python process for Lance)
   - kNN search queries proxied to Elasticsearch
   - OSS dataset listing/deletion

3. **OSS Client** (`lib/oss-client.ts`):
   - Uses `ali-oss` SDK for Alibaba Cloud Object Storage
   - Spawns Python child process to generate Lance datasets with numpy/lance
   - Manages temporary files in `/tmp/lance-gen-*`
   - Cleans up temp directories after upload or on error

4. **Styling**: Uses Tailwind CSS v4 `@theme` directive (not v3 `theme.extend`) with custom CSS classes like `.glass-card`, `.gradient-text`

## Important Constraints

### Security Warning
**`lib/oss-client.ts` contains hardcoded credentials!** Lines 12-14 have real Alibaba Cloud access keys. Never commit changes that expose additional secrets.

### Python Dependencies
Dataset generation requires system Python with:
- numpy
- lance
- pyarrow

The Python script embedded in `oss-client.ts` (lines 116-174) clears proxy env vars before importing libraries.

### Elasticsearch Integration
Demo expects Elasticsearch at `http://localhost:9200` (configurable in `app/api/search/route.ts`).

**ES Configuration:**
- Location: `../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT`
- Authentication: `elastic:mdNf7J+HVTB33syeww7i` (HTTP Basic Auth) - **Note: Password auto-regenerates on ES restart**
- Plugins: `lance-vector`, `security-realm-cloud-iam`
- Security enabled with trial license
- HTTP SSL disabled for development

**To reset ES password:**
```bash
cd ../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
./bin/elasticsearch-reset-password -u elastic -b
```

**To start ES:**
```bash
cd ../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
./start_es_with_plugins.sh -d -p elasticsearch.pid
```

**OSS Configuration:**
- Bucket: `denny-test-lance`
- Endpoint: `oss-ap-southeast-1.aliyuncs.com`
- Credentials: `~/.oss/credentials.json`

### TypeScript Configuration
- Path aliases: `@/*` maps to project root
- Strict mode enabled
- Build ignores TypeScript errors (see `next.config.ts`)

## Validation & Testing

For comprehensive E2E validation, API tests, and UI smoke tests, see:
- **Validation Guide:** `reg_validation_guide.md` - Complete testing procedures with Playwright MCP examples
- **Validation Script:** `/lance-demo-validation` skill - Automated validation via Python script

## Development Notes

- Dark mode is forced (`<html lang="en" className="dark">` in `app/layout.tsx`)
- All animations use Framer Motion - variants defined in `lib/animations.ts`
- Glass morphism UI pattern heavily used (`.glass-card`)
- No test framework configured
- No CI/CD configuration present

### Testing with Playwright MCP

**IMPORTANT: This is an Ubuntu server without X11. Always use headless mode for Playwright.**

**Prefer using the Playwright MCP server** over native Playwright:
- Use `mcp__playwright__browser_*` tools for browser automation
- Playwright MCP automatically handles headless mode on Ubuntu
- For manual Playwright testing, use `chromium.launch({ headless: true })`

**Playwright MCP Examples:**
```bash
# Navigate to page
mcp__playwright__browser_navigate?url=http://localhost:3000

# Take snapshot
mcp__playwright__browser_snapshot

# Fill form
mcp__playwright__browser_type?ref=...&text=...

# Click button
mcp__playwright__browser_click?ref=...
```

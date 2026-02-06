# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js marketing/demo website for the Lance Vector Plugin for Elasticsearch - a production-ready vector search solution using Lance datasets stored in Alibaba Cloud OSS with memory-safe operations (256MB cap).

**Refactored to Feature-Sliced Design (FSD):**
- **Frontend:** Next.js 16 with FSD architecture (entities/features/shared layers)
- **Backend:** Python FastAPI service for dataset generation
- **Direct ES:** Search queries go directly to Elasticsearch for Lance plugin performance testing

**Key Technologies:**
- Next.js 16 with App Router (TypeScript, React 19)
- Python FastAPI for backend services
- Tailwind CSS v4 + Framer Motion for animations
- Alibaba Cloud OSS (ali-oss) for Lance dataset storage
- Elasticsearch with Lance Vector Plugin

## Canonical Commands

```bash
# Development - Full Stack
npm run dev          # Start Next.js on localhost:3000
python3 backend/main.py  # Start Python backend on localhost:8000

# Start with helper script
./starter_project.sh  # Starts ES + Next.js + Python backend

# Build & Production
npm run build        # Build for production (TypeScript errors ignored)
npm start            # Start production server

# Python Backend
cd backend && pip install -r requirements.txt  # Install Python deps
python3 main.py      # Start FastAPI server

# Code Quality
npm run lint         # Run ESLint via next lint
```

**Note:** `next.config.ts` has `typescript.ignoreBuildErrors: true` - TypeScript errors will not block builds.

## Architecture (FSD)

### Directory Structure
```
├── app/                     # Next.js App Router
│   ├── layout.tsx           # Root layout (dark mode, metadata)
│   ├── page.tsx             # Homepage (thin orchestrator)
│   ├── globals.css          # Tailwind + custom styles
│   └── api/                # Legacy API routes (deprecated, use Python backend)
│
├── entities/                # FSD Entities - Business Domain
│   └── search/
│       ├── model/           # Types, interfaces, ES config
│       └── api/             # Direct ES client (bypasses Next.js API)
│           └── es-client.ts
│
├── features/                # FSD Features - UI Features
│   ├── live-demo/           # Live kNN/hybrid search demo
│   │   ├── ui/             # React components (refactored from monolith)
│   │   └── index.ts
│   └── vector-mgmt/        # Dataset management UI
│       ├── ui/             # Vector management component
│       ├── api/            # Python backend client (with SSE)
│       └── index.ts
│
├── shared/                  # FSD Shared - Cross-cutting
│   ├── ui/                 # Reusable UI components (hero, architecture, etc.)
│   ├── lib/                # Utilities (animations, utils, data)
│   └── config/             # Shared configuration
│
└── backend/                # NEW: Python FastAPI Service
    ├── main.py             # FastAPI app entry point
    ├── config.py           # OSS config from ~/.oss/credentials.json
    ├── requirements.txt    # Python dependencies
    ├── routes/
    │   └── dataset.py      # Dataset generation endpoints
    └── services/
        ├── oss.py          # OSS client (with ~/.oss/ credentials.json)
        ├── embedding.py    # Jina API wrapper
        ├── lance.py        # Lance dataset creation
        └── job_queue.py    # Background job queue with SSE
```

### Key Architectural Changes (Post-FSD Refactoring)

1. **Python FastAPI Backend (`/backend`):**
   - Handles dataset generation (GLM → Jina → Lance → OSS)
   - Uses background jobs with SSE streaming for progress
   - Reads OSS credentials from `~/.oss/credentials.json` (consistent with frontend)

2. **Direct ES Client (`entities/search/api/es-client.ts`):**
   - Bypasses Next.js API routes for performance testing
   - Direct kNN and hybrid search queries to ES
   - RRF fusion for hybrid search (BM25 + Lance kNN)

3. **Feature-Sliced Design:**
   - `entities/` - Business domain types and APIs
   - `features/` - UI features with self-contained logic
   - `shared/` - Cross-cutting utilities and components

4. **Deprecated (but kept for compatibility):**
   - `app/api/vectors/generate` - Use Python backend `/api/v1/dataset/generate` instead
   - `app/api/search/*` - Use direct ES client instead

## Important Constraints

### OSS Credentials (Consistent Across Services)

**All services read from `~/.oss/credentials.json`:**
- Python FastAPI backend: `backend/config.py` → `load_oss_config()`
- Next.js frontend: `lib/oss-client.ts` → `getOSSConfig()`

**Format:**
```json
{
  "access_key_id": "YOUR_KEY",
  "access_key_secret": "YOUR_SECRET",
  "endpoint": "oss-ap-southeast-1.aliyuncs.com",
  "region": "oss-ap-southeast-1",
  "bucket_name": "denny-test-lance"
}
```

### Python Backend Dependencies

Dataset generation requires:
- `fastapi`, `uvicorn` - Web framework
- `oss2` - Alibaba Cloud OSS SDK
- `lance`, `pyarrow`, `numpy` - Lance dataset operations
- `httpx` - Async HTTP for Jina API

Install with:
```bash
cd backend && pip install -r requirements.txt
```

### Elasticsearch Integration

**Direct ES Connection (bypassing Next.js API):**
- Location: `https://127.0.0.1:9200` (localhost only)
- Authentication: `elastic:Summer11` (HTTP Basic Auth)
- **Note:** Password auto-regenerates on ES restart

**ES Configuration:**
- Location: `../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT`
- Plugins: `lance-vector`, `security-realm-cloud-iam`
- Security enabled with trial license

**To reset ES password:**
```bash
cd ../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
./bin/elasticsearch-reset-password -u elastic -b
```

**To start ES:**
```bash
cd ../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT

# Set OSS env vars and start (Singapore region)
export OSS_ACCESS_KEY_ID="YOUR_KEY"
export OSS_ACCESS_KEY_SECRET="YOUR_SECRET"
export OSS_REGION="oss-ap-southeast-1"
export OSS_ENDPOINT="oss-ap-southeast-1.aliyuncs.com"
export OSS_BUCKET="denny-test-lance"

./start_es_with_plugins.sh -d -p elasticsearch.pid
```

### TypeScript Path Aliases

- `@/*` maps to project root
- `@/entities/*` maps to `entities/`
- `@/features/*` maps to `features/`
- `@/shared/*` maps to `shared/`

## API Endpoints

### Python FastAPI Backend (Port 8000)

```bash
# Health check
curl http://localhost:8000/health

# List datasets
curl http://localhost:8000/api/v1/datasets

# Generate dataset (returns job_id)
curl -X POST http://localhost:8000/api/v1/dataset/generate \
  -H "Content-Type: application/json" \
  -d '{"vectors": 100, "dims": 768}'

# Get job status
curl http://localhost:8000/api/v1/dataset/status/{job_id}

# Stream job progress (SSE)
curl http://localhost:8000/api/v1/dataset/stream/{job_id}

# Delete dataset
curl -X DELETE http://localhost:8000/api/v1/dataset/{dataset_name}
```

### Direct Elasticsearch (Port 9200)

```bash
# kNN search (via Lance plugin)
curl -k -u elastic:Summer11 \
  -X POST https://127.0.0.1:9200/lance-validation-test/_search \
  -H "Content-Type: application/json" \
  -d '{
    "profile": true,
    "query": {
      "lance_knn": {
        "field": "embedding",
        "query_vector": [0.1, 0.2, ...],
        "k": 5,
        "num_candidates": 10
      }
    },
    "size": 5
  }'

# Hybrid search (BM25 + Lance kNN)
# Client performs: 1) BM25 text search, 2) Lance kNN, 3) RRF fusion
```

## Validation & Testing

For comprehensive E2E validation, API tests, and UI smoke tests, see:
- **Validation Guide:** `reg_validation_guide.md` - Complete testing procedures with Playwright MCP examples
- **Validation Script:** `/lance-demo-validation` skill - Automated validation via Python script

### Quick Regression Tests

```bash
# 1. Start services
./starter_project.sh

# 2. Test Python backend
curl http://localhost:8000/health

# 3. Test ES connection
curl -s -k -u elastic:Summer11 https://127.0.0.1:9200/_cluster/health

# 4. Test Next.js
curl -s http://localhost:3000

# 5. Run Playwright MCP tests
# (See reg_validation_guide.md for detailed procedures)
```

## Development Notes

- **Dark mode:** Forced (`<html lang="en" className="dark">` in `app/layout.tsx`)
- **Animations:** Framer Motion - variants in `shared/lib/animations.ts`
- **Styling:** Tailwind CSS v4 with `.glass-card`, `.gradient-text` patterns
- **FSD Rules:**
  - Entities can import from shared and other entities
  - Features can import from entities and shared
  - Shared cannot import from entities or features (circular dependency prevention)

### Testing with Playwright MCP

**IMPORTANT: This is an Ubuntu server without X11. Always use headless mode for Playwright.**

**Playwright MCP Examples:**
```bash
# Navigate to page
mcp__playwright__browser_navigate?url=http://localhost:3000

# Take snapshot
mcp__playwright__browser_snapshot

# Fill form and click
mcp__playwright__browser_type?ref=...&text=...
mcp__playwright__browser_click?ref=...
```

### Frontend Development

When modifying features:
1. Keep components within their feature directory
2. Use entities for business logic/types
3. Use shared for reusable utilities
4. Import from `@/entities/*` for search types and ES client
5. Import from `@/shared/lib/*` for animations and utilities

### Backend Development

When modifying Python backend:
1. OSS credentials loaded from `~/.oss/credentials.json` via `config.py`
2. All heavy operations (dataset generation) run in background jobs
3. Use SSE streaming for progress updates
4. Cleanup temp files after operations

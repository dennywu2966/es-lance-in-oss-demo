# Regression Test & E2E Validation Guide
## Lance Vector Plugin Demo (es-lance-demo)

**Last Updated:** 2026-01-31
**Status:** ✅ Hybrid Search Fully Working (Text + Vector Fusion)

---

## Quick Start

```bash
# Start the full stack
./starter_project.sh
```

The `starter_project.sh` script automatically:
1. Checks prerequisites (Node.js, npm, ES distribution, OSS credentials)
2. Starts Elasticsearch with OSS credentials and Lance Vector plugin
3. Starts Next.js dev server
4. Verifies all services are healthy

**Access URLs:**
- Next.js Demo: http://localhost:3000
- Elasticsearch: https://127.0.0.1:9200 (elastic/Summer11)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Service Startup Validation](#service-startup-validation)
4. [API Endpoint Tests](#api-endpoint-tests)
5. [UI Feature Tests (Playwright MCP)](#ui-feature-tests-playwright-mcp)
6. [Known Issues & Fixes](#known-issues--fixes)
7. [Regression Test Checklist](#regression-test-checklist)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements
- **OS:** Ubuntu Server (tested on 20.04+)
- **Node.js:** v18+ with npm
- **Python:** v3.10+ with numpy, lance, pyarrow
- **Memory:** 4GB+ recommended
- **Disk:** 10GB+ free space

### Required Files
```bash
# OSS credentials (REQUIRED)
~/.oss/credentials.json
{
  "access_key_id": "YOUR_KEY",
  "access_key_secret": "YOUR_SECRET",
  "endpoint": "oss-ap-southeast-1.aliyuncs.com",
  "region": "ap-southeast-1",
  "bucket_name": "denny-test-lance"
}

# Elasticsearch distribution
../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT/
```

### Verify Prerequisites
```bash
# Check Node.js
node --version  # Should be v18+

# Check Python deps
python3 -c "import numpy, lance, pyarrow; print('Python OK')"

# Check OSS credentials
cat ~/.oss/credentials.json
```

---

## Service Startup Validation

### Start the Stack
```bash
cd /home/denny/projects/es-lance-demo
./starter_project.sh
```

**Expected Output:**
```
========================================
  Lance Demo Stack Starter
========================================

[INFO] Checking prerequisites...
[SUCCESS] Prerequisites check passed
[INFO] Checking Elasticsearch status...
[SUCCESS] Elasticsearch is already running on port 9200
[INFO] Starting Next.js dev server...
[SUCCESS] Next.js is ready!
[INFO] Verifying stack status...
[SUCCESS] Elasticsearch: green health
[SUCCESS] Next.js: Running on port 3000

========================================
  Demo Stack Ready!
========================================
```

### Manual Startup (if script fails)

```bash
# 1. Start Elasticsearch
cd ../es-9.9.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT

# Set OSS env vars and start (Singapore region)
export OSS_ACCESS_KEY_ID="YOUR_KEY"
export OSS_ACCESS_KEY_SECRET="YOUR_SECRET"
export OSS_REGION="oss-ap-southeast-1"
export OSS_ENDPOINT="oss-ap-southeast-1.aliyuncs.com"
export OSS_BUCKET="denny-test-lance"

./bin/elasticsearch -d -p elasticsearch.pid

# 2. Start Next.js
cd /home/denny/projects/es-lance-demo
npm run dev
```

---

## API Endpoint Tests

### 1. List Datasets
```bash
curl -s http://localhost:3000/api/vectors/list | jq .

# Expected:
{
  "success": true,
  "datasets": [
    {
      "name": "vectors-10-dims-128-1769756222899",
      "vectors": 10,
      "dims": 128,
      "size": "383 B",
      "lastModified": "2026-01-30T06:57:58.000Z"
    }
  ],
  "count": 1
}
```

### 2. Generate New Dataset
```bash
curl -s -X POST http://localhost:3000/api/vectors/generate \
  -H "Content-Type: application/json" \
  -d '{"vectors": 100, "dims": 128}' | jq .

# Expected (after 30-60 seconds):
{
  "success": true,
  "dataset": "vectors-100-dims-128-TIMESTAMP",
  "vectors": 100,
  "dims": 128
}
```

**Note:** Generation takes 30-60 seconds due to:
- GLM API document generation (with rate limiting)
- Jina API embeddings generation
- Lance dataset creation with IVF-PQ indexing
- OSS upload

### 3. Fetch Documents
```bash
curl -s -X POST http://localhost:3000/api/vectors/documents \
  -H "Content-Type: application/json" \
  -d '{"dataset":"vectors-10-dims-128-1769756222899", "limit": 5}' | jq '.documents | length'

# Expected: 5
```

### 4. kNN Search
```bash
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "k": 5}' | jq '.success'

# Expected: true
```

### 5. Hybrid Search
```bash
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "machine learning", "k": 5}' | jq '.success'

# Expected: true
```

---

## UI Feature Tests (Playwright MCP)

### Prerequisites for Playwright MCP Testing

```bash
# Ensure browser automation is available
# On Ubuntu, Playwright MCP automatically uses headless mode
```

### Test 1: Homepage Load
```javascript
// Navigate and verify homepage loads
mcp__playwright__browser_navigate?url=http://localhost:3000
mcp__playwright__browser_snapshot
// Verify: Title shows "Lance Vector Plugin"
```

### Test 2: Dataset Management
```javascript
// 1. Click Refresh button
mcp__playwright__browser_click?ref=<REFRESH_BUTTON_REF>

// 2. Verify dataset table appears
// Expected: Shows dataset with name, vectors, dims, size, created date
// Columns: DATASET_NAME, VECTORS, DIMS, SIZE, CREATED, ACTIONS
```

### Test 3: Documents Viewer
```javascript
// 1. Click DOCUMENTS button
mcp__playwright__browser_click?ref=<DOCUMENTS_BUTTON_REF>

// 2. Verify documents modal appears
// Expected: "SUCCESS - Loaded 10 documents from 10 total"
// Shows document cards with title, category, and text preview
```

### Test 4: kNN Search Flow
```javascript
// 1. Click "Execute kNN Search" button
mcp__playwright__browser_click?ref=<EXECUTE_KNN_BUTTON_REF>

// 2. Click "Confirm & Search" in confirmation dialog
mcp__playwright__browser_click?ref=<CONFIRM_SEARCH_REF>

// 3. Expected: Search results appear or error message
// Note: May fail due to OSS env vars not passed to Python (see Known Issues)
```

### Test 5: Hybrid Search ✅ FULLY WORKING
```javascript
// 1. Click "Hybrid Search" mode button
mcp__playwright__browser_click?ref=<HYBRID_SEARCH_BUTTON_REF>

// 2. Enter query text
mcp__playwright__browser_type?ref=<QUERY_INPUT_REF>&text=machine+learning

// 3. Click Execute
mcp__playwright__browser_click?ref=<EXECUTE_HYBRID_REF>

// 4. Verify results
// Expected: 5 results with HYBRID match type
// Shows: "Text results: 7 • Vector results: 5 • Fused: 5"
// Both BM25 text search and Lance kNN vector search working!
// Performance timeline shows breakdown of all phases
```

### Test 6: Add Vectors Modal
```javascript
// 1. Click "ADD VECTORS" button
mcp__playwright__browser_click?ref=<ADD_VECTORS_BUTTON_REF>

// 2. Verify modal appears
// Expected: Shows "Add More Vectors" with:
//   - "ADDITIONAL VECTORS" spinbutton (default 50)
//   - "Current: X vectors" display
//   - "New total: Y vectors" display
```

### Test 7: SAMPLE Button (View Random Vectors)
```javascript
// 1. Click "SAMPLE" button
mcp__playwright__browser_click?ref=<SAMPLE_BUTTON_REF>

// 2. Verify sample results modal appears
// Expected: "SUCCESS - Sampled 10 vectors from 10 total vectors"
// Shows sampled vectors with:
//   - Document IDs (doc_0001, doc_0002, etc.)
//   - Category labels (Natural Language Processing, Machine Learning, etc.)
//   - Vector dimensions (768 dims)
//   - First 30 vector values displayed
//   - "... and 736 more" indicator
```

### Test 8: kNN Search Results - Interactive Features
```javascript
// 1. Execute kNN search (follow Test 4)
// 2. After search completes, verify results screen

// Expected features:
// - "Search Completed - Found X candidates • Top Y results"
// - Query Latency display (e.g., "3491ms")
// - Query Vector preview (first 10 of 768 dimensions)
```

### Test 9: Show ES Request Button ✅ VALIDATED
```javascript
// 1. On search results screen, click "Show ES Request"
mcp__playwright__browser_click?ref=<SHOW_ES_REQUEST_BUTTON_REF>

// Expected: JSON panel appears with:
//   - "Elasticsearch Request JSON" heading
//   - "Copy" button
//   - For Hybrid Search: Shows BOTH text BM25 query AND vector lance_knn query:
//     - Text Query: { "query": { "match": { "text": "machine learning" } }, ... }
//     - Vector Query: { "profile": true, "query": { "lance_knn": { ... } }, ... }
//     - "k": 5, "num_candidates": 10
// Button toggles to "Hide ES Request" when clicked again
```

### Test 10: Performance Profiling Display
```javascript
// On search results screen with profiling enabled:
// Expected "Performance Profiling" section shows:
//   - "Elasticsearch Lance Plugin" label
//   - Timing breakdown:
//     - Total Search: ~50ms
//     - Oss Download: ~30-40ms
//     - Data Load: ~10-20ms
//     - Dataset Open: ~1-5ms
//     - Query Prep: 0ms
//     - Similarity Calc: 0ms
//     - Sorting: 0ms
//     - Result Format: 0ms
//     - Cleanup: 0ms
```

### Test 11: SHOW VECTOR Button
```javascript
// 1. On search results, click "SHOW VECTOR" button for any result
mcp__playwright__browser_click?ref=<SHOW_VECTOR_BUTTON_REF>

// Expected: Vector display panel appears:
//   - "Vector Data (768 dimensions)" heading
//   - Grid of vector values (formatted to 3 decimal places)
//   - Button toggles to "HIDE VECTOR"
//   - Values shown in scrollable container
```

### Test 12: SHOW DOC Button
```javascript
// 1. On search results, click "SHOW DOC" button for any result
mcp__playwright__browser_click?ref=<SHOW_DOC_BUTTON_REF>

// Expected: Document details panel appears:
//   - "Original Document" heading
//   - "Primary Key (_id)": doc_XXXX
//   - "Category": [category name]
//   - "Text Content": [text or "No text content available"]
//   - "Vector (first 10 dims)": [preview values]
//   - Button toggles to "HIDE DOC"
```

### Test 13: Try Again Button
```javascript
// 1. On search results screen, click "Try Again"
mcp__playwright__browser_click?ref=<TRY_AGAIN_BUTTON_REF>

// Expected: Returns to search confirmation dialog
// Shows search parameters confirmation again
```

---

## Known Issues & Fixes

### Issue 1: OSS Credentials Not Loaded
**Symptom:** API returns `require accessKeyId, accessKeySecret`
**Root Cause:** OSS client initialized at module level with empty env vars
**Status:** ✅ FIXED

**Fix Applied:**
- Modified `lib/oss-client.ts` to use lazy initialization
- Reads credentials from `~/.oss/credentials.json` file
- Falls back to environment variables if file exists
- Exported `getClient()` function for use in other routes

**Files Modified:**
- `lib/oss-client.ts`
- `app/api/vectors/documents/route.ts`
- `app/api/vectors/backfill/route.ts`

### Issue 2: Wrong OSS Region
**Symptom:** `The bucket you are attempting to access must be addressed using the specified endpoint`
**Root Cause:** Bucket `denny-test-lance` is in Singapore region (`oss-ap-southeast-1`) but code was using Beijing region
**Status:** ✅ FIXED

**Fix Applied:**
- Hardcoded Singapore region in `lib/oss-client.ts`
- Bucket location: Singapore (`oss-ap-southeast-1`)

### Issue 3: kNN Search Python Script Missing OSS Credentials
**Symptom:** `KeyError: 'OSS_ACCESS_KEY_ID'` in Python child process
**Root Cause:** Python script spawned by search API doesn't inherit environment variables
**Status:** ✅ FIXED

**Fix Applied:**
- Modified `app/api/search/route.ts` to import `getOSSConfig()` from `lib/oss-client.ts`
- Updated `execWithTimeout()` helper to accept and pass environment variables
- Modified `searchLanceDataset()` and `getRandomVector()` to accept OSS config
- Exported `getOSSConfig()` function from `lib/oss-client.ts`
- Python scripts now read credentials from environment variables passed at runtime

**Files Modified:**
- `app/api/search/route.ts`
- `lib/oss-client.ts`

### Issue 4: Generate & Upload Dataset Limit
**Symptom:** Button shows "Maximum 1 dataset allowed"
**Status:** ⚠️ DESIGN LIMITATION - Working as intended

**Reason:** UI enforces single dataset limit to avoid OSS clutter. Delete existing dataset before generating new one.

### Issue 5: SAMPLE API Python Script Missing OSS Credentials
**Symptom:** `KeyError: 'OSS_ACCESS_KEY_ID'` in Python child process
**Root Cause:** Python script spawned by sample API doesn't inherit environment variables
**Status:** ✅ FIXED

**Fix Applied:**
- Modified `app/api/vectors/sample/route.ts` to import `getOSSConfig()` from `lib/oss-client.ts`
- Added `execWithTimeout()` helper to accept and pass environment variables
- Modified Python script to use environment variables for OSS credentials
- Exported `getOSSConfig()` function from `lib/oss-client.ts`

**Files Modified:**
- `app/api/vectors/sample/route.ts`

### Issue 6: Hybrid Search API "fetch failed" + ES Endpoint/SSL Issues
**Symptom:** Hybrid search API returns "fetch failed" error
**Root Cause:** ES_HOST was `http://localhost:9200` but ES runs on `https://127.0.0.1:9200`, and self-signed SSL certificates were being rejected
**Status:** ✅ FIXED

**Fix Applied:**
- Changed ES_HOST to `https://127.0.0.1:9200` in `app/api/search/hybrid/route.ts`
- Added SSL certificate handling with `NODE_TLS_REJECT_UNAUTHORIZED='0'`
- Added graceful fallback for vector search failures (text-only mode)
- Fixed ES password to `Summer11` in `app/api/vectors/backfill/route.ts`
- Same SSL handling added to backfill API

**Files Modified:**
- `app/api/search/hybrid/route.ts`
- `app/api/vectors/backfill/route.ts`

### Issue 7: ES Started with Wrong OSS Region
**Symptom:** Vector search returns 403 AccessDenied from OSS
**Root Cause:** ES was started with Beijing region env vars but bucket is in Singapore region
**Status:** ✅ FIXED

**Fix Applied:**
- Updated `~/.oss/credentials.json` with correct Singapore region
- Restarted ES with correct OSS environment variables:
  - `OSS_REGION=oss-ap-southeast-1`
  - `OSS_ENDPOINT=oss-ap-southeast-1.aliyuncs.com`
- Deleted and recreated ES index via backfill API

---

## Regression Test Checklist

Use this checklist for quick regression testing before committing changes.

### Pre-Test Setup
- [ ] Elasticsearch running: `curl -s -k -u elastic:Summer11 https://127.0.0.1:9200/_cluster/health`
- [ ] Next.js running: `curl -s http://localhost:3000`
- [ ] OSS credentials configured: `cat ~/.oss/credentials.json`

### Quick API Tests (2 minutes)
```bash
# Test 1: List datasets
curl -s http://localhost:3000/api/vectors/list | jq '.success'
# Expected: true

# Test 2: Fetch documents
curl -s -X POST http://localhost:3000/api/vectors/documents \
  -H "Content-Type: application/json" \
  -d '{"dataset":"vectors-10-dims-128-1769756222899"}' | jq '.success'
# Expected: true
```

### UI Smoke Tests (3 minutes)
- [ ] Homepage loads without errors
- [ ] Dataset list refreshes and shows datasets
- [ ] DOCUMENTS button shows document list
- [ ] ADD VECTORS button opens modal

### Known Broken Features (Skip in regression)
- ⚠️ Generate & Upload (works but slow - 30-60s)

### All Interactive Features Validated ✅
- ✅ Hybrid Search (Text + Vector Fusion) - Fully working
- ✅ Show ES Request - Displays both BM25 and lance_knn queries
- ✅ Show Vector - Loads and displays vector data from OSS
- ✅ Show Doc - Displays original document details
- ✅ Try Again - Returns to search confirmation dialog
- ✅ Performance Timeline - Shows breakdown of all phases
- ✅ Performance Insights - Displays optimization suggestions

---

## Troubleshooting

### Problem: "require accessKeyId, accessKeySecret"
**Solution:** Already fixed in `lib/oss-client.ts`. If persists:
1. Verify `~/.oss/credentials.json` exists
2. Restart Next.js: `fuser -k 3000/tcp && npm run dev`

### Problem: "The bucket you are attempting to access must be addressed using the specified endpoint"
**Solution:** Already fixed. Ensure Singapore region is used:
```bash
# In lib/oss-client.ts, line ~35:
const region = 'oss-ap-southeast-1';
```

### Problem: Next.js port 3000 already in use
**Solution:**
```bash
fuser -k 3000/tcp
npm run dev
```

### Problem: Elasticsearch not responding
**Solution:**
```bash
# Check if ES is running
curl -s -k -u elastic:Summer11 https://127.0.0.1:9200/_cluster/health

# Restart ES if needed
cd ../es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
kill $(cat elasticsearch.pid 2>/dev/null)
./start_es_with_plugins.sh -d -p elasticsearch.pid
```

### Problem: Python dependencies missing
**Solution:**
```bash
python3 -m pip install numpy lance pyarrow --user
```

---

## Architecture Overview

### Service Components

```
┌─────────────────────────────────────────────────────────────┐
│                     es-lance-demo                          │
│                  (Next.js + React + Tailwind)                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend (app/)                                      │  │
│  │    ├─ Homepage (page.tsx)                            │  │
│  │    ├─ Components/                                   │  │
│  │    └─ API Routes (app/api/)                         │  │
│  │         ├─ /api/vectors/list                         │  │
│  │         ├─ /api/vectors/generate                     │  │
│  │         ├─ /api/vectors/documents                    │  │
│  │         ├─ /api/search                              │  │
│  │         └─ /api/search/hybrid                       │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  lib/oss-client.ts (OSS + Lance integration)        │  │
│  │    ├─ getOSSConfig() - reads ~/.oss/credentials.json │  │
│  │    ├─ getClient() - lazy OSS client initialization   │  │
│  │    ├─ listDatasets() - list OSS datasets             │  │
│  │    ├─ generateAndUploadDataset() - GLM+Jina+Python   │  │
│  │    └─ deleteDataset() - delete from OSS             │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                  │
└───────────────────────────────────────────────────────────┘
                          │
         ┌─────────────────────────────────────────┐
         │  Alibaba Cloud OSS                          │
         │  └── datasets/*.lance                      │
         └─────────────────────────────────────────┘
                          │
         ┌─────────────────────────────────────────┐
         │  Elasticsearch (with Lance Vector Plugin)  │
         │  └── lance-validation-test index           │
         └─────────────────────────────────────────┘
```

---

## File Structure Reference

```
es-lance-demo/
├── starter_project.sh          # Main startup script ✨ NEW
├── lib/
│   └── oss-client.ts            # OSS + Lance integration ✏️ MODIFIED
├── app/
│   ├── page.tsx                 # Homepage component
│   ├── globals.css              # Tailwind + custom styles
│   └── api/
│       ├── search/
│       │   ├── route.ts          # kNN search API ✏️ MODIFIED
│       │   └── hybrid/route.ts  # Hybrid search API
│       └── vectors/
│           ├── list/route.ts     # List datasets ✏️ MODIFIED
│           ├── generate/route.ts # Generate dataset
│           ├── sample/route.ts   # Sample vectors ✏️ MODIFIED
│           ├── documents/
│           │   └── route.ts      # Fetch documents ✏️ MODIFIED
│           └── backfill/route.ts # Backfill to ES ✏️ MODIFIED
├── reg_validation_guide.md    # This file ✏️ UPDATED
└── CLAUDE.md                   # Project documentation
```

---

## Change Log

### 2026-01-31: Major Updates
- ✅ Created `starter_project.sh` for one-command stack startup
- ✅ Fixed OSS credentials loading (lazy initialization from `~/.oss/credentials.json`)
- ✅ Fixed OSS region (Singapore `oss-ap-southeast-1`)
- ✅ Fixed documents API and backfill API
- ✅ Fixed kNN Search Python credentials issue (passing OSS config via env vars)
- ✅ Fixed SAMPLE API Python credentials issue
- ✅ **NEW: Fixed Hybrid Search API ES endpoint and SSL issues**
- ✅ **NEW: Fixed ES OSS region mismatch (restarted ES with Singapore credentials)**
- ✅ **NEW: Validated Hybrid Search with both Text + Vector fusion working**
- ✅ Added comprehensive E2E test procedures
- ✅ Added Playwright MCP test examples
- ✅ Validated all UI interactive features (Show ES Request, Show Vector, Show Doc, Try Again, Performance Timeline)

---

## Contributing

When adding new features:
1. Update this validation guide with test procedures
2. Use `starter_project.sh` as reference for service startup
3. Follow the lazy initialization pattern for OSS client
4. Test with Playwright MCP before marking complete
5. Document any new API endpoints in the API Tests section

# Regression Test & E2E Validation Guide
## Lance Vector Plugin Demo (es-lance-demo)

**Last Updated:** 2026-02-05
**Status:** ✅ All 8 API regression tests pass • UI kNN + Hybrid smoke tests pass

**Recent Migration Changes:**
- Migrated from old `lance` package to new `lancedb` package (>= 0.27)
- Fixed LanceDB table creation format (list of dicts vs dict of lists)
- Updated dataset generation to use Python FastAPI backend
- Fixed dimension alignment (768 dims for Jina embeddings)
- kNN search validated working with new LanceDB API
- Hybrid search validated working with RRF fusion
- **NEW:** Restored Sample Documents and Backfill to ES features after FSD refactoring
- **NEW:** LanceDB API migration for documents/backfill APIs
- **NEW:** ES password reset to Summer11

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

### 6. Get Dataset Metadata
```bash
curl -s -X POST http://localhost:3000/api/vectors/metadata \
  -H "Content-Type: application/json" \
  -d '{"dataset":"test-small-20-dims-768"}' | jq .

# Expected:
{
  "success": true,
  "metadata": {
    "name": "test-small-20-dims-768",
    "vectors": 20,
    "dimensions": 768,
    "schema": {
      "id": "string",
      "vector": "fixed_size_list[768]",
      "category": "string"
    }
  }
}
```

**Note:** This endpoint downloads the dataset from OSS, opens it with LanceDB, and extracts schema metadata including vector count and dimensions.

### 7. Sample Vectors
```bash
curl -s -X POST http://localhost:3000/api/vectors/sample \
  -H "Content-Type: application/json" \
  -d '{"dataset":"test-small-20-dims-768", "count": 5}' | jq '.success'

# Expected: true

# Full response includes:
{
  "success": true,
  "samples": [
    {
      "id": "doc_0001",
      "vector": [0.123, 0.456, ...],  // 768 dimensions
      "category": "Machine Learning"
    }
  ],
  "total": 20
}
```

**Note:** Returns random samples from the dataset with full vector data.

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

// 3. Expected: Search results appear
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

### Test 14: SAMPLE DOCUMENTS Feature ✅ NEWLY RESTORED
```javascript
// 1. In Vector Management section, click "Sample Documents" button
mcp__playwright__browser_click?ref=<SAMPLE_DOCUMENTS_BUTTON_REF>

// 2. Verify documents modal appears with proper z-index (no overlap)
// Expected: "Sampled 10 documents from 10 total"
// Modal title: "Sampled Documents"
// Description: "Showing 10 documents with all fields (max 10)"
// Shows document cards with:
//   - Index number (#1, #2, etc.)
//   - Primary Key (PK: doc_0000)
//   - Document ID (ID: doc_0000)
//   - Title (e.g., "Introduction to Vector Databases")
//   - Category tag (e.g., "Vector Databases")
//   - Full text content
//   - Close button (X) in header

// 3. Verify modal z-index prevents page overlap
// The modal should appear ABOVE all other page content
// Background: dark overlay with backdrop blur
// z-index: 100 (was previously 50, causing overlap issues)
```

### Test 15: BACKFILL TO ES Feature ✅ NEWLY RESTORED
```javascript
// 1. In Vector Management section, ensure dataset exists
// Refresh if needed to show dataset

// 2. Click "Backfill to ES" button
mcp__playwright__browser_click?ref=<BACKFILL_ES_BUTTON_REF>

// 3. Verify progress bar appears
// Expected: Blue-themed progress bar with animation
// Shows: "Backfilling to Elasticsearch..."
// Shows: "Indexing documents with lance_vector field"
// Progress bar: animated sliding indicator (indeterminate)

// 4. After completion, verify success message
// Expected: "Successfully backfilled X documents to Elasticsearch in Yms"
// Shows ES index name and document count
// ES index created with:
//   - lance_vector field pointing to OSS dataset
//   - Metadata fields (id, title, text, topic, category)
```

### Test 16: SHOW DOC with Full Text Content ✅ FIXED
```javascript
// 1. Execute kNN search first (follow Test 4)
mcp__playwright__browser_click?ref=<EXECUTE_KNN_BUTTON_REF>
mcp__playwright__browser_click?ref=<CONFIRM_SEARCH_REF>

// 2. After search completes, click "SHOW DOC" button for any result
mcp__playwright__browser_click?ref=<SHOW_DOC_BUTTON_REF>

// 3. Expected: Document details panel appears with FULL text content:
//   - "Original Document" heading
//   - "Primary Key (_id)": doc_XXXX
//   - "Category": [category name]
//   - "Text Content": [FULL TEXT - not just preview]
//     Previously showed "No text content available" - NOW FIXED
//     The kNN search API now includes "text" field in _source
//   - Button toggles to "HIDE DOC"

// Note: Text content is available because:
// - /api/search route was updated to include "text" in _source
// - ES documents store metadata with text field
// - Lance vectors remain in OSS for efficient kNN search
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

### Issue 8: LanceDB API Incompatibility
**Symptom:** "Cannot add a single dictionary to a table. Use a list."
**Root Cause:** Old `lance` package format incompatible with new `lancedb` (>= 0.27) API
**Status:** ✅ FIXED

**Fix Applied:**
- Modified `backend/services/lance.py` to use list-of-dicts format for table creation
- Changed from: `table_data = {'col1': [val1, val2], 'col2': [val3, val4]}`
- Changed to: `table_data = [{'col1': val1, 'col2': val3}, {'col1': val2, 'col2': val4}]`
- Updated dataset generation workflow to use new LanceDB Python API

**Files Modified:**
- `backend/services/lance.py`

### Issue 9: Vector Dimension Mismatch (128 vs 768)
**Symptom:** "query dim(128) doesn't match the column vector vector dim(768)"
**Root Cause:** Jina embeddings API returns fixed 768-dim vectors, but frontend was generating 128-dim random vectors
**Status:** ✅ FIXED

**Fix Applied:**
- Updated `features/live-demo/ui/live-demo.tsx` to generate 768-dim vectors
- Note: Jina embeddings are fixed at 768 dimensions (not configurable)
- Dataset generation now uses 768 dims by default

**Files Modified:**
- `features/live-demo/ui/live-demo.tsx`

### Issue 10: CORS Configuration for Next.js Port 3001
**Symptom:** "Access to fetch at 'http://localhost:8000' has been blocked by CORS policy"
**Root Cause:** Python backend only allowed port 3000, but Next.js was running on 3001
**Status:** ✅ FIXED

**Fix Applied:**
- Updated `backend/main.py` to allow both ports 3000 and 3001
- Changed `allow_origins=["http://localhost:3000"]` to `allow_origins=["http://localhost:3000", "http://localhost:3001"]`

**Files Modified:**
- `backend/main.py`

### Issue 11: FSD Refactoring Removed Features
**Symptom:** "View Documents" and "Backfill to ES" buttons missing from UI
**Root Cause:** FSD refactoring from `components/vector-management.tsx` to `features/vector-mgmt/ui/vector-management.tsx` accidentally dropped:
- Documents viewer functionality
- Backfill to Elasticsearch button
- Per-dataset action buttons
**Status:** ✅ FIXED

**Fix Applied:**
- Restored documents viewer with modal display at z-index 100 (was 50, causing overlap)
- Added backfill progress bar with animated indicator
- Renamed "View Documents" to "Sample Documents" for clarity
- Limited document sampling to 10 documents (was 20)
- Added both top-level action buttons and per-dataset action buttons

**Files Modified:**
- `features/vector-mgmt/ui/vector-management.tsx`
- `features/live-demo/ui/results-display.tsx` (document text display)

### Issue 12: LanceDB API Migration for Documents/Backfill APIs
**Symptom:** `AttributeError: module 'lance' has no attribute 'dataset'`
**Root Cause:** Documents and Backfill APIs were using old `lance.dataset()` API incompatible with new lancedb (>= 0.27)
**Status:** ✅ FIXED

**Fix Applied:**
- Modified `app/api/vectors/documents/route.ts` to use new LanceDB API:
  - Changed from `lance.dataset()` to `lancedb.connect()`
  - Fixed `list_tables()` response handling (tables_response.tables attribute)
  - Updated Arrow table conversion to pandas for column filtering
- Modified `app/api/vectors/backfill/route.ts` with same LanceDB API changes

**Files Modified:**
- `app/api/vectors/documents/route.ts`
- `app/api/vectors/backfill/route.ts`

### Issue 13: ES Password Reset
**Symptom:** ES 401 authentication errors
**Root Cause:** ES password auto-regenerated on restart, was `k9l9e1XxbCwq3unPdcXe`
**Status:** ✅ FIXED - Reset to `Summer11`

**Fix Applied:**
- Reset ES password using `elasticsearch-reset-password -u elastic -i`
- Updated all API files with new password:
  - `app/api/search/route.ts`
  - `app/api/search/hybrid/route.ts`
  - `app/api/search/custom/route.ts`
  - `app/api/vectors/backfill/route.ts`
- Updated validation guide with correct password

**Files Modified:**
- All 4 API files above
- `reg_validation_guide.md`

### Issue 14: Show Doc Missing Text Content
**Symptom:** "SHOW DOC" button showed "No text content available"
**Root Cause:** kNN search API only fetched `category` field from ES, not `text`
**Status:** ✅ FIXED

**Fix Applied:**
- Modified `app/api/search/route.ts` to include `text` in `_source` specification
- Changed from `_source: ["category"]` to `_source: ["id", "category", "text"]`

**Files Modified:**
- `app/api/search/route.ts`

### Issue 15: Metadata API Python Script Missing OSS Credentials
**Symptom:** `KeyError: 'OSS_ACCESS_KEY_ID'` in Python child process for metadata endpoint
**Root Cause:** Python script spawned by metadata API doesn't inherit environment variables; also had LanceDB API compatibility issue
**Status:** ✅ FIXED

**Fix Applied:**
- Modified `app/api/vectors/metadata/route.ts` to import `getOSSConfig()` from `lib/oss-client.ts`
- Added `execWithTimeout()` helper to accept and pass environment variables
- Modified Python script to use `os.environ.get()` with fallback defaults
- Fixed LanceDB `list_tables()` response handling (same pattern as sample route)

**Files Modified:**
- `app/api/vectors/metadata/route.ts`

### Issue 16: Jina API 429 Rate-Limit — Generate Dataset & Hybrid Search
**Symptom:** Generate Dataset returns `{"success":false,"error":"Jina API error: 429"}`. Hybrid Search fails with `Failed to generate embedding for query text: Jina API error: 429 - ...`
**Root Cause:** Both `generateAndUploadDataset` (oss-client.ts) and `generateQueryEmbedding` (hybrid/route.ts) call Jina embeddings without any retry logic. Jina enforces per-minute rate limits; parallel batch requests and back-to-back hybrid searches hit this limit.
**Status:** ✅ FIXED

**Fix Applied:**
- Added `jinaFetchWithRetry()` helper in `lib/oss-client.ts` — exponential backoff (1s → 2s → 4s) with up to 3 retries on HTTP 429, and `Retry-After` header support.
- Wired the helper into the embedding batch loop in `generateAndUploadDataset`.
- Exported the helper for reuse; `hybrid/route.ts` `generateQueryEmbedding` now uses the same retry wrapper.

**Files Modified:**
- `lib/oss-client.ts` — added `jinaFetchWithRetry`, used in batch embedding loop
- `app/api/search/hybrid/route.ts` — `generateQueryEmbedding` uses `jinaFetchWithRetry`

---

### Issue 17: Generate Dataset Thundering-Herd on Jina 429
**Symptom:** Generate Dataset fails with `Jina API error: 429 (exhausted 3 retries)` even after Issue 16 retry wrapper was added.
**Root Cause:** The batch loop in `generateAndUploadDataset` fired N parallel `jinaFetchWithRetry` calls via `batch.map(async ...)`. When all N hit 429 simultaneously, each retried independently at the same delay — creating another simultaneous burst (thundering herd). Additionally, the `Retry-After` header cap was 30 s, which could truncate Jina's actual cooldown window.
**Status:** ✅ FIXED

**Fix Applied (two changes in `lib/oss-client.ts`):**
1. **Retry-After cap raised:** `Math.min(..., 30000)` → `Math.min(..., 120000)` — honours Jina cooldowns up to 2 min.
2. **Collapsed N parallel calls into a single batched Jina API call.** Jina's `/v1/embeddings` endpoint accepts `input: string[]` and returns embeddings in order. The batch loop now sends one request per batch instead of one per document. The generate path uses `(5 retries, 2 s base delay)` since it is slow-tolerant.

**Regression guard:** `/tmp/run_regression.py` test 8 ("Generate Dataset") covers this. If it regresses, look for parallel Jina calls in the batch loop.

---

### Issue 18: UI Hybrid Search 500 — esIndex Mismatch
**Symptom:** Hybrid Search returns 500 in the browser UI but succeeds via `curl`. Network trace shows Jina embedding returns 200, so the failure is downstream (ES query phase).
**Root Cause:** The UI (`features/live-demo/ui/live-demo.tsx`) sanitised the selected dataset name into an ES index name and sent it as `esIndex`:
```typescript
// WRONG — dataset name ≠ ES index name
const esIndex = selectedDataset.toLowerCase().replace(/[^a-z0-9-]/g, '-');
```
All datasets share the single ES index `lance-validation-test`. Sending a non-existent index name (e.g. `real-87k-dims-768`) caused ES to 404, which the route surfaced as 500. `curl` worked because it omitted `esIndex`, letting the route default to `lance-validation-test`.
**Status:** ✅ FIXED

**Fix Applied (`features/live-demo/ui/live-demo.tsx`):**
- Removed the `esIndex` computation entirely.
- Send `dataset: selectedDataset` instead (informational; the route defaults its ES index server-side).
- Removed the now-dead client-side `rrfFusion` function (fusion is done server-side in the route).

**Regression guard:** After any UI change to the hybrid search path, verify in Playwright that clicking "Hybrid Search → Execute → Confirm" returns results. The route's `ES_INDEX` default (`lance-validation-test`) must not be overridden by the frontend.

---

### Issue 19: Backfill Python KeyError on Sparse-Schema Datasets
**Symptom:** Switching to `test-small-20-dims-768` in the Search Dataset dropdown triggers backfill, which crashes with `KeyError: 'id'` inside the embedded Python script.
**Root Cause:** The Python result-builder in `backfill/route.ts` correctly filtered the DataFrame to `available_columns`, but the `result.append(...)` block unconditionally accessed all six named columns (`_id`, `id`, `title`, `text`, `topic`, `category`). Datasets generated outside the GLM pipeline (e.g., `test-small-*`) only have `_id` and `vector` — every other column access crashes.
**Status:** ✅ FIXED

**Fix Applied (`app/api/vectors/backfill/route.ts`, Python script):**
- Each field access is now guarded: `to_string(row['id']) if 'id' in available_columns else doc_id`
- Fallback chain: `id` → `_id`; `title` → `"Document {_id}"`; `text` → `""`; `topic` → `"general"`; `category` → `"uncategorized"`; `_id` → row index.

**Regression guard:** After any change to the backfill Python script, run backfill against `test-small-20-dims-768` (only `_id` + `vector` columns). If it succeeds, the column-access logic is sound.

---

### Issue 20: Dataset Switching — kNN & Hybrid Must Track Dropdown Selection
**Symptom:** Selecting a different dataset in the "Search Dataset" dropdown had no effect. Both kNN and Hybrid continued querying whichever dataset was previously backfilled to `lance-validation-test`.
**Root Cause:** The `lance_vector` field mapping bakes a `lance_uri` at index-creation time; it cannot be updated in-place. Hybrid search always targeted `lance-validation-test` regardless of the selected dataset, and while kNN had a Python-fallback path that respected the selection, Hybrid had none.
**Status:** ✅ FIXED — End-to-end validated

**Fix Applied (two files):**

1. **`app/api/vectors/backfill/route.ts`:**
   - `BackfillRequest` extended with `forceRecreate?: boolean` and `dims?: number`.
   - New `deleteESIndex()` helper — sends DELETE, ignores 404.
   - `createESIndex()` now accepts `dims` parameter (was hardcoded 768).
   - POST handler: when `forceRecreate` is true, DELETE the index before PUT (required because `lance_uri` is immutable).
   - Python cache (`/tmp/lance-cache/`) cleared after successful bulk indexing.

2. **`features/live-demo/ui/live-demo.tsx`:**
   - Added `isBackfilling` state and `prevDatasetRef` (useRef).
   - Dataset-switch `useEffect`: skips initial mount (`prevDatasetRef.current === null`), fires on every subsequent `selectedDataset` change. Posts to `/api/vectors/backfill` with `{ dataset, esIndex: 'lance-validation-test', createIndex: true, forceRecreate: true, dims: ds.dims }`.
   - Blue spinner indicator ("Switching to …") shown while backfill is in progress.
   - Search button disabled (`isLoading || isBackfilling`) during backfill.

**End-to-end validation (Playwright):**
- Selected `test-small-20-dims-768` (20 vectors, 768 dims) from dropdown.
- Backfill POST → 200 OK.
- kNN search → 20 candidates, top-5 all `test_doc_*` IDs. ✓
- Hybrid search → Text 0 / Vector 5 / Fused 5, all `test_doc_*` IDs. RRF scores ~0.008. ✓
- Both searches confirmed to operate exclusively against the switched dataset.

**Regression guard:** After any change to the dataset-switch flow, repeat: (1) select a dataset with a different vector count than the current active dataset, (2) wait for backfill spinner to clear, (3) run both kNN and Hybrid — candidate count must match the selected dataset's vector count.

---

## Regression Test Checklist

Use this checklist for quick regression testing before committing changes.

### Pre-Test Setup
- [ ] Elasticsearch running: `curl -s -k -u elastic:Summer11 https://127.0.0.1:9200/_cluster/health`
- [ ] Next.js running: `curl -s http://localhost:3000`
- [ ] OSS credentials configured: `cat ~/.oss/credentials.json`

### Quick API Tests (3 minutes)
```bash
# Test 1: List datasets
curl -s http://localhost:3000/api/vectors/list | jq '.success'
# Expected: true

# Test 2: Fetch documents
curl -s -X POST http://localhost:3000/api/vectors/documents \
  -H "Content-Type: application/json" \
  -d '{"dataset":"test-small-20-dims-768"}' | jq '.success'
# Expected: true

# Test 3: kNN Search
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "k": 5}' | jq '.success'
# Expected: true

# Test 4: Hybrid Search
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "vector database", "k": 5}' | jq '.success'
# Expected: true

# Test 5: Get Metadata
curl -s -X POST http://localhost:3000/api/vectors/metadata \
  -H "Content-Type: application/json" \
  -d '{"dataset":"test-small-20-dims-768"}' | jq '.success'
# Expected: true

# Test 6: Sample Vectors
curl -s -X POST http://localhost:3000/api/vectors/sample \
  -H "Content-Type: application/json" \
  -d '{"dataset":"test-small-20-dims-768", "count": 5}' | jq '.success'
# Expected: true
```

### UI Smoke Tests (3 minutes)
- [ ] Homepage loads without errors
- [ ] Dataset list refreshes and shows datasets
- [ ] DOCUMENTS button shows document list
- [ ] ADD VECTORS button opens modal

### Generate Dataset Test (slow — ~30-60s, run separately)
```bash
# Test 7: Generate Dataset (uses GLM + Jina APIs — rate-limited)
# Run ONLY when verifying generate flow; skip in fast smoke runs.
curl -s -X POST http://localhost:3000/api/vectors/generate \
  -H "Content-Type: application/json" \
  -d '{"vectors": 10, "dims": 768}' | jq .
# Expected: {"success":true,"dataset":"vectors-10-dims-768-TIMESTAMP","vectors":10,"dims":768}
# If Jina returns 429, the retry logic should back off and eventually succeed.
# Failure after retries: check Jina rate-limit quota at https://app.jina.ai/pricing
```

### Hybrid Search 429-Resilience Test
```bash
# Run hybrid search twice rapidly to trigger Jina rate limit edge case
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "machine learning", "k": 5}' | jq '.success'
# Immediately again:
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "deep learning neural networks", "k": 5}' | jq '.success'
# Expected: both return true. Retry logic should handle transient 429.
```

### Dataset-Switch Smoke Test (after any search-path change)
1. Open demo in browser → note the active dataset (shown in dropdown)
2. Open dropdown → select a **different** dataset (prefer one with a different vector count, e.g. `test-small-20-dims-768` vs a generated 10-vector dataset)
3. Wait for blue spinner ("Switching to …") to disappear
4. Run kNN search — candidate count must equal the selected dataset's vector count
5. Switch to Hybrid Search — all result IDs must belong to the selected dataset
6. If either search returns results from the *previous* dataset, the backfill or cache-clear is broken

### All Interactive Features Validated ✅
- ✅ Hybrid Search (Text + Vector Fusion) - Fully working
- ✅ Show ES Request - Displays both BM25 and lance_knn queries
- ✅ Show Vector - Loads and displays vector data from OSS
- ✅ Show Doc - Displays original document details WITH FULL TEXT (fixed)
- ✅ Try Again - Returns to search confirmation dialog
- ✅ Performance Timeline - Shows breakdown of all phases
- ✅ Performance Insights - Displays optimization suggestions
- ✅ **Sample Documents** - Shows up to 10 documents with all fields (PK, ID, title, text, topic, category)
- ✅ **Backfill to ES** - Creates ES index with lance_vector field pointing to OSS, with progress bar
- ✅ **Modal z-index Fix** - Documents modal properly layered above main page (z-100)
- ✅ **Dataset Switching** - Dropdown selection triggers forceRecreate backfill; both kNN and Hybrid search the switched dataset

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

### 2026-02-01: LanceDB API Migration Complete
- ✅ **NEW: Migrated from `lance` to `lancedb` package (>= 0.27)**
- ✅ **NEW: Fixed LanceDB table creation format** - Changed from dict-of-lists to list-of-dicts
- ✅ **NEW: Fixed dimension alignment** - Jina embeddings use 768 dims (not configurable)
- ✅ **NEW: Updated frontend vector generation** - Random vectors now 768 dims to match dataset
- ✅ **NEW: Fixed CORS configuration** - Python backend allows both ports 3000 and 3001
- ✅ **NEW: Validated kNN search** - Returns proper results with scores, distances, timing
- ✅ **NEW: Validated Hybrid Search** - RRF fusion working with text+vector search
- ✅ **NEW: Python FastAPI backend** - SSE streaming for dataset generation progress
- ✅ **NEW: Dataset generation validation** - 10 vectors, 768 dims, 39KB uploaded to OSS

**Files Modified:**
- `backend/services/lance.py` - LanceDB table creation fix
- `backend/main.py` - CORS configuration for ports 3000/3001
- `features/live-demo/ui/live-demo.tsx` - Vector dimension fix (768 dims)
- `app/api/search/route.ts` - Python script structure fix

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

## OpenTelemetry Tracing Validation

### Overview
OpenTelemetry tracing is implemented for kNN and hybrid search operations. Traces are exported directly to Elasticsearch (no APM Server required) and viewable in Kibana.

### Trace Architecture
```
Next.js App → OTEL SDK → Custom ES Exporter → Elasticsearch (traces-lance-*) → Kibana
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/tracing.ts` | OTEL SDK initialization with ES exporter |
| `lib/es-trace-exporter.ts` | Custom SpanExporter to Elasticsearch |
| `lib/tracing-utils.ts` | Helper functions for creating spans |
| `instrumentation.ts` | Next.js instrumentation hook |

### Span Hierarchy

**kNN Search (`lance.search.knn`)**
```
lance.search.knn (root)
├── elasticsearch.search.knn (ES query)
└── lance.search.python (Python subprocess timing)
```

**Hybrid Search (`lance.search.hybrid`)**
```
lance.search.hybrid (root)
├── jina.embedding.generate
├── elasticsearch.search.bm25 (text search)
├── elasticsearch.search.knn (vector search)
└── search.fusion.rrf (RRF fusion)
```

### OTEL Test 1: Verify Trace Index Setup
```bash
# Check trace index template exists
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/_index_template/traces-lance-template" | jq '.index_templates[0].name'
# Expected: "traces-lance-template"

# Check trace index exists
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/_cat/indices/traces-lance-*?v"
# Expected: Shows traces-lance-* index with document count
```

### OTEL Test 2: kNN Search Generates Traces
```bash
# Execute kNN search
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "k": 5}' | jq '.traceId'
# Expected: Returns a traceId (e.g., "abc123...")

# Verify trace in ES (wait 2-3 seconds for batch export)
sleep 3
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/traces-lance-*/_search?size=1" \
  -H "Content-Type: application/json" \
  -d '{"query":{"match":{"span.name":"lance.search.knn"}}}' | jq '.hits.total.value'
# Expected: >= 1
```

### OTEL Test 3: Hybrid Search Generates Traces
```bash
# Execute hybrid search
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "vector database", "k": 5}' | jq '.traceId'
# Expected: Returns a traceId

# Verify trace spans
sleep 3
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/traces-lance-*/_search" \
  -H "Content-Type: application/json" \
  -d '{"query":{"match":{"span.name":"lance.search.hybrid"}}}' | jq '.hits.total.value'
# Expected: >= 1
```

### OTEL Test 4: Verify Span Attributes
```bash
# Check span has required attributes
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/traces-lance-*/_search?size=1" \
  -H "Content-Type: application/json" \
  -d '{"query":{"match":{"span.name":"lance.search.knn"}}}' | jq '.hits.hits[0]._source.attributes'
# Expected attributes:
# - http.method: POST
# - http.url: /api/search
# - search.k: 5
# - search.dataset: <dataset_name>
```

### OTEL Test 5: Kibana Traces Visualization (Playwright MCP)
```javascript
// 1. Navigate to Kibana Discover
mcp__playwright__browser_navigate?url=http://localhost:5601/app/discover

// 2. Select "Lance Traces" data view
mcp__playwright__browser_click?ref=<DATA_VIEW_SELECTOR>
mcp__playwright__browser_click?ref=<LANCE_TRACES_OPTION>

// 3. Verify traces visible
// Expected: Documents with fields:
//   - @timestamp
//   - trace.id
//   - span.name
//   - span.duration_ms
//   - service.name: "lance-demo"
```

### OTEL Test 6: Trace Parent-Child Relationships
```bash
# Get a hybrid search trace
TRACE_ID=$(curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "test", "k": 3}' | jq -r '.traceId')

sleep 3

# Verify multiple spans with same trace ID
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/traces-lance-*/_search" \
  -H "Content-Type: application/json" \
  -d "{\"query\":{\"term\":{\"trace.id\":\"$TRACE_ID\"}}}" | jq '.hits.total.value'
# Expected: >= 2 (root span + child spans)
```

### Regression Test: No Tracing Overhead Impact
```bash
# Ensure search still completes in reasonable time (< 5 seconds)
time curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "k": 5}' > /dev/null
# Expected: real time < 5s
```

### Tracing Validation Checklist
- [ ] Trace index template created (`traces-lance-template`)
- [ ] Traces exported to `traces-lance-*` index
- [ ] kNN search creates `lance.search.knn` spans
- [ ] Hybrid search creates `lance.search.hybrid` spans
- [ ] Child spans include: `jina.embedding.generate`, `elasticsearch.search.bm25`, `elasticsearch.search.knn`, `search.fusion.rrf`
- [ ] Spans have correct attributes (http.method, search.k, etc.)
- [ ] Traces visible in Kibana Discover with "Lance Traces" data view
- [ ] No significant performance regression from tracing

---

## Contributing

When adding new features:
1. Update this validation guide with test procedures
2. Use `starter_project.sh` as reference for service startup
3. Follow the lazy initialization pattern for OSS client
4. Test with Playwright MCP before marking complete
5. Document any new API endpoints in the API Tests section

# Validation Guide for Lance Vector Plugin Demo

This guide provides comprehensive validation procedures for the Lance Vector Plugin demo application. Use this guide for:
- **Regression Testing**: Ensure features continue working after code changes
- **Quality Assurance**: Validate all functionality before releases
- **Troubleshooting**: Diagnose issues systematically

## Table of Contents

1. [Validation Progress Log](#validation-progress-log)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Service Startup Validation](#service-startup-validation)
5. [Vector Management Validation](#vector-management-validation)
6. [kNN Search Validation](#knn-search-validation)
7. [Hybrid Search Validation](#hybrid-search-validation)
8. [Backfill Validation](#backfill-validation)
9. [End-to-End UI Validation](#end-to-end-ui-validation)
   - [Playwright Script Tests](#playwright-script-tests)
   - [Playwright MCP Validation](#playwright-mcp-validation)
10. [Common Issues and Solutions](#common-issues-and-solutions)
11. [Regression Test Checklist](#regression-test-checklist)
12. [Automated Test Script](#automated-test-script)
13. [Conclusion](#conclusion)

---

## Validation Progress Log

### 2026-01-29: Hybrid Search Complete Validation

**Validation Method**: Playwright MCP (headless browser automation)

**Features Validated**:
| Feature | Status | Notes |
|---------|--------|-------|
| Hybrid Search Mode | ✅ Pass | Switches from kNN to text input correctly |
| Query Text Input | ✅ Pass | Accepts and submits "machine learning" query |
| Search Execution | ✅ Pass | Returns 5 fused results with HYBRID match type |
| Timing Breakdown | ✅ Pass | Shows Embedding, Text, Vector, RRF phases |
| lance_knn Format | ✅ Pass | Frontend displays correct Lance query format |
| kNN Search Mode | ✅ Pass | Mode switching works correctly |
| Custom Query Mode | ✅ Pass | JSON editor with example queries loads |
| Vector Management | ✅ Pass | Shows dataset info (10 vectors, 128 dims) |
| Documents View | ✅ Pass | Displays all 10 documents correctly |

**Key Implementation Confirmed**:
- API uses `lance_knn` format (not ES native `knn`)
- ES profiling enabled (`profile: true`)
- ES profile parsing extracts `lance_vector_query_ms`
- ES auth password: `Summer11` (line 87 of `app/api/search/hybrid/route.ts`)

**Screenshots**: `/tmp/playwright-output/hybrid-search-validation.png`

**Commit**: `e16939f` - feat: Use Lance-specific query format with ES profiling

---

## Prerequisites

### System Requirements
- **OS**: Ubuntu Server (headless - no X11)
- **Node.js**: v18+ with npm
- **Python**: v3.8+ with numpy, lance, pyarrow
- **Memory**: 4GB+ minimum
- **Disk**: 10GB+ free space

### Required Tools
```bash
# Install Node.js dependencies
npm install

# Install Playwright for UI testing
npm install -D @playwright/test
npx playwright install chromium

# Verify Python dependencies
python3 -c "import numpy, lance, pyarrow; print('Python deps OK')"
```

### External Services
- **Elasticsearch 9.2.4-SNAPSHOT** with lance-vector plugin
- **Alibaba Cloud OSS** account with credentials
- **Jina API** key for embeddings
- **GLM API** key for document generation

---

## Environment Setup

### 1. Configure Elasticsearch

```bash
cd /home/denny/projects/es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT

# Verify startup script has correct OSS endpoint
grep "OSS_ENDPOINT" start_es_with_plugins.sh
# Expected: oss-ap-southeast-1.aliyuncs.com (Singapore region)

# Reset elastic password
./bin/elasticsearch-reset-password -u elastic -b
# Save the generated password
```

**Update password in all API routes:**
```bash
# After password reset, update all occurrences:
OLD_PASSWORD="old_password_here"
NEW_PASSWORD="new_generated_password"

find app/api -name "*.ts" -exec sed -i "s/elastic:$OLD_PASSWORD/elastic:$NEW_PASSWORD/g" {} \;
```

### 2. Configure OSS Credentials

```bash
# Verify OSS credentials file exists
cat ~/.oss/credentials.json
# Expected format:
{
  "access_key_id": "YOUR_KEY",
  "access_key_secret": "YOUR_SECRET",
  "endpoint": "oss-cn-beijing.aliyuncs.com",
  "region": "cn-beijing"
}

# Note: The actual bucket endpoint is determined by start_es_with_plugins.sh
# For denny-test-lance bucket: oss-ap-southeast-1.aliyuncs.com
```

### 3. Set Environment Variables

```bash
# Optional: Set in .env.local or export in shell
export GLM_API_KEY="your_glm_api_key"
export JINA_API_KEY="your_jina_api_key"
export OSS_ACCESS_KEY_ID="your_oss_access_key"
export OSS_ACCESS_KEY_SECRET="your_oss_secret"
export OSS_ENDPOINT="oss-ap-southeast-1.aliyuncs.com"
export OSS_BUCKET="denny-test-lance"
```

---

## Service Startup Validation

### Start Elasticsearch

```bash
cd /home/denny/projects/es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT

# Start in detached mode
./start_es_with_plugins.sh -d -p elasticsearch.pid

# Wait for startup (10-15 seconds)
sleep 15

# Verify ES is running
curl -s -u "elastic:PASSWORD" http://localhost:9200/_cluster/health?pretty=true

# Expected output:
# {
#   "cluster_name" : "elasticsearch",
#   "status" : "yellow" or "green",
#   "number_of_nodes" : 1,
#   ...
# }

# Verify plugins are loaded
curl -s -u "elastic:PASSWORD" http://localhost:9200/_cat/plugins?v

# Expected: lance-vector, security-realm-cloud-iam
```

### Start Next.js Dev Server

```bash
cd /home/denny/projects/es-lance-in-oss-demo

# Start server (background for headless environment)
nohup npm run dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!
echo $DEV_PID > /tmp/dev-server.pid

# Wait for startup (5-10 seconds)
sleep 10

# Verify server is running
curl -s http://localhost:3000 | grep -q "<!DOCTYPE html>" && echo "Server OK" || echo "Server FAIL"

# Check logs for errors
tail -50 /tmp/dev-server.log | grep -i error || echo "No errors in logs"
```

### Stop Services (After Testing)

```bash
# Stop Next.js
if [ -f /tmp/dev-server.pid ]; then
    kill $(cat /tmp/dev-server.pid)
    rm /tmp/dev-server.pid
fi

# Stop Elasticsearch
cd /home/denny/projects/es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
if [ -f elasticsearch.pid ]; then
    kill $(cat elasticsearch.pid)
    rm elasticsearch.pid
fi
```

---

## Vector Management Validation

### Test 1: List Existing Datasets

```bash
curl -s http://localhost:3000/api/vectors/list | jq .

# Expected output structure:
# {
#   "success": true,
#   "datasets": [
#     {
#       "name": "vectors-10-dims-128-TIMESTAMP",
#       "vectors": 10,
#       "dimensions": 768,
#       "created_at": "ISO_TIMESTAMP"
#     }
#   ]
# }
```

### Test 2: Generate New Dataset

```bash
# Generate dataset with GLM + Jina
curl -s -X POST http://localhost:3000/api/vectors/generate \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": 10,
    "dimensions": 128
  }' | jq .

# Expected output:
# {
#   "success": true,
#   "message": "Generated 10 vectors (128 dims)",
#   "dataset": "vectors-10-dims-128-TIMESTAMP",
#   "dimensions": 128
# }

# Save dataset name for subsequent tests
DATASET_NAME=$(curl -s -X POST http://localhost:3000/api/vectors/generate \
  -H "Content-Type: application/json" \
  -d '{"vectors": 10, "dimensions": 128}' | jq -r '.dataset')
echo "Generated dataset: $DATASET_NAME"
```

### Test 3: Fetch Dataset Documents

```bash
curl -s -X POST http://localhost:3000/api/vectors/fetch \
  -H "Content-Type: application/json" \
  -d "{\"dataset\": \"$DATASET_NAME\"}" | jq .

# Expected output:
# {
#   "success": true,
#   "documents": [
#     {
#       "_id": "doc_0000",
#       "id": "doc_0000",
#       "title": "document title",
#       "text": "document content",
#       "topic": "topic name",
#       "category": "category name",
#       "vector": [0.1, 0.2, ...]
#     }
#   ],
#   "total": 10
# }

# Validation: Check all required fields exist
curl -s -X POST http://localhost:3000/api/vectors/fetch \
  -H "Content-Type: application/json" \
  -d "{\"dataset\": \"$DATASET_NAME\"}" | jq '.documents[0] | keys'

# Expected keys: ["_id", "category", "id", "text", "title", "topic", "vector"]
```

### Test 4: View Documents (UI endpoint)

```bash
curl -s -X POST http://localhost:3000/api/vectors/documents \
  -H "Content-Type: application/json" \
  -d "{\"dataset\": \"$DATASET_NAME\", \"limit\": 20}" | jq .

# Expected: Same structure as Test 3
# Verify GLM-generated content is meaningful (not "Test", "test", etc.)
```

---

## kNN Search Validation

### Test 1: Basic kNN Search

```bash
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "machine learning algorithms",
    "k": 5
  }' | jq .

# Expected output:
# {
#   "success": true,
#   "results": [
#     {
#       "id": "doc_000X",
#       "category": "Machine Learning",
#       "score": NUMBER,
#       "index": "dataset_name"
#     }
#   ],
#   "latency": "XMills"
# }

# Validation: Results should be ordered by score (descending)
SCORES=$(curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "k": 3}' | jq '.results | map(.score)')

echo "Scores: $SCORES"
# Verify: First score >= Second score >= Third score
```

### Test 2: kNN Search with Profiling

```bash
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "neural networks",
    "k": 5,
    "profile": true
  }' | jq '.timing'

# Expected output with timing breakdown:
# {
#   "total": "XMills",
#   "phases": {
#     "query_embedding": "XMills",
#     "vector_search": "XMills",
#     "result_processing": "XMills"
#   }
# }
```

---

## Hybrid Search Validation

### Important Implementation Notes (Updated 2026-01-29)

**Lance Vector Plugin Query Format:**
- Hybrid Search uses Lance-specific `lance_knn` format (NOT ES native `knn`)
- Query structure: `{ "query": { "lance_knn": { "field": "embedding", ... } } }`
- ES profiling is enabled (`profile: true`) for detailed timing breakdown
- ES profile data is parsed to extract `lance_vector_query_ms` timing
- Frontend displays the correct Lance query format in "Show ES Request"

**ES Authentication:**
- Current password: `Summer11` (auto-regenerates on ES restart)
- Update required: `app/api/search/hybrid/route.ts` line 87

**ES Environment Variables (Required for lance_knn):**
```bash
# ES must be started with OSS_ENDPOINT set
export OSS_ENDPOINT="oss-ap-southeast-1.aliyuncs.com"
export OSS_ACCESS_KEY_ID="YOUR_KEY"
export OSS_ACCESS_KEY_SECRET="YOUR_SECRET"
```

**Query Format Comparison:**

| Format | Structure | Used By |
|--------|-----------|---------|
| **lance_knn** (Current) | `{ "query": { "lance_knn": {...} } }` | Lance Vector Plugin |
| knn (ES Native) | `{ "knn": {...} }` | Elasticsearch native |

**ES Profile Structure:**
```
profile.shards[0].searches[0].query[]
  └─ type: "LanceKnnQuery"
  └─ time_in_nanos: NUMBER
  └─ description: "LanceKnnQuery(embedding, uri=oss://...)"
  └─ breakdown: { next_doc, match, next_reader, ... }
```

### Test 1: Hybrid Search with Query Text

```bash
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "queryText": "machine learning",
    "k": 5,
    "numCandidates": 10
  }' | jq .

# Expected output:
# {
#   "success": true,
#   "results": [
#     {
#       "id": "doc_000X",
#       "category": "Machine Learning",
#       "text": "document text...",
#       "score": NUMBER,
#       "matchType": "hybrid"
#     }
#   ],
#   "textResults": NUMBER,
#   "vectorResults": NUMBER,
#   "fusionResults": NUMBER,
#   "queryText": "machine learning",
#   "queryVector": [...],  // 768-dimensional array
#   "latency": "XMills",
#   "timingBreakdown": [
#     {"phase": "Embedding Generation", "duration": NUMBER, "startOffset": NUMBER},
#     {"phase": "Text Search (BM25)", "duration": NUMBER, "startOffset": NUMBER},
#     {"phase": "Vector Search (kNN)", "duration": NUMBER, "startOffset": NUMBER, "lance_vector_query_ms": "NUMBER", "query_type": "LanceKnnQuery", "description": "...", "breakdown": {...}},
#     {"phase": "RRF Fusion", "duration": NUMBER, "startOffset": NUMBER}
#   ],
#   "esProfile": {...}  // Raw ES profile data for debugging
# }

# Validations:
# 1. queryVector has exactly 768 elements
# 2. textResults >= 0
# 3. vectorResults >= 0
# 4. fusionResults = min(k, textResults + vectorResults)
# 5. All results have matchType: "text", "vector", or "hybrid"
```

### Test 2: Verify Lance Vector Integration

```bash
# The Lance Vector Plugin should fetch vectors from OSS
# Check that vector search is working via external Lance dataset

# First, verify ES index has lance_vector field
ES_PASSWORD="your_es_password"
curl -s -u "elastic:$ES_PASSWORD" http://localhost:9200/lance-validation-test/_mapping?pretty=true | grep -A 15 "embedding"

# Expected mapping:
# "embedding" : {
#   "type" : "lance_vector",
#   "dims" : 768,
#   "similarity" : "cosine",
#   "storage" : {
#     "type" : "external",
#     "uri" : "oss://denny-test-lance/datasets/...",
#     "lance_id_column" : "_id",
#     "lance_vector_column" : "vector",
#     "read_only" : true
#   }
# }
```

### Test 3: Verify Jina API Integration

```bash
# Check that query text is converted to embedding via Jina API
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "test query", "k": 1}' | jq '.queryVector | length'

# Expected: 768 (Jina embeddings-v2-base-en dimension)

# Verify embedding values are reasonable (not all zeros)
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "test", "k": 1}' | jq '.queryVector | map(select(. != 0)) | length'

# Expected: Many non-zero values (hundreds at least)
```

### Test 4: Verify Lance Vector Plugin Query Format

```bash
# Verify the API uses Lance-specific lance_knn format
# Check the actual query sent to ES (via timing breakdown)

curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "test", "k": 1}' | jq '.timingBreakdown[2]'

# Expected output includes Lance-specific fields:
# {
#   "phase": "Vector Search (kNN)",
#   "duration": NUMBER,
#   "startOffset": NUMBER,
#   "lance_vector_query_ms": "NUMBER",  // Lance plugin timing
#   "query_type": "LanceKnnQuery",       // Confirms Lance plugin
#   "description": "LanceKnnQuery(embedding, uri=oss://...)",
#   "breakdown": {
#     "next_doc": NUMBER,
#     "match": NUMBER,
#     "next_reader": NUMBER,
#     ...
#   }
# }

# Verify esProfile contains raw ES profiling data
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "test", "k": 1}' | jq '.esProfile.shards[0].searches[0].query[] | select(.type == "LanceKnnQuery")'

# Expected: Query type is "LanceKnnQuery" (not "KnnQuery")
```

### Test 5: Verify Frontend Display Format (UI)

```bash
# When using the UI, the "Show ES Request" button should display
# the Lance-specific query format, not the ES native knn format

# Expected display format:
# {
#   "profile": true,
#   "query": {
#     "lance_knn": {          // Lance-specific format
#       "field": "embedding",
#       "query_vector": [...],
#       "k": 5,
#       "num_candidates": 10
#     }
#   },
#   "size": 5,
#   "_source": ["id", "category", "text"]
# }

# NOT the old format:
# {
#   "knn": {                  // ES native format (DEPRECATED)
#     "field": "embedding",
#     ...
#   }
# }
```

---

## Backfill Validation

### Prerequisites
```bash
# Generate a dataset first if none exists
DATASET_NAME="vectors-10-dims-128-$(date +%s)"
curl -s -X POST http://localhost:3000/api/vectors/generate \
  -H "Content-Type: application/json" \
  -d "{\"vectors\": 10, \"dimensions\": 128, \"datasetName\": \"$DATASET_NAME\"}"
```

### Test 1: Backfill to New Index

```bash
# Delete existing index if present
ES_PASSWORD="your_es_password"
curl -s -u "elastic:$ES_PASSWORD" -X DELETE http://localhost:9200/test-backfill-index

# Run backfill
curl -s -X POST http://localhost:3000/api/vectors/backfill \
  -H "Content-Type: application/json" \
  -d "{
    \"dataset\": \"$DATASET_NAME\",
    \"esIndex\": \"test-backfill-index\",
    \"createIndex\": true
  }" | jq .

# Expected output:
# {
#   "success": true,
#   "esIndex": "test-backfill-index",
#   "totalDocuments": 10,
#   "indexedDocuments": 10,
#   "duration": "XMills",
#   "message": "Successfully backfilled 10 documents (metadata only) to Elasticsearch index \"test-backfill-index\". Vectors remain in Lance/OSS for efficient kNN search."
# }
```

### Test 2: Verify ES Index Structure

```bash
# Check index mapping
curl -s -u "elastic:$ES_PASSWORD" http://localhost:9200/test-backfill-index/_mapping?pretty=true

# Expected: Should have lance_vector field in addition to text fields
# {
#   "properties": {
#     "id": {"type": "keyword"},
#     "title": {"type": "text"},
#     "text": {"type": "text"},
#     "topic": {"type": "keyword"},
#     "category": {"type": "keyword"},
#     "embedding": {
#       "type": "lance_vector",
#       "dims": 768,
#       ...
#     }
#   }
# }

# Verify documents are indexed
curl -s -u "elastic:$ES_PASSWORD" http://localhost:9200/test-backfill-index/_count?pretty=true

# Expected:
# {
#   "count" : 10,
#   ...
# }
```

### Test 3: Verify Backfill Content

```bash
# Search for indexed documents
curl -s -u "elastic:$ES_PASSWORD" -X POST "http://localhost:9200/test-backfill-index/_search?pretty=true" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {"match_all": {}},
    "size": 1
  }' | jq .

# Expected: Document should have metadata fields but NO vector field
# {
#   "hits": {
#     "hits": [
#       {
#         "_source": {
#           "id": "doc_000X",
#           "title": "...",
#           "text": "...",
#           "topic": "...",
#           "category": "..."
#           # NO "vector" or "embedding" field here!
#         }
#       }
#     ]
#   }
# }
```

---

## End-to-End UI Validation

### Playwright Script Tests

### Prerequisites

**IMPORTANT**: This is an Ubuntu server without X11. Always use headless mode for Playwright.

```bash
# Verify Playwright is installed
npm list @playwright/test playwright

# If not installed:
npm install -D @playwright/test
npx playwright install chromium
```

### Test 1: Vector Management UI

```bash
# Create test script
cat > /tmp/test_vector_ui.js << 'EOF'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Test Generate & Upload button
    await page.getByText('Generate & Upload Dataset').first().click();
    await page.waitForTimeout(2000);
    console.log('✓ Generate form opened');

    // Fill form and submit
    await page.locator('input[type="number"]').first().fill('10');
    await page.getByRole('button', { name: 'Generate' }).click();
    console.log('✓ Generation initiated');

    // Wait for completion
    await page.waitForTimeout(30000);

    // Check for success message
    const hasSuccess = await page.getByText(/successfully generated/i).count() > 0;
    console.log(hasSuccess ? '✓ Dataset generated' : '✗ Generation failed');

    await browser.close();
    process.exit(hasSuccess ? 0 : 1);
  } catch (error) {
    console.error('✗ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
EOF

# Run test
node /tmp/test_vector_ui.js
# Expected: Exit code 0 (success)
```

### Test 2: kNN Search UI

```bash
cat > /tmp/test_knn_ui.js << 'EOF'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Ensure kNN mode is active (default)
    await page.waitForTimeout(1000);

    // Click Search button
    await page.getByRole('button', { name: 'Search' }).first().click();
    console.log('✓ Search clicked');

    // Wait for results
    await page.waitForTimeout(10000);

    // Verify results
    const hasResults = await page.getByText(/doc_\d+/).count() > 0;
    console.log(hasResults ? '✓ Results displayed' : '✗ No results');

    await browser.close();
    process.exit(hasResults ? 0 : 1);
  } catch (error) {
    console.error('✗ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
EOF

node /tmp/test_knn_ui.js
# Expected: Exit code 0
```

### Test 3: Hybrid Search UI

```bash
cat > /tmp/test_hybrid_ui.js << 'EOF'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to Hybrid Search mode
    await page.getByRole('button', { name: /Hybrid Search/i }).first().click();
    await page.waitForTimeout(1000);
    console.log('✓ Switched to Hybrid Search mode');

    // Verify text input appears
    const textInputs = await page.locator('input[type="text"]').all();
    if (textInputs.length === 0) {
      throw new Error('Text input not found in Hybrid mode');
    }
    console.log('✓ Text input visible');

    // Fill search query
    await textInputs[0].fill('machine learning');
    console.log('✓ Query entered');

    // Click Search
    await page.getByRole('button', { name: 'Search' }).first().click();
    console.log('✓ Search clicked');

    // Wait for results
    await page.waitForTimeout(12000);

    // Verify results
    const hasResultsText = await page.getByText('Results:').count() > 0;
    const hasDocResults = await page.getByText(/doc_\d+/).count() > 0;

    console.log(hasResultsText ? '✓ Results displayed' : '✗ No results text');
    console.log(hasDocResults ? '✓ Document results shown' : '✗ No document results');

    // Take screenshot for verification
    await page.screenshot({ path: '/tmp/hybrid-search-validation.png', fullPage: true });
    console.log('✓ Screenshot saved');

    await browser.close();
    process.exit((hasResultsText || hasDocResults) ? 0 : 1);
  } catch (error) {
    console.error('✗ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
EOF

node /tmp/test_hybrid_ui.js
# Expected: Exit code 0, screenshot at /tmp/hybrid-search-validation.png
```

### Test 4: Custom Query Editor UI

```bash
cat > /tmp/test_custom_ui.js << 'EOF';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Switch to Custom Query mode
    await page.getByRole('button', { name: /Custom Query/i }).first().click();
    await page.waitForTimeout(1000);
    console.log('✓ Switched to Custom Query mode');

    // Verify textarea appears
    const textarea = page.locator('textarea');
    const isVisible = await textarea.isVisible();
    console.log(isVisible ? '✓ Query editor visible' : '✗ Query editor not found');

    // Load example query
    await page.getByRole('button', { name: 'Load Example: Match' }).first().click();
    await page.waitForTimeout(500);
    console.log('✓ Example loaded');

    // Execute query
    await page.getByRole('button', { name: 'Execute' }).first().click();
    console.log('✓ Query executed');

    // Wait for results
    await page.waitForTimeout(5000);

    // Check for results or errors
    const hasOutput = await page.locator('text=Results:').or(page.locator('text=Error:')).count() > 0;
    console.log(hasOutput ? '✓ Query output displayed' : '✗ No output');

    await browser.close();
    process.exit(hasOutput ? 0 : 1);
  } catch (error) {
    console.error('✗ Error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
EOF

node /tmp/test_custom_ui.js
# Expected: Exit code 0
```

### Playwright MCP Validation

When Playwright MCP server is connected, you can use MCP tools directly for UI validation:

```javascript
// Using MCP tools for headless browser automation

// 1. Navigate to application
mcp__playwright__browser_navigate?url=http://localhost:3000

// 2. Take snapshot to see current state
mcp__playwright__browser_snapshot

// 3. Interact with UI elements
mcp__playwright__browser_click?ref=BUTTON_REF
mcp__playwright__browser_type?ref=INPUT_REF&text=search+query

// 4. Take screenshot for verification
mcp__playwright__browser_take_screenshot?filename=validation.png&fullPage=true

// 5. Close browser when done
mcp__playwright__browser_close
```

**Complete Hybrid Search UI Validation (Playwright MCP):**
```bash
# This workflow was validated on 2026-01-29
# All features passed successfully

# Test steps executed:
1. Navigate to http://localhost:3000
2. Click "Hybrid Search" button
3. Enter "machine learning" in text input
4. Click "Execute Hybrid Search" button
5. Confirm search execution
6. Verify results are displayed (5 results with HYBRID match type)
7. Verify timing breakdown shows all phases
8. Click "Show ES Request" to verify lance_knn format
9. Take full-page screenshot
```

---

## Common Issues and Solutions {#common-issues-and-solutions}

### Issue 1: Elasticsearch Authentication Failed

**Symptoms:**
```
{"error":{"type":"security_exception","reason":"unable to authenticate user [elastic]"}}
```

**Solution:**
```bash
# Reset password
cd /home/denny/projects/es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT
./bin/elasticsearch-reset-password -u elastic -b

# Update all API routes with new password
NEW_PASSWORD="generated_password"
find app/api -name "*.ts" -exec sed -i "s/elastic:.*'/elastic:$NEW_PASSWORD'/g" {} \;
```

### Issue 2: Lance Vector Plugin - OSS Endpoint Not Set

**Symptoms:**
```
"Invalid user input: OSS endpoint is required. Please provide 'oss_endpoint' in storage options or set OSS_ENDPOINT environment variable"
```

**Cause:**
The Lance Vector Plugin now requires OSS_ENDPOINT environment variable when using `lance_knn` query format.

**Solution:**
```bash
# Kill existing ES process
kill $(cat /path/to/elasticsearch.pid)

# Restart ES with OSS_ENDPOINT environment variable
cd /path/to/elasticsearch-9.2.4-SNAPSHOT
env OSS_ENDPOINT=oss-ap-southeast-1.aliyuncs.com \
     OSS_ACCESS_KEY_ID="YOUR_KEY" \
     OSS_ACCESS_KEY_SECRET="YOUR_SECRET" \
     ./start_es_with_plugins.sh -d -p elasticsearch.pid

# Verify environment variable is set
cat /proc/$(cat elasticsearch.pid)/environ | tr '\0' '\n' | grep OSS_ENDPOINT
# Expected: OSS_ENDPOINT=oss-ap-southeast-1.aliyuncs.com
```

### Issue 3: Lance Vector Plugin Cannot Access OSS

**Symptoms:**
```
"Failed to open Lance dataset: oss://..."
"The bucket you are attempting to access must be addressed using the specified endpoint"
```

**Solution:**
```bash
# Check OSS endpoint in startup script
grep OSS_ENDPOINT /home/denny/projects/es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT/start_es_with_plugins.sh

# For denny-test-lance bucket, should be:
export OSS_ENDPOINT="oss-ap-southeast-1.aliyuncs.com"

# Restart ES after changing endpoint
```

### Issue 4: Hybrid Search Returns 401/500

**Symptoms:**
```json
{"success": false, "error": "Vector search failed: 500 - ..."}
```

**Debug Steps:**
```bash
# 1. Check ES logs
tail -100 /home/denny/projects/es-9.2.4-plugins/build/distribution/local/elasticsearch-9.2.4-SNAPSHOT/elasticsearch.log

# 2. Verify index has lance_vector field
curl -s -u "elastic:PASS" http://localhost:9200/lance-validation-test/_mapping?pretty=true

# 3. Test kNN search directly against ES
curl -s -u "elastic:PASS" -X POST "http://localhost:9200/lance-validation-test/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "knn": {
      "field": "embedding",
      "query_vector": [0.1, 0.2, ...],  // 768 values
      "k": 2,
      "num_candidates": 5
    },
    "size": 2
  }'

# 4. Check dev server logs
tail -100 /tmp/dev-server.log | grep -i error
```

### Issue 5: Jina API Not Working

**Symptoms:**
```json
{"success": false, "error": "JINA_API_KEY environment variable is not set"}
```

**Solution:**
```bash
# Add fallback to Hybrid Search API
# File: app/api/search/hybrid/route.ts
# Line 44: Change:
#   const JINA_API_KEY = process.env.JINA_API_KEY;
# To:
#   const JINA_API_KEY = process.env.JINA_API_KEY || 'your_api_key_here';

# Or set environment variable
export JINA_API_KEY="jina_..."
```

### Issue 6: Playwright Tests Fail on Ubuntu

**Symptoms:**
```
Error: Missing X server or $DISPLAY
```

**Solution:**
```bash
# Always use headless mode
const browser = await chromium.launch({ headless: true });

# NEVER use headed: false or default (which is headed) on Ubuntu servers
```

### Issue 7: Backfill Returns 400 Errors

**Symptoms:**
```json
{"success": false, "error": "Field [_id] is a metadata field..."}
```

**Solution:**
```bash
# This error occurs if _id is included in document body
# Check backfill route bulk indexing code

# Correct structure:
bulkBody.push(
  { index: { _index: esIndex, _id: doc.id } },  // _id here
  {
    id: doc.id,
    title: doc.title,
    // NO _id field here!
  }
);
```

---

## Regression Test Checklist {#regression-test-checklist}

Use this checklist for quick regression testing before committing changes or releasing updates.

### Pre-Test Setup
- [ ] Elasticsearch is running (`curl -u elastic:PASS localhost:9200/_cluster/health`)
- [ ] Next.js dev server is running (`curl localhost:3000`)
- [ ] OSS credentials are configured (`cat ~/.oss/credentials.json`)
- [ ] Test dataset exists (`curl localhost:3000/api/vectors/list`)

### Quick Smoke Tests (5 minutes)

```bash
# Test 1: kNN Search
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "k": 3}' | jq '.success'
# Expected: true

# Test 2: Hybrid Search
curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "test", "k": 3}' | jq '.success'
# Expected: true

# Test 3: Vector List
curl -s http://localhost:3000/api/vectors/list | jq '.success'
# Expected: true
```

### Full Regression Tests (15 minutes)

#### Vector Management
- [ ] Generate dataset returns success
- [ ] List datasets shows new dataset
- [ ] Fetch dataset returns documents with all fields
- [ ] Delete dataset removes it from list

#### kNN Search
- [ ] Basic search returns results
- [ ] Results have proper structure (id, category, score)
- [ ] Results are ordered by score (descending)
- [ ] Profiling returns timing breakdown

#### Hybrid Search
- [ ] Text search returns results
- [ ] Vector search returns results
- [ ] RRF fusion combines results
- [ ] Match type indicators are correct (text/vector/hybrid)
- [ ] Query vector has 768 dimensions
- [ ] Timing breakdown shows all phases
- [ ] **Vector Search timing includes `lance_vector_query_ms` field**
- [ ] **ES profile shows `LanceKnnQuery` type (not `KnnQuery`)**
- [ ] **Frontend "Show ES Request" displays `lance_knn` format**
- [ ] **esProfile raw data is returned in response**

#### Backfill
- [ ] Backfill creates ES index
- [ ] Index has lance_vector field
- [ ] Documents are indexed (count matches)
- [ ] Documents have metadata but no vector field

#### UI Tests (Headless Playwright)
- [ ] kNN Search mode works
- [ ] Hybrid Search mode works
- [ ] Custom Query mode works
- [ ] Mode switching updates UI correctly
- [ ] Search buttons trigger correct API calls

### Performance Checks

```bash
# Hybrid Search should complete in < 15 seconds
time curl -s -X POST http://localhost:3000/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"queryText": "machine learning", "k": 5}' > /dev/null
# Expected: < 15s

# kNN Search should complete in < 10 seconds
time curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "k": 5}' > /dev/null
# Expected: < 10s
```

### Post-Test Cleanup

```bash
# Remove test indices
ES_PASSWORD="your_password"
curl -s -u "elastic:$ES_PASSWORD" -X DELETE http://localhost:9200/test-*

# Keep only production datasets
# (Optional) Delete test datasets
```

---

## Automated Test Script {#automated-test-script}

For complete automation, save this script as `run-validation.sh`:

```bash
#!/bin/bash
set -e

echo "=== Lance Vector Demo Validation ==="
echo ""

# Configuration
ES_PASSWORD="${ES_PASSWORD:-your_es_password}"
DATASET_NAME="validation-test-$(date +%s)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

# Test helpers
test_api() {
  local name="$1"
  local cmd="$2"
  local expected="$3"

  echo -n "Testing: $name... "
  result=$(eval "$cmd" 2>/dev/null)

  if echo "$result" | grep -q "$expected"; then
    pass "$name"
    return 0
  else
    fail "$name - Expected: $expected, Got: $result"
  fi
}

# Check prerequisites
echo "=== Checking Prerequisites ==="
curl -s http://localhost:3000 > /dev/null && pass "Next.js server running" || fail "Next.js server not running"
curl -s -u "elastic:$ES_PASSWORD" http://localhost:9200/_cluster/health > /dev/null && pass "Elasticsearch running" || fail "Elasticsearch not running"
echo ""

# Run tests
echo "=== Running API Tests ==="
test_api "kNN Search" \
  "curl -s -X POST http://localhost:3000/api/search -H 'Content-Type: application/json' -d '{\"query\": \"test\", \"k\": 3}'" \
  '"success": true'

test_api "Hybrid Search" \
  "curl -s -X POST http://localhost:3000/api/search/hybrid -H 'Content-Type: application/json' -d '{\"queryText\": \"test\", \"k\": 3}'" \
  '"success": true'

test_api "Vector List" \
  "curl -s http://localhost:3000/api/vectors/list" \
  '"success": true'

echo ""
echo "=== Running UI Tests ==="
# Run Playwright tests
node /tmp/test_knn_ui.js && pass "kNN Search UI" || fail "kNN Search UI"
node /tmp/test_hybrid_ui.js && pass "Hybrid Search UI" || fail "Hybrid Search UI"
node /tmp/test_custom_ui.js && pass "Custom Query UI" || fail "Custom Query UI"

echo ""
echo "=== All Tests Passed! ==="
```

Make executable:
```bash
chmod +x run-validation.sh
./run-validation.sh
```

---

## Conclusion {#conclusion}

This validation guide provides:
1. **Comprehensive test coverage** for all features
2. **Step-by-step procedures** with expected outputs
3. **Troubleshooting guide** for common issues
4. **Automated test scripts** for regression testing
5. **UI testing guidelines** for headless environments

Follow this guide to ensure the Lance Vector Plugin demo application continues working correctly through code changes, updates, and deployments.

For issues or questions, refer to:
- `CLAUDE.md` - Project-specific guidance
- `README.md` - General project information
- Elasticsearch logs: `/path/to/elasticsearch.log`
- Dev server logs: `/tmp/dev-server.log`

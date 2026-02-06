# Lance Vector Plugin Demo (es-lance-demo)

A Next.js application demonstrating the Lance Vector Plugin for Elasticsearch, featuring kNN search, hybrid search (BM25 + vector), and OpenTelemetry tracing.

## Quick Start

```bash
# Start the full stack (ES + Kibana + Demo UI)
./starter_project.sh

# Access the demo
open http://localhost:3000
```

## Features

- **kNN Vector Search**: Pure vector similarity search using Lance datasets stored in OSS
- **Hybrid Search**: Combines BM25 text search with vector search using RRF fusion
- **Dataset Management**: Generate, upload, and manage Lance datasets in Alibaba Cloud OSS
- **OpenTelemetry Tracing**: Full observability with traces exported directly to Elasticsearch

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Next.js Lance Demo                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Frontend (React + Tailwind)                                │   │
│  │    - Dataset Management UI                                  │   │
│  │    - Search Interface (kNN / Hybrid)                        │   │
│  │    - Results Visualization                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  API Routes                                                 │   │
│  │    - /api/vectors/* (list, generate, metadata, sample)      │   │
│  │    - /api/search (kNN search)                               │   │
│  │    - /api/search/hybrid (BM25 + vector fusion)              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  OpenTelemetry SDK                                          │   │
│  │    - Custom ES Exporter → traces-lance-* index              │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┴─────────────────────┐
         ▼                                           ▼
┌─────────────────────┐                   ┌─────────────────────┐
│  Alibaba Cloud OSS  │                   │   Elasticsearch     │
│  └── datasets/*.lance│                   │  ├── lance-* index  │
└─────────────────────┘                   │  └── traces-lance-* │
                                          └─────────────────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │      Kibana         │
                                          │  └── Discover/APM   │
                                          └─────────────────────┘
```

## Prerequisites

- Node.js v18+
- Python 3.10+ with `numpy`, `lancedb`, `pyarrow`, `oss2`
- Elasticsearch 9.2.4 with Lance Vector Plugin
- OSS credentials in `~/.oss/credentials.json`

## Viewing OpenTelemetry Traces in Kibana

### Method 1: Kibana Discover (Recommended)

1. **Open Kibana**: Navigate to http://localhost:5601

2. **Go to Discover**: Click the hamburger menu (☰) → Analytics → Discover

3. **Select Data View**:
   - Click the data view dropdown (top-left, may show "logs-*")
   - Select **"Lance Traces"** data view
   - If not available, create it (see below)

4. **View Traces**:
   - Set time range to "Last 15 minutes" or "Last 1 hour"
   - You'll see trace documents with fields:
     - `@timestamp` - When the trace occurred
     - `trace.id` - Unique trace identifier
     - `span.name` - Operation name (e.g., `lance.search.knn`)
     - `span.duration_ms` - How long the operation took
     - `service.name` - Always "lance-demo"

5. **Filter by Span Type**:
   ```
   span.name: "lance.search.knn"        # kNN search traces
   span.name: "lance.search.hybrid"     # Hybrid search traces
   span.name: "elasticsearch.search.*"  # ES query spans
   span.name: "jina.embedding.generate" # Embedding generation
   ```

### Method 2: Create Data View (if "Lance Traces" doesn't exist)

1. Go to **Stack Management** → **Data Views**
2. Click **Create data view**
3. Configure:
   - **Name**: `Lance Traces`
   - **Index pattern**: `traces-lance-*`
   - **Timestamp field**: `@timestamp`
4. Click **Save data view to Kibana**

### Method 3: Direct ES Query

```bash
# Get recent traces
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/traces-lance-*/_search?size=10&sort=@timestamp:desc" \
  -H "Content-Type: application/json" | jq '.hits.hits[]._source'

# Count traces by span name
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/traces-lance-*/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "size": 0,
    "aggs": {
      "span_names": {
        "terms": { "field": "span.name.keyword", "size": 20 }
      }
    }
  }' | jq '.aggregations.span_names.buckets'

# Get trace timeline for a specific trace ID
TRACE_ID="your-trace-id-here"
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/traces-lance-*/_search" \
  -H "Content-Type: application/json" \
  -d "{\"query\":{\"term\":{\"trace.id\":\"$TRACE_ID\"}},\"sort\":[{\"span.start_time\":{\"order\":\"asc\"}}]}" \
  | jq '.hits.hits[]._source | {name: .span.name, duration_ms: .span.duration_ms}'
```

### Trace Span Hierarchy

**kNN Search** (`lance.search.knn`):
```
lance.search.knn (root span)
├── elasticsearch.search.knn   # ES query with lance_knn
└── lance.search.python        # Python subprocess timing
```

**Hybrid Search** (`lance.search.hybrid`):
```
lance.search.hybrid (root span)
├── jina.embedding.generate    # Query embedding
├── elasticsearch.search.bm25  # Text search
├── elasticsearch.search.knn   # Vector search
└── search.fusion.rrf          # RRF fusion
```

### Key Trace Attributes

| Attribute | Description |
|-----------|-------------|
| `trace.id` | Unique identifier linking all spans in a request |
| `span.id` | Unique identifier for this span |
| `parent.id` | Parent span ID (for child spans) |
| `span.name` | Operation name |
| `span.duration_ms` | Duration in milliseconds |
| `span.kind` | SERVER, CLIENT, or INTERNAL |
| `service.name` | Always "lance-demo" |
| `http.method` | HTTP method (POST) |
| `http.url` | API endpoint path |
| `search.k` | Number of results requested |
| `search.dataset` | Dataset name used |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vectors/list` | GET | List all datasets in OSS |
| `/api/vectors/generate` | POST | Generate new dataset |
| `/api/vectors/metadata` | POST | Get dataset metadata |
| `/api/vectors/sample` | POST | Sample random vectors |
| `/api/vectors/documents` | POST | Fetch documents |
| `/api/search` | POST | kNN vector search |
| `/api/search/hybrid` | POST | Hybrid BM25 + vector search |

## Memory Usage

Typical memory footprint:

| Component | Memory | Notes |
|-----------|--------|-------|
| Elasticsearch | ~16GB | Configured heap: 15.5GB |
| Next.js (dev) | ~4GB | Includes Turbopack |
| Kibana (dev) | ~1.8GB | Development mode |
| Python backend | ~190MB | FastAPI for dataset generation |

### Monitoring Memory

```bash
# Check ES heap usage
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/_nodes/stats/jvm" \
  | jq '.nodes | to_entries[0].value.jvm.mem.heap_used_percent'

# Check ES GC activity
curl -s -k -u elastic:Summer11 \
  "https://127.0.0.1:9200/_nodes/stats/jvm" \
  | jq '.nodes | to_entries[0].value.jvm.gc.collectors'
```

## Troubleshooting

See `reg_validation_guide.md` for comprehensive troubleshooting and known issues.

## License

Internal use only.

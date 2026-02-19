# Design Spec: Demo UI Server NT Scale (v2.1)

## 1. Architecture
The implementation remains in the current Next.js architecture and adds a capability layer across API + UI.

### 1.1 UI Layer
- `features/live-demo/ui/live-demo.tsx`
  - orchestrates dataset profile, capability state, NRT panel interactions.
- `features/live-demo/ui/search-controls.tsx`
  - adds `nprobes` and prefilter controls.
- `features/live-demo/ui/results-display.tsx`
  - renders runtime evidence chips at summary and per-result levels.

### 1.2 API Layer
- `app/api/search/route.ts`
  - lance knn request path with filter/nprobes support + fallback behavior.
- `app/api/search/hybrid/route.ts`
  - text + vector + fusion path with same capability contract.
- `app/api/lance/stats/route.ts`
- `app/api/lance/refresh/route.ts`
- `app/api/lance/refresh-config/route.ts`

### 1.3 Shared Helpers
- `lib/search-capabilities.ts`
  - query-building and evidence normalization helpers.
- `lib/dataset-profile.ts`
  - dataset index/profile resolution.

## 2. Data Contracts

### 2.1 Search Request Extensions
```json
{
  "dataset": "real-87k-dims-768",
  "k": 5,
  "numCandidates": 10,
  "filter": { "term": { "category": "ai" } },
  "nprobes": 20,
  "refreshState": "fresh",
  "shardingStrategy": "ES_ROUTING",
  "datasetProfile": { "shardingStrategy": "ES_ROUTING" }
}
```

### 2.2 Search Evidence Contract
```json
{
  "evidence": {
    "shard_mode": "ES_ROUTING",
    "prefilter_mode": "pushdown",
    "refresh_state": "fresh",
    "nprobes": 20,
    "nprobes_applied": true,
    "prefilter_reason": "query_parse_exception"
  }
}
```

### 2.3 NRT API Contracts
- `GET /api/lance/stats?dataset=<name>`
  - returns docs count, refresh counters, refresh interval, shard count, refresh_state.
- `POST /api/lance/refresh`
  - triggers `_refresh` and returns refresh state.
- `GET /api/lance/refresh-config`
  - returns current `refresh_interval`.
- `PUT /api/lance/refresh-config`
  - updates `refresh_interval`.

## 3. Query/Fallback Design
1. Build primary lance_knn query with optional filter + nprobes.
2. If request fails:
   - retry without nprobes.
   - retry without filter.
3. Emit evidence to reflect final execution path:
   - `prefilter_mode=pushdown` when filter is applied.
   - `prefilter_mode=fallback` when degraded.

This keeps demos stable while still surfacing capability limits explicitly.

## 4. UI Composition
1. Dataset selector (existing).
2. NRT panel (new): stats, manual refresh, refresh interval.
3. Search controls (enhanced): mode, topK, nprobes, prefilter, profiling.
4. Results area (enhanced): timing, ES request, runtime evidence, result details.

## 5. Error Handling
1. NRT errors shown in NRT panel only; search remains available.
2. Search fallback keeps response alive and marks reason in evidence.
3. Hard failures return explicit API errors for missing index/dataset.

## 6. Verification Strategy
1. Unit-level helper tests:
   - `tests/search-capabilities.test.ts`
2. Build verification:
   - `npm run build` in demo-ui repo.
3. Runtime regression:
   - startup via `starter_project.sh`
   - execute checks from `reg_validation_guide.md`.

## 7. Operational Notes
1. Always use `starter_project.sh` for start/restart of ES + Kibana + Demo UI.
2. Keep absolute paths in starter and validation guide synchronized.
3. For live demos, pre-run one query and one refresh to warm paths.

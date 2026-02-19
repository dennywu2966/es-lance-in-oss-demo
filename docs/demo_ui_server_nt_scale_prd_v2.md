# PRD: Demo UI Server NT Scale (v2.1)

## 1. Product Summary
This PRD defines a production-ready demo flow for Lance plugin capabilities in the Demo UI server. The page must make multi-sharding behavior, prefilter fallback, and near-real-time refresh state visible without requiring devtools.

## 2. Environment Baseline
- Demo UI root: `/home/denny/projects/es-lance-demo/.worktrees/demo-ui-nt-scale-plan`
- Elasticsearch root: `/home/denny/projects/es-9.2.4-plugins-rt-scale`
- Kibana root: `/home/denny/projects/kibana-9.2.4`
- Stack startup script: `/home/denny/projects/es-lance-iam-demo/.worktree/es-lance-rt-scale-iam-demo/starter_project.sh`

## 3. Goals
1. Complete full demo walkthrough in under 10 minutes.
2. Display runtime evidence for shard mode, prefilter mode, and refresh state in UI cards.
3. Keep backward compatibility for existing kNN/hybrid flows.
4. Ensure validation can be executed from `reg_validation_guide.md` with repeatable commands.

## 4. Functional Scope
### 4.1 Dataset/Profile
- Persist and consume dataset profile metadata (`shard_count`, `sharding_strategy`, `dataset_name`, `shard_path`).
- Auto-apply selected dataset profile during backfill and search.

### 4.2 Search Controls
- Add `nprobes` control for vector query tuning.
- Add prefilter controls (`filter field` + `filter value`) with on/off toggle.
- Preserve existing `k`, profiling, and kNN/hybrid mode toggles.

### 4.3 Search API Contracts
- `POST /api/search`
  - Accept: `filter`, `nprobes`, `refreshState`, `shardingStrategy`, `datasetProfile`.
  - Return: `evidence` object and result-level evidence fields.
- `POST /api/search/hybrid`
  - Accept: same runtime controls as above.
  - Return: fused results + `timingBreakdown` + `evidence`.

### 4.4 NRT Capability APIs
- `GET /api/lance/stats`
- `POST /api/lance/refresh`
- `GET|PUT /api/lance/refresh-config`

### 4.5 UI Runtime Evidence
Result view must display:
- `shard_mode`
- `prefilter_mode`
- `refresh_state`
- optional `prefilter_reason`
- optional `nprobes`/`nprobes_applied`

## 5. User Experience Requirements
1. Chinese-first labels for new capability controls.
2. Existing visual language retained.
3. Mobile-safe layout (panels stack, no clipping).
4. Error states are non-blocking and localized to relevant panel.

## 6. Non-Goals
1. No new vector algorithm implementation in Elasticsearch plugin.
2. No redesign of unrelated sections.
3. No cross-cluster orchestration.

## 7. Acceptance Criteria
1. Demo page exposes prefilter and nprobes controls and includes runtime evidence chips.
2. NRT panel supports stats/read, manual refresh, and refresh interval update.
3. Search APIs provide evidence metadata consistently for kNN and hybrid.
4. `starter_project.sh` is used for stack start/restart in all validation flows.
5. All required checks in `reg_validation_guide.md` pass on the target environment.

## 8. Risks and Mitigations
1. **Risk:** filter or nprobes not supported by a plugin query variant.
   **Mitigation:** graceful fallback and explicit `prefilter_mode=fallback` evidence.
2. **Risk:** environment drift across worktrees.
   **Mitigation:** centralize absolute paths in starter/guide and verify during regression.
3. **Risk:** stale index visibility during demos.
   **Mitigation:** NRT panel with manual refresh + refresh interval management.

## 9. Rollout Plan
1. Land API and UI capability changes.
2. Update docs and validation guide.
3. Run startup and full regression via `starter_project.sh` + regression scripts.
4. Freeze validated baseline for demo rehearsal.

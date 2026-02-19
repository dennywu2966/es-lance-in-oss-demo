# Demo Server UI 增强方案（Multi-Sharding / NRT / Prefiltering）

## 1. 目标
把当前 `es-lance-demo` 的 Live Demo 从“可搜索演示”升级为“核心能力演示台”，可在 UI 中清晰演示以下新能力：

1. 多分片（multi-sharding）
2. 近实时刷新（NRT）
3. 预过滤（prefiltering）

并且支持中文演示脚本与中文 UI 文案（至少演示页内关键控件与说明为中文）。

同时满足以下硬约束：

1. 创建/上传数据集时必须可指定 `shard_count` 与 `sharding_strategy`（`NONE | ES_ROUTING`）。
2. 选择数据集后必须自动识别上述配置，并用于 mapping 更新与后续 kNN/Hybrid 查询。
3. 中文字体可读（避免当前中文显示不清晰问题）。
4. 实施时保持现有 UI 视觉体系，不与核心功能改动混合做风格改版。

## 2. 依据与现状（来自两套代码）

### 2.1 `es-9.2.4-plugins-rt-scale`（插件能力基线）

1. **多分片能力已在插件层提供**
- `LanceStorageConfig` 支持 `uri_prefix + shard_path + dataset_name` 的 shard-aware 模式；支持 `sharding_strategy: NONE | ES_ROUTING`。
- 见：
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/mapper/LanceStorageConfig.java`
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/query/LanceKnnQuery.java`

2. **NRT 刷新能力已提供**
- 配置：`lance.refresh.enabled`、`lance.refresh.interval`。
- 手动触发：`POST /_lance/refresh`。
- 统计：`GET /_lance/stats`。
- 见：
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/LanceVectorPlugin.java`
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/storage/LanceRefreshService.java`
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/rest/RestLanceRefreshAction.java`
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/rest/RestLanceStatsAction.java`

3. **Prefiltering 已有“可下推 + 回退”框架**
- `EsToLanceFilterConverter` v1 支持 `term` 转 SQL，失败后回退 ES post-filter。
- 需 `storage.field_mapping`。
- 见：
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/query/EsToLanceFilterConverter.java`
  - `plugins/lance-vector/src/main/java/org/elasticsearch/plugin/lance/query/LanceKnnQuery.java`

### 2.2 `es-lance-iam-demo`（演示流程经验）

1. 已沉淀“数据集下拉、刷新、性能展示、API 回归”的演示路径。
- 见：
  - `regression-tests/run_comprehensive_regression.py`
  - `reg_validation_guide.md`

2. 对当前 demo 形态有可复用经验：
- Dataset Dropdown
- Profiling 展示
- Search / Hybrid 的可视化验证

### 2.3 当前 `es-lance-demo` 状态

1. 已有 Live Demo 组件与 Dataset 选择：
- `features/live-demo/ui/live-demo.tsx`
- `features/live-demo/ui/search-controls.tsx`
- `features/live-demo/ui/results-display.tsx`

2. 当前搜索 API 主要是基础 Lance kNN / Hybrid：
- `app/api/search/route.ts`
- `app/api/search/hybrid/route.ts`

3. 当前 backfill 会创建每数据集索引，但 mapping 仍是单 URI 方式：
- `app/api/vectors/backfill/route.ts`

4. 已有每数据集索引 + alias 快速切换基础（可复用），但缺少“数据集配置元信息”契约：
- 数据集缺少 `shard_count/sharding_strategy` 的持久化元数据
- 导致切换后无法稳定复用同一套配置驱动 backfill/mapping/search

## 3. 总体方案

新增一个“核心能力演示模式（Advanced Demo）”，在现有 Live Demo 上方或同级增加一个“能力控制面板（中文）”，包含 3 个子面板：

1. 多分片演示面板
2. NRT 刷新演示面板
3. Prefiltering 演示面板

并新增后端代理接口，把插件能力以“可控 + 可观测”的方式暴露给前端。

同时引入 **Dataset Profile 元信息契约**（随数据集上传）：

- `shard_count`
- `sharding_strategy`
- `shard_path`（可选）
- `dataset_name`（可选，默认 `data.lance`）

前端在 dataset 选中时读取 profile，后端 backfill/mapping/search 全链路使用同一份 profile，避免“UI 配置与索引配置不一致”。

## 4. 详细设计

## 4.1 多分片（Multi-Sharding）演示

### 4.1.1 后端改造
扩展 `app/api/vectors/backfill/route.ts` 的请求参数：

- `numberOfShards: number`
- `shardAware: boolean`
- `uriPrefix: string`
- `shardPath: string`（默认 `"{index}/shard-{shard_id}"`）
- `datasetName: string`（默认 `"data.lance"`）
- `shardingStrategy: "NONE" | "ES_ROUTING"`
- `fieldMapping: string`（例如 `"category=category,topic=topic"`）

并新增/统一数据集元信息源（推荐 `datasets/{dataset}/dataset.meta.json`）：

- 在“生成并上传”阶段写入 profile（包含 `shard_count`、`sharding_strategy`）。
- `/api/vectors/list` 返回时携带该 profile 字段。
- Live Demo 选中数据集后无需手工二次输入 shard 参数。

创建索引时：

1. `settings.number_of_shards = numberOfShards`
2. `embedding.storage` 根据 `shardAware` 选择：
- false：保留当前 `uri`
- true：使用 `uri_prefix + shard_path + dataset_name + sharding_strategy`

索引复用策略（高优先级）：

1. 继续使用“每数据集独立 index + alias 指向当前 index”。
2. 切换数据集优先 O(1) alias 切换，不删除已有索引与 Lance 数据集。
3. 若检测到 profile 与现有 index mapping/settings 不一致，再做该数据集索引重建（仅重建该数据集，不影响其他数据集）。

### 4.1.2 前端改造
在 Live Demo 中新增“多分片配置卡片”（中文）：

- 分片数（1/2/4/8）
- 路由策略（ES_ROUTING / NONE）
- 存储路径模板预览
- “重建并切换索引”按钮

在“创建/上传数据集”流程新增输入（中文）：

- 分片数（`shard_count`）
- 分片算法（`sharding_strategy`：`NONE` / `ES_ROUTING`）

结果区新增“分片演示摘要”：

- 当前 index
- number_of_shards
- sharding_strategy
- 是否 shard-aware

### 4.1.3 演示脚本（中文）

1. 先用 `1 shard + NONE` 跑一次查询作为基线。
2. 切换到 `4 shards + ES_ROUTING`，重建索引。
3. 重复同查询，对比 latency 与命中行为。

## 4.2 NRT 演示

### 4.2.1 新增后端 API（Next.js 代理）
新增：

1. `GET /api/lance/stats` → 代理 `GET /_lance/stats`
2. `POST /api/lance/refresh` → 代理 `POST /_lance/refresh`
3. `GET /api/lance/refresh-config` → 读取 `lance.refresh.enabled / lance.refresh.interval`
4. `PUT /api/lance/refresh-config` → 写入（cluster settings）

说明：这里由 demo server 统一处理鉴权和 TLS 配置，前端不直接打 ES。

### 4.2.2 前端改造
新增“NRT 控制卡片”（中文）：

- 自动刷新开关（enabled/disabled）
- 刷新间隔输入（如 `5s`, `30s`, `1m`）
- 手动刷新按钮（触发 `/api/lance/refresh`）
- 刷新结果与时间戳提示

新增“NRT 观测区域”：

- cache.size
- memory.allocated_mb
- health
- recent refresh status

### 4.2.3 演示脚本（中文）

1. 关闭自动刷新，执行一次搜索。
2. 进行数据变更（可通过已有 backfill/数据生成流程）。
3. 点击“手动刷新”，再次搜索，展示刷新后可见性变化。

## 4.3 Prefiltering 演示

### 4.3.1 后端改造
扩展 `app/api/search/route.ts` 请求体：

- `filter?: object | object[]`
- `nprobes?: number`

构造 `lance_knn` 查询时将 `filter` 透传到 DSL（与插件 builder 对齐）。

Hybrid 接口 `app/api/search/hybrid/route.ts` 的向量查询部分同步支持 filter 透传。

并统一索引解析规则：

- kNN 与 Hybrid 都按“选中 dataset -> 解析到对应数据集 index/profile”执行。
- 不依赖“全局单索引假设”；alias 仅作为切换加速机制，不作为唯一数据路由依据。

### 4.3.2 前端改造
新增“Prefilter 控制卡片”（中文）：

- 字段选择（如 `category`、`topic`）
- 条件值输入（term）
- 过滤开关
- nprobes 调节（可选）

并在“Show ES Request”中展示最终 DSL，明确看到 `filter` 是否下发。

### 4.3.3 观测与说明

首版以“term filter + field_mapping”作为可演示主路径：

- 能转换：显示“预过滤候选（Lance SQL）”提示
- 不能转换：显示“回退到 ES post-filter”提示

可通过 `/api/lance/stats` 的 search 指标与 profiling 辅助对比（并在 UI 文案中明确“统计口径以插件实现为准”）。

## 5. 中文化与交互要求

演示页新增文案统一中文：

- “核心能力演示”
- “多分片配置”
- “近实时刷新（NRT）”
- “预过滤（Prefilter）”
- “手动刷新 Lance 缓存”
- “当前策略 / 当前分片数 / 查询回退状态”

保留技术关键词英文（NRT、Prefilter、ES_ROUTING）以便技术受众对应代码与配置。

字体要求：

1. 保持当前 UI 视觉风格不变，仅修复字体栈。
2. 增加中文可读字体 fallback（例如 `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`）。
3. 避免中文标签强制使用不支持 CJK 的 mono 字体。

## 6. 文件级实施清单（`es-lance-demo`）

### 6.1 重点修改

1. `features/live-demo/ui/live-demo.tsx`
- 新增 Advanced Demo 状态与 3 个能力卡片
- 统一串联新 API

2. `features/live-demo/ui/search-controls.tsx`
- 扩展 filter / nprobes / capability-aware 控件

3. `features/live-demo/ui/results-display.tsx`
- 增加能力观测区（分片/NRT/prefilter 状态）

4. `app/api/search/route.ts`
- 支持 filter、nprobes、能力透传

5. `app/api/search/hybrid/route.ts`
- 向量检索部分支持 filter 透传

6. `app/api/vectors/backfill/route.ts`
- 支持 shard-aware mapping 与分片配置

7. `features/vector-mgmt/ui/vector-management.tsx`
- 生成数据集弹窗新增 `shard_count` / `sharding_strategy` 输入

8. `features/vector-mgmt/api/dataset-client.ts`
- 扩展 dataset profile 字段与 generate 请求参数

9. `lib/oss-client.ts` + `backend/services/oss.py`
- `listDatasets` 读取并返回 `dataset.meta.json`

10. `app/layout.tsx` + `app/globals.css`
- 增加中文字体 fallback，修复中文不可读问题

### 6.2 新增文件

1. `app/api/lance/stats/route.ts`
2. `app/api/lance/refresh/route.ts`
3. `app/api/lance/refresh-config/route.ts`
4. `features/live-demo/model/capability-types.ts`（或同等类型文件）
5. `datasets/{dataset}/dataset.meta.json`（OSS 侧对象，不一定落库到 repo）

## 7. 验证计划

## 7.1 API 验证

1. 分片场景
- 创建 1 shard 与 4 shard 两种索引成功
- mapping 中 `storage.sharding_strategy` 正确
- list API 返回对应 dataset profile（`shard_count`、`sharding_strategy`）

2. NRT 场景
- `/api/lance/refresh` 返回 acknowledged
- `/api/lance/stats` 有效返回 cache/memory/search

3. Prefilter 场景
- 带 `filter` 请求返回 200
- 复杂 filter 无法下推时不报错，回退路径可用

4. 切换场景
- 切换 dataset 不删除已有 index 与 Lance 数据集
- alias 快速切换成功
- kNN 与 Hybrid 都使用当前选中 dataset 的 index/profile

## 7.2 UI 验证（建议 Playwright）

1. 三个能力卡片可见且交互可用
2. 参数变更后“Show ES Request”准确反映 DSL
3. 中文文案完整、不出现关键空态英文混杂
4. Demo 路径可从头到尾走通（配置→搜索→观测）
5. 中文字体在主要浏览器可读（无方块字/重叠）
6. 新增能力控件不引入新的视觉风格（颜色、组件、间距沿用现有样式体系）

## 8. 风险与前置依赖

1. **Prefilter 口径风险**
- 当前插件实现中，部分 pre/post 统计与 heuristic 使用可能仍在演进；UI 需标注“按插件实际返回为准”。

2. **分片数据准备风险**
- 若 OSS 数据布局未按 shard-aware 规则组织，multi-sharding 演示会退化或不成立。

3. **刷新配置权限风险**
- 修改 cluster settings 需要权限；若权限不足，UI 要给出明确错误提示和降级方案。

## 9. 实施里程碑

### 阶段 A（1-2 天）：后端能力打通
- 新增 lance 代理 API
- backfill 支持 shard-aware mapping
- search/hybrid 支持 filter 透传

### 阶段 B（1-2 天）：前端演示台
- 三能力卡片 + 中文文案
- 观测面板 + 错误提示

### 阶段 C（1 天）：回归与演示脚本固化
- API + UI 联调
- Playwright 验证
- 输出最终演示步骤文档

## 10. 完成定义（DoD）

满足以下条件即完成：

1. 可以在 UI 中切换并展示 multi-sharding 配置效果。
2. 可以在 UI 中配置 NRT 并手动触发 refresh，看到 stats 变化。
3. 可以在 UI 中构建 term filter 并演示 prefilter 路径或回退路径。
4. 全套能力演示流程可用中文讲解完成。
5. 创建/上传数据集时可设置 `shard_count` 与 `sharding_strategy`，且选择后自动生效。
6. 切换数据集无需删除历史索引/数据集，保持高效切换。
7. 中文字体可读，且未引入额外风格改版。

import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/oss-client";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { datasetIndexName, resolveDatasetProfile, type ShardingStrategy } from "@/lib/dataset-profile";
import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";

const execAsync = promisify(exec);

interface BackfillRequest {
  dataset?: string;
  esIndex?: string;
  createIndex?: boolean;
  forceRecreate?: boolean;  // Delete index before creating (needed when switching datasets)
  dims?: number;            // Vector dimensions for lance_vector field (default 768)
  shardCount?: number;
  shardingStrategy?: 'NONE' | 'ES_ROUTING' | string;
  shardPath?: string;
  datasetName?: string;
  uriPrefix?: string;
  fieldMapping?: string;
}

interface DocumentMetadata {
  _id: string;
  id: string;
  title: string;
  text: string;
  topic: string;
  category: string;
}

interface LanceEmbeddingStorageConfig {
  uri?: string;
  uri_prefix?: string;
  shard_path?: string;
  dataset_name?: string;
}


// Create Elasticsearch index with proper mapping for metadata + lance_vector field
async function createESIndex(
  esIndex: string,
  datasetUri: string | undefined,
  dims: number,
  options: {
    shardCount: number;
    shardingStrategy: ShardingStrategy;
    shardPath?: string;
    datasetName?: string;
    uriPrefix?: string;
    fieldMapping?: string;
  }
): Promise<void> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;

  // Ignore self-signed certificates for local ES
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const properties: any = {
    id: { type: "keyword" },
    title: {
      type: "text",
      fields: {
        keyword: { type: "keyword" }
      }
    },
    text: {
      type: "text",
      fields: {
        keyword: { type: "keyword" }
      }
    },
    topic: { type: "keyword" },
    category: { type: "keyword" },
    dataset: { type: "keyword" }
  };

  // Add lance_vector field if dataset URI is provided
  if (datasetUri) {
    const storage: Record<string, any> = {
      type: "external",
      lance_id_column: "_id",
      lance_vector_column: "vector",
      read_only: true,
      sharding_strategy: options.shardingStrategy,
    };

    if (options.fieldMapping) {
      storage.field_mapping = options.fieldMapping;
    }

    // Shard-aware path is optional; default to legacy URI mode for compatibility
    if (options.uriPrefix) {
      storage.uri_prefix = options.uriPrefix;
      storage.shard_path = options.shardPath || `${esIndex}/shard-{shard_id}`;
      storage.dataset_name = options.datasetName || "data.lance";
    } else {
      storage.uri = datasetUri;
    }

    properties.embedding = {
      type: "lance_vector",
      dims,
      storage,
    };
  }

  const mapping = {
    settings: {
      number_of_shards: Math.max(1, Math.floor(options.shardCount)),
      number_of_replicas: 0,
    },
    mappings: {
      properties
    }
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (ES_SECURITY_ENABLED) {
    headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
  }

  const response = await fetch(`${ES_HOST}/${esIndex}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(mapping)
  });

  if (!response.ok && response.status !== 400) {
    // 400 might mean index already exists, which is ok
    throw new Error(`Failed to create ES index: ${response.status} ${response.statusText}`);
  }
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Delete Elasticsearch index (used when switching datasets to update lance_uri mapping)
async function deleteESIndex(esIndex: string): Promise<void> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;

  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const headers: Record<string, string> = {};
    if (ES_SECURITY_ENABLED) {
      headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
    }

    const response = await fetch(`${ES_HOST}/${esIndex}`, {
      method: 'DELETE',
      headers,
    });

    // 404 is fine — index might not exist yet
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete ES index: ${response.status} ${response.statusText}`);
    }
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Check if an ES index exists
async function indexExists(esIndex: string): Promise<boolean> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const headers: Record<string, string> = {};
    if (ES_SECURITY_ENABLED) headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
    const response = await fetch(`${ES_HOST}/${esIndex}`, { method: 'HEAD', headers });
    return response.ok;
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Update alias to point to a different index (atomic switch)
// Removes alias from all indices and adds to the target index
const LANCE_ALIAS = 'lance-validation-test';

async function updateAlias(targetIndex: string): Promise<void> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ES_SECURITY_ENABLED) headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;

    // Check if an INDEX (not alias) exists with the alias name — if so, delete it first
    // This handles migration from the old single-index approach
    const checkIndexResponse = await fetch(`${ES_HOST}/${LANCE_ALIAS}`, { method: 'HEAD', headers });
    if (checkIndexResponse.ok) {
      // Check if it's an actual index or an alias by trying to get alias info
      const aliasCheckResponse = await fetch(`${ES_HOST}/_alias/${LANCE_ALIAS}`, { method: 'GET', headers });
      if (!aliasCheckResponse.ok || aliasCheckResponse.status === 404) {
        // It's an index, not an alias — delete it to make way for the alias
        console.log(`Deleting old index "${LANCE_ALIAS}" to migrate to alias-based approach...`);
        await fetch(`${ES_HOST}/${LANCE_ALIAS}`, { method: 'DELETE', headers });
      }
    }

    // Get current indices with this alias (may be empty after migration)
    const aliasResponse = await fetch(`${ES_HOST}/_alias/${LANCE_ALIAS}`, { method: 'GET', headers });
    const currentIndices: string[] = [];
    if (aliasResponse.ok) {
      const aliasData = await aliasResponse.json();
      currentIndices.push(...Object.keys(aliasData));
    }

    // Build atomic alias update: remove from all current, add to target
    const actions: any[] = [];
    for (const idx of currentIndices) {
      if (idx !== targetIndex) {
        actions.push({ remove: { index: idx, alias: LANCE_ALIAS } });
      }
    }
    actions.push({ add: { index: targetIndex, alias: LANCE_ALIAS } });

    const response = await fetch(`${ES_HOST}/_aliases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actions }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update alias: ${response.status} - ${errorText}`);
    }
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Ensure the 'dataset' keyword field exists on an existing index (idempotent PUT _mapping)
async function ensureDatasetField(esIndex: string): Promise<void> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ES_SECURITY_ENABLED) headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
    const response = await fetch(`${ES_HOST}/${esIndex}/_mapping`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ properties: { dataset: { type: 'keyword' } } }),
    });
    // 404 = index doesn't exist yet (will be created later), ignore
    if (!response.ok && response.status !== 404) {
      console.warn(`ensureDatasetField: ${response.status} ${response.statusText}`);
    }
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Count how many documents for a given dataset are already indexed
async function countDatasetDocuments(esIndex: string, dataset: string): Promise<number> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ES_SECURITY_ENABLED) headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
    const response = await fetch(`${ES_HOST}/${esIndex}/_count`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: { term: { dataset } } }),
    });
    if (!response.ok) return 0; // 404 or other → treat as "not indexed"
    const data = await response.json();
    return data.count || 0;
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Read the current lance_vector.storage mapping for compatibility checks.
async function getEmbeddingStorageConfig(esIndex: string): Promise<LanceEmbeddingStorageConfig | undefined> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const headers: Record<string, string> = {};
    if (ES_SECURITY_ENABLED) headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
    const response = await fetch(`${ES_HOST}/${esIndex}/_mapping`, { method: 'GET', headers });
    if (!response.ok) return undefined;
    const mapping = await response.json();
    const first = Object.values(mapping || {})[0] as any;
    return first?.mappings?.properties?.embedding?.storage;
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Remove only this dataset's documents (preserves other datasets in the same index)
async function deleteDatasetDocuments(esIndex: string, dataset: string): Promise<void> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ES_SECURITY_ENABLED) headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
    const response = await fetch(`${ES_HOST}/${esIndex}/_delete_by_query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: { term: { dataset } } }),
    });
    if (!response.ok && response.status !== 404) {
      console.warn(`deleteDatasetDocuments: ${response.status} ${response.statusText}`);
    }
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

// Index a batch of documents into Elasticsearch (metadata only, no vectors)
async function indexDocuments(esIndex: string, documents: DocumentMetadata[], datasetName: string): Promise<void> {
  const ES_HOST = process.env.ES_HOST || CONFIG_ES_HOST;

  // Ignore self-signed certificates for local ES
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    // Prepare bulk operations
    const bulkBody: any[] = [];

  for (const doc of documents) {
    bulkBody.push(
      { index: { _index: esIndex, _id: doc.id } },
      {
        id: doc.id,
        title: doc.title,
        text: doc.text,
        topic: doc.topic,
        category: doc.category,
        dataset: datasetName
      }
    );
  }

  // Execute bulk request
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-ndjson',
  };
  if (ES_SECURITY_ENABLED) {
    headers['Authorization'] = `Basic ${CONFIG_ES_AUTH}`;
  }

  const response = await fetch(`${ES_HOST}/_bulk`, {
    method: 'POST',
    headers,
    body: bulkBody.map((line) => JSON.stringify(line)).join('\n') + '\n'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to index documents: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data.errors) {
    console.error('Bulk indexing had errors:', JSON.stringify(data, null, 2));
  }
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let tempDir = '';

  try {
    const body = await request.json() as BackfillRequest;
    const {
      dataset,
      createIndex = true,
      forceRecreate = false,
      dims = 768,
      shardCount = 1,
      shardingStrategy,
      shardPath,
      datasetName,
      uriPrefix,
      fieldMapping,
    } = body;

    if (!dataset) {
      return NextResponse.json({
        success: false,
        error: "Dataset name is required. Please specify which dataset to backfill.",
      }, { status: 400 });
    }

    const requestProfile = {
      dims,
      shardCount,
      shardingStrategy,
      shardPath,
      datasetName,
      uriPrefix,
      fieldMapping,
    };

    const perDatasetIndex = datasetIndexName(dataset);
    const datasetPath = `datasets/${dataset}`;
    const datasetPrefix = `${datasetPath}/`;

    // Download dataset listing from OSS and read profile metadata if available
    const client = await getClient();
    const result = await client.list({
      prefix: datasetPrefix,
    });

    if (!result.objects || result.objects.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Dataset "${dataset}" not found in OSS. Please generate a dataset first.`,
      });
    }

    const objectNames = (result.objects || [])
      .map((obj: any) => (typeof obj?.name === 'string' ? obj.name : ''))
      .filter((name: string) => name.length > 0);

    const hasLegacyNestedShardLayout = objectNames.some((name) =>
      name.startsWith(datasetPrefix) && /\/shard-\d+\/data\.lance\/data\.lance\//.test(name)
    );
    const hasLegacyNestedSingleLayout = objectNames.some((name) =>
      name.startsWith(`${datasetPrefix}data.lance/data.lance/`)
    );
    const discoveredShardIds = Array.from(
      new Set(
        objectNames
          .map((name) => {
            const match = name.match(/\/shard-(\d+)\//);
            if (!match) return null;
            const parsed = Number.parseInt(match[1], 10);
            return Number.isFinite(parsed) ? parsed : null;
          })
          .filter((value): value is number => value !== null)
      )
    ).sort((a, b) => a - b);
    const hasShardObjects = discoveredShardIds.length > 0;
    const discoveredShardCount = discoveredShardIds.length > 0 ? (Math.max(...discoveredShardIds) + 1) : 1;

    const metadataKey = `${datasetPrefix}dataset.meta.json`;
    const hasMetadata = result.objects.some((obj: { name?: string }) => Boolean(obj?.name) && obj.name === metadataKey);
    let datasetMetadata: Record<string, unknown> | undefined;

    if (hasMetadata) {
      try {
        const metaObject = await client.get(metadataKey);
        const content = (metaObject as any)?.content;
        let raw = '';
        if (typeof content === 'string') {
          raw = content;
        } else if (Buffer.isBuffer(content)) {
          raw = content.toString('utf-8');
        } else if (content != null) {
          raw = String(content);
        }
        if (raw) {
          datasetMetadata = JSON.parse(raw);
        }
      } catch (metadataError: any) {
        console.warn(`Failed to read metadata for dataset "${dataset}":`, metadataError?.message || metadataError);
      }
    }

    const effectiveProfile = resolveDatasetProfile({
      request: requestProfile,
      metadata: datasetMetadata,
      defaults: {
        dims: 768,
        shardCount: 1,
        shardingStrategy: 'NONE',
      },
    });
    const effectiveShardCount = Math.max(effectiveProfile.shardCount, discoveredShardCount);
    const storageDatasetName =
      hasLegacyNestedShardLayout &&
      (effectiveProfile.datasetName || "data.lance") === "data.lance"
        ? "data.lance/data.lance"
        : effectiveProfile.datasetName;
    const shouldUseShardAwareStorage = Boolean(effectiveProfile.uriPrefix) || hasShardObjects;
    const resolvedUriPrefix = shouldUseShardAwareStorage
      ? (effectiveProfile.uriPrefix || `oss://denny-test-lance/${datasetPath}`)
      : undefined;
    const resolvedShardPath = effectiveProfile.shardPath || "shard-{shard_id}";

    const metadataVectorsRaw = Number((datasetMetadata as any)?.vectors ?? 0);
    const metadataVectors = Number.isFinite(metadataVectorsRaw) && metadataVectorsRaw > 0
      ? Math.floor(metadataVectorsRaw)
      : 0;
    const vectorsFromNameMatch = /vectors-(\d+)-dims-/i.exec(dataset);
    const vectorsFromName = vectorsFromNameMatch ? Number.parseInt(vectorsFromNameMatch[1], 10) : 0;
    const expectedVectorsHint = metadataVectors > 0 ? metadataVectors : (Number.isFinite(vectorsFromName) ? vectorsFromName : 0);

    const alreadyIndexed = await indexExists(perDatasetIndex);
    if (alreadyIndexed && !forceRecreate) {
      // Idempotent fast-path: if per-dataset index already has all expected docs,
      // just ensure alias points to it instead of deleting/rebuilding.
      await ensureDatasetField(perDatasetIndex);
      const existingDatasetDocs = await countDatasetDocuments(perDatasetIndex, dataset);
      const existingStorage = await getEmbeddingStorageConfig(perDatasetIndex);
      const storageModeMatches = shouldUseShardAwareStorage
        ? (
            Boolean(existingStorage?.uri_prefix) &&
            (!resolvedUriPrefix || existingStorage?.uri_prefix === resolvedUriPrefix) &&
            (!resolvedShardPath || existingStorage?.shard_path === resolvedShardPath) &&
            (!storageDatasetName || (existingStorage?.dataset_name || "data.lance") === storageDatasetName)
          )
        : Boolean(existingStorage?.uri);
      if (expectedVectorsHint > 0 && existingDatasetDocs >= expectedVectorsHint) {
        if (storageModeMatches) {
          await updateAlias(perDatasetIndex);
          const duration = Date.now() - startTime;
          return NextResponse.json({
            success: true,
            esIndex: perDatasetIndex,
            alias: LANCE_ALIAS,
            totalDocuments: expectedVectorsHint,
            indexedDocuments: existingDatasetDocs,
            duration: `${duration}ms`,
            shardCount: effectiveShardCount,
            shardingStrategy: effectiveProfile.shardingStrategy,
            dims: effectiveProfile.dims,
            message: `Dataset "${dataset}" is already backfilled (${existingDatasetDocs} docs). Alias "${LANCE_ALIAS}" updated.`,
          });
        }
        console.info(
          `Rebuilding "${perDatasetIndex}" due to storage mapping mismatch (expected shardAware=${shouldUseShardAwareStorage})`
        );
      }
    }

    // Rebuild per-dataset index to guarantee mapping/profile consistency with source Lance dataset.
    if (alreadyIndexed) {
      await deleteESIndex(perDatasetIndex);
    }

    // Create temp directory
    tempDir = `/tmp/lance-backfill-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    // Download all files
    for (const obj of result.objects) {
      // Skip objects without name property (common prefixes don't have name)
      if (!('name' in obj) || !obj.name) continue;

      const objectKey = obj.name;
      const relativePath = objectKey.replace(datasetPrefix, "");
      const localFilePath = `${tempDir}/${relativePath}`;

      // Ensure directory exists
      const dir = localFilePath.substring(0, localFilePath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });

      await client.get(objectKey, localFilePath);
    }

    // Read documents (metadata only, no vectors) using Python
    const pythonScript = `
import os
import sys
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

import lancedb
import json

dataset_path = "${tempDir}"

def extract_table_names(db):
    tables_response = db.list_tables()
    if isinstance(tables_response, list):
        return list(tables_response)
    if hasattr(tables_response, 'tables'):
        return list(tables_response.tables)
    if hasattr(tables_response, 'names'):
        return list(tables_response.names)

    table_names = []
    try:
        items = list(tables_response)
    except Exception:
        items = []

    for item in items:
        if isinstance(item, str):
            table_names.append(item)
            continue
        if isinstance(item, tuple):
            for part in item:
                if isinstance(part, str):
                    table_names.append(part)
                elif isinstance(part, list):
                    table_names.extend([x for x in part if isinstance(x, str)])

    return table_names

# Support both legacy single-root datasets and shard-aware layouts:
# - /tmp/...             (contains data.lance/)
# - /tmp/.../shard-0     (contains data.lance/), /tmp/.../shard-1, ...
dataset_roots = []
def add_root(path):
    if path not in dataset_roots:
        dataset_roots.append(path)

for entry in sorted(os.listdir(dataset_path)):
    if not entry.startswith('shard-'):
        continue
    shard_dir = os.path.join(dataset_path, entry)
    if os.path.isdir(os.path.join(shard_dir, 'data.lance')):
        # Preferred new layout root
        add_root(shard_dir)
        # Legacy fallback where create_dataset was called with ".../data.lance"
        add_root(os.path.join(shard_dir, 'data.lance'))

if not dataset_roots:
    add_root(dataset_path)
    legacy_root = os.path.join(dataset_path, 'data.lance')
    if os.path.isdir(legacy_root):
        add_root(legacy_root)

vector_dims = 0
total = 0
result = []
opened_tables = 0
open_errors = []

for root in dataset_roots:
    try:
        db = lancedb.connect(root)
        table_names = extract_table_names(db)
        if not table_names:
            continue

        table = db.open_table(table_names[0])
        opened_tables += 1
        total += int(table.count_rows())

        if vector_dims <= 0:
            try:
                schema = table.schema
                for field in schema:
                    if field.name == 'vector' and hasattr(field.type, 'list_size'):
                        vector_dims = int(field.type.list_size)
                        break
            except Exception:
                pass

        # Load metadata rows; vectors remain in Lance storage.
        data = table.to_arrow().to_pandas()

        if vector_dims <= 0 and 'vector' in data.columns and len(data) > 0:
            try:
                sample_vector = data.iloc[0]['vector']
                if hasattr(sample_vector, '__len__'):
                    vector_dims = int(len(sample_vector))
            except Exception:
                pass

        columns_needed = ['_id', 'id', 'title', 'text', 'topic', 'category']
        available_columns = [col for col in columns_needed if col in data.columns]
        if not available_columns:
            continue
        data = data[available_columns]

        for idx, row in data.iterrows():
            def to_string(val):
                if hasattr(val, 'item'):
                    val = val.item()
                return str(val)

            doc_id = to_string(row['_id']) if '_id' in available_columns else str(idx)
            result.append({
                '_id': doc_id,
                'id': to_string(row['id']) if 'id' in available_columns else doc_id,
                'title': to_string(row['title']) if 'title' in available_columns else f'Document {doc_id}',
                'text': to_string(row['text']) if 'text' in available_columns else '',
                'topic': to_string(row['topic']) if 'topic' in available_columns else 'general',
                'category': to_string(row['category']) if 'category' in available_columns else 'uncategorized'
            })
    except Exception as exc:
        open_errors.append(f"{root}: {exc}")

if opened_tables == 0:
    details = '; '.join(open_errors) if open_errors else 'no readable Lance tables found'
    raise Exception(f"No tables found in LanceDB database roots under {dataset_path} ({details})")

# Output as JSON and bypass interpreter finalizers.
# LanceDB/PyArrow can occasionally crash during Python shutdown with:
# "PyGILState_Release ... runtime state: finalizing".
payload = json.dumps({'documents': result, 'total': total, 'vector_dims': vector_dims})
sys.stdout.write(payload)
sys.stdout.flush()
os._exit(0)
`;

    const { stdout } = await execAsync(
      `python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`
    );

    const parsedOutput = JSON.parse(stdout.trim());
    const documents: DocumentMetadata[] = parsedOutput.documents;

    const inferredDimsRaw = Number(parsedOutput.vector_dims || 0);
    const inferredDims = Number.isFinite(inferredDimsRaw) && inferredDimsRaw > 0
      ? Math.floor(inferredDimsRaw)
      : 0;
    const resolvedDims = inferredDims > 0 ? inferredDims : effectiveProfile.dims;

    if (inferredDims > 0 && inferredDims !== effectiveProfile.dims) {
      console.warn(
        `Dataset "${dataset}" metadata dims=${effectiveProfile.dims} mismatch Lance dims=${inferredDims}; using Lance dims for index mapping`
      );

      // Persist corrected dims so future list/backfill/search flows stay consistent.
      try {
        const correctedMetadata = {
          ...(datasetMetadata || {}),
          version: Number((datasetMetadata as any)?.version || 1),
          dataset,
          vectors: documents.length,
          dims: inferredDims,
          shard_count: effectiveShardCount,
          sharding_strategy: effectiveProfile.shardingStrategy,
          dataset_name: effectiveProfile.datasetName || (datasetMetadata as any)?.dataset_name || 'data.lance',
        };
        await client.put(
          metadataKey,
          Buffer.from(JSON.stringify(correctedMetadata, null, 2), 'utf-8')
        );
      } catch (metadataWriteError: any) {
        console.warn(`Failed to persist corrected metadata for dataset "${dataset}":`, metadataWriteError?.message || metadataWriteError);
      }
    }

    if (documents.length === 0) {
      await fs.rm(tempDir, { recursive: true, force: true });
      return NextResponse.json({
        success: false,
        error: "No documents found in dataset",
      });
    }

    // Cleanup temp directory
    await fs.rm(tempDir, { recursive: true, force: true });

    // Create per-dataset ES index with dedicated lance_uri
    if (createIndex) {
      try {
        // Construct OSS URI for lance_vector field
        // IMPORTANT: Lance dataset path MUST include /data.lance/ suffix.
        // Legacy datasets may be nested as /data.lance/data.lance/.
        const datasetUri = hasLegacyNestedSingleLayout
          ? `oss://denny-test-lance/${datasetPath}/data.lance/data.lance/`
          : `oss://denny-test-lance/${datasetPath}/data.lance/`;

        await createESIndex(perDatasetIndex, datasetUri, resolvedDims, {
          shardCount: effectiveShardCount,
          shardingStrategy: effectiveProfile.shardingStrategy,
          shardPath: resolvedShardPath,
          datasetName: storageDatasetName,
          uriPrefix: resolvedUriPrefix,
          fieldMapping: effectiveProfile.fieldMapping,
        });
      } catch (error: any) {
        // Index might already exist, log but continue
        console.warn('Index creation warning:', error.message);
      }
    }

    // Index documents in batches (ES recommends bulk size < 10MB)
    const batchSize = 20; // 20 docs at a time
    let indexedCount = 0;

    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      await indexDocuments(perDatasetIndex, batch, dataset);
      indexedCount += batch.length;
    }

    // Update alias to point to the newly created per-dataset index
    await updateAlias(perDatasetIndex);

    // Clear Python search cache so next kNN search picks up new dataset
    try {
      await fs.rm('/tmp/lance-cache', { recursive: true, force: true });
    } catch {}

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      esIndex: perDatasetIndex,
      alias: LANCE_ALIAS,
      totalDocuments: documents.length,
      indexedDocuments: indexedCount,
      duration: `${duration}ms`,
      shardCount: effectiveShardCount,
      shardingStrategy: effectiveProfile.shardingStrategy,
      dims: resolvedDims,
      message: `Successfully backfilled ${indexedCount} documents to "${perDatasetIndex}" and updated alias "${LANCE_ALIAS}".`,
    });
  } catch (error: any) {
    console.error("Backfill failed:", error);

    // Cleanup on error
    if (tempDir) {
      try {
        await fs.rm(tempDir, {
          recursive: true,
          force: true,
        });
      } catch {}
    }

    return NextResponse.json({
      success: false,
      error: error.message || "Backfill failed",
    }, { status: 500 });
  }
}

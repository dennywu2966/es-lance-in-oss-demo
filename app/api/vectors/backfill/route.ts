import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/oss-client";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";

const execAsync = promisify(exec);

interface BackfillRequest {
  dataset?: string;
  esIndex?: string;
  createIndex?: boolean;
  forceRecreate?: boolean;  // Delete index before creating (needed when switching datasets)
  dims?: number;            // Vector dimensions for lance_vector field (default 768)
}

interface DocumentMetadata {
  _id: string;
  id: string;
  title: string;
  text: string;
  topic: string;
  category: string;
}

// Create Elasticsearch index with proper mapping for metadata + lance_vector field
async function createESIndex(esIndex: string, datasetUri?: string, dims: number = 768): Promise<void> {
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
    properties.embedding = {
      type: "lance_vector",
      dims,
      storage: {
        type: "external",
        uri: datasetUri,
        lance_id_column: "_id",
        lance_vector_column: "vector",
        read_only: true
      }
    };
  }

  const mapping = {
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

  try {
    const body = await request.json() as BackfillRequest;
    const { dataset, createIndex = true, forceRecreate = false, dims = 768 } = body;

    if (!dataset) {
      return NextResponse.json({
        success: false,
        error: "Dataset name is required. Please specify which dataset to backfill.",
      }, { status: 400 });
    }

    // Per-dataset index: lance-ds-{sanitizedName} (each has its own immutable lance_uri)
    const sanitizedDatasetName = dataset.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const perDatasetIndex = `lance-ds-${sanitizedDatasetName}`;
    const tempDir = `/tmp/lance-backfill-${Date.now()}`;
    const datasetPath = `datasets/${dataset}`;

    // --- Alias-based fast switch ---
    // If per-dataset index already exists and not forcing recreate, just update alias (O(1))
    const alreadyIndexed = await indexExists(perDatasetIndex);
    if (alreadyIndexed && !forceRecreate) {
      // Dataset already has a dedicated index — just switch alias pointer
      await updateAlias(perDatasetIndex);
      return NextResponse.json({
        success: true,
        esIndex: perDatasetIndex,
        alias: LANCE_ALIAS,
        totalDocuments: 0,
        indexedDocuments: 0,
        duration: `${Date.now() - startTime}ms`,
        message: `Switched to dataset "${dataset}" via alias (O(1)). Index "${perDatasetIndex}" already exists.`,
        skipped: true,
        aliasUpdated: true,
      });
    }

    // If forceRecreate, delete the per-dataset index to rebuild
    if (alreadyIndexed && forceRecreate) {
      await deleteESIndex(perDatasetIndex);
    }

    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Download dataset from OSS
    const client = await getClient();
    const result = await client.list({
      prefix: datasetPath,
    });

    if (!result.objects || result.objects.length === 0) {
      await fs.rm(tempDir, { recursive: true, force: true });
      return NextResponse.json({
        success: false,
        error: `Dataset "${dataset}" not found in OSS. Please generate a dataset first.`,
      });
    }

    // Download all files
    for (const obj of result.objects) {
      // Skip objects without name property (common prefixes don't have name)
      if (!('name' in obj) || !obj.name) continue;

      const objectKey = obj.name;
      const relativePath = objectKey.replace(`${datasetPath}/`, "");
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

# Open database using LanceDB (new API)
db = lancedb.connect(dataset_path)

# Get table names - ListTablesResponse has .tables attribute
tables_response = db.list_tables()
if hasattr(tables_response, 'tables'):
    table_names = tables_response.tables
elif hasattr(tables_response, 'names'):
    table_names = tables_response.names
else:
    # Fallback: extract from tuples
    table_names = []
    for item in list(tables_response):
        if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], list):
            table_names.extend(item[1])

# Open the first available table
table = db.open_table(table_names[0])

# Get total count
total = table.count_rows()

# Load all documents without vectors (vectors stored in Lance, not ES)
arrow_table = table.to_arrow()
data = arrow_table.to_pandas()

# Select only metadata columns (exclude vector)
columns_needed = ['_id', 'id', 'title', 'text', 'topic', 'category']
available_columns = [col for col in columns_needed if col in data.columns]
data = data[available_columns]

# Convert to list of dicts — handle missing columns gracefully
result = []
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

# Output as JSON
print(json.dumps({'documents': result, 'total': total}))
`;

    const { stdout } = await execAsync(
      `python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`
    );

    const parsedOutput = JSON.parse(stdout.trim());
    const documents: DocumentMetadata[] = parsedOutput.documents;

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
        // IMPORTANT: Lance dataset path MUST include /data.lance/ suffix
        const datasetUri = `oss://denny-test-lance/${datasetPath}/data.lance/`;
        await createESIndex(perDatasetIndex, datasetUri, dims);
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
      message: `Successfully backfilled ${indexedCount} documents to "${perDatasetIndex}" and updated alias "${LANCE_ALIAS}".`,
    });
  } catch (error: any) {
    console.error("Backfill failed:", error);

    // Cleanup on error
    try {
      await fs.rm(`/tmp/lance-backfill-${Date.now()}`, {
        recursive: true,
        force: true,
      });
    } catch {}

    return NextResponse.json({
      success: false,
      error: error.message || "Backfill failed",
    }, { status: 500 });
  }
}

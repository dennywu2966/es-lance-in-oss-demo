import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/oss-client";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);

interface Document {
  _id: string;
  id: string;
  title: string;
  text: string;
  topic: string;
  category: string;
  vector: number[];
}

interface DocumentsRequest {
  dataset?: string;
  limit?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DocumentsRequest;
    const { dataset, limit = 20 } = body;

    if (!dataset) {
      return NextResponse.json({
        success: false,
        error: "Dataset name is required",
      }, { status: 400 });
    }

    const tempDir = `/tmp/lance-docs-fetch-${Date.now()}`;
    const datasetPath = `datasets/${dataset}`;
    const localPath = `${tempDir}/dataset.lance`;

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
        error: `Dataset "${dataset}" not found. Please generate a dataset first.`,
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

    // Get OSS credentials to pass to Python
    const ossConfig = await getClient().then(async (client) => {
      // Read credentials file directly
      const credsPath = `/home/denny/.oss/credentials.json`;
      const credsContent = await fs.readFile(credsPath, 'utf-8');
      return JSON.parse(credsContent);
    });

    // Read documents using Python with OSS credentials
    const pythonScript = `
import os
import sys
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

# Set OSS credentials for LanceDB
os.environ['OSS_ACCESS_KEY_ID'] = '${ossConfig.access_key_id}'
os.environ['OSS_ACCESS_KEY_SECRET'] = '${ossConfig.access_key_secret}'
os.environ['OSS_ENDPOINT'] = '${ossConfig.endpoint}'
os.environ['OSS_REGION'] = '${ossConfig.region}'

import lancedb
import pyarrow as pa

dataset_path = "${tempDir}"
limit = ${limit}

def extract_table_names(db):
    tables_response = db.list_tables()
    if isinstance(tables_response, list):
        return list(tables_response)
    if hasattr(tables_response, 'tables'):
        return list(tables_response.tables)
    if hasattr(tables_response, 'names'):
        return list(tables_response.names)
    try:
        return list(tables_response)
    except Exception:
        return []

dataset_roots = []
def add_root(path):
    if path not in dataset_roots:
        dataset_roots.append(path)

for entry in sorted(os.listdir(dataset_path)):
    if not entry.startswith('shard-'):
        continue
    shard_dir = os.path.join(dataset_path, entry)
    if os.path.isdir(os.path.join(shard_dir, 'data.lance')):
        add_root(shard_dir)
        add_root(os.path.join(shard_dir, 'data.lance'))

if not dataset_roots:
    add_root(dataset_path)
    legacy_root = os.path.join(dataset_path, 'data.lance')
    if os.path.isdir(legacy_root):
        add_root(legacy_root)

total = 0
result = []
opened_tables = 0

for root in dataset_roots:
    try:
        db = lancedb.connect(root)
        table_names = extract_table_names(db)
        if not table_names:
            continue

        table = db.open_table(table_names[0])
        opened_tables += 1
        total += int(table.count_rows())

        # If limit is already reached, skip loading additional shard rows.
        if limit > 0 and len(result) >= limit:
            continue

        data = table.to_arrow().to_pandas()
        columns_needed = ['_id', 'id', 'title', 'text', 'topic', 'category']
        available_columns = [col for col in columns_needed if col in data.columns]
        if not available_columns:
            continue
        data = data[available_columns]

        for _, row in data.iterrows():
            def to_string(val):
                if val is None:
                    return ''
                if hasattr(val, 'item'):
                    return str(val.item())
                return str(val)

            def get_val(column, default=''):
                if column in row.index:
                    return to_string(row[column])
                return default

            result.append({
                '_id': get_val('_id'),
                'id': get_val('id', get_val('_id')),
                'title': get_val('title', ''),
                'text': get_val('text', ''),
                'topic': get_val('topic', 'general'),
                'category': get_val('category', 'unknown')
            })

            if limit > 0 and len(result) >= limit:
                break
    except Exception:
        continue

if opened_tables == 0:
    raise Exception("No tables found in LanceDB database")

# Output as JSON
import json
print(json.dumps({'documents': result, 'total': total}))
`;

    const { stdout } = await execAsync(
      `python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    // Parse output
    const data = JSON.parse(stdout.trim());

    return NextResponse.json({
      success: true,
      documents: data.documents,
      total: data.total,
    });
  } catch (error: any) {
    console.error("Failed to fetch documents:", error);

    // Cleanup on error
    try {
      await fs.rm(`/tmp/lance-docs-fetch-${Date.now()}`, {
        recursive: true,
        force: true,
      });
    } catch {}

    return NextResponse.json({
      success: false,
      error: error.message || "Failed to fetch documents",
    });
  }
}

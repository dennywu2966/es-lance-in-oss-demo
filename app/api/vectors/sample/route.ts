import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getOSSConfig } from "@/lib/oss-client";

const execAsync = promisify(exec);

// Cache for 30 seconds - sampling results are relatively stable
export const revalidate = 30;

// Helper with timeout and env support
function execWithTimeout(command: string, timeout: number, env?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    const options = env ? { env: { ...process.env, ...env } } : undefined;
    const proc = exec(command, options, (error, stdout, stderr) => {
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

interface VectorSampleRequest {
  dataset: string;
  count?: number;
}

interface VectorSample {
  id: string;
  vector: number[];
  category: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataset, count = 10 } = body as VectorSampleRequest;

    // Get OSS config for Python script
    const ossConfig = await getOSSConfig();

    if (!dataset) {
      return NextResponse.json(
        { success: false, error: "Dataset is required" },
        { status: 400 }
      );
    }

    // Download dataset from OSS to temp location
    const tempDir = `/tmp/lance-sample-${Date.now()}`;

    const pythonScript = `
import os
import sys
import json

# Clear proxy settings FIRST before any imports
for var in list(os.environ.keys()):
    if 'proxy' in var.lower():
        del os.environ[var]

# Import OSS after clearing proxy
import oss2
import lancedb
import random

# OSS credentials (from environment)
auth = oss2.Auth(os.environ.get("OSS_ACCESS_KEY_ID", ""), os.environ.get("OSS_ACCESS_KEY_SECRET", ""))
bucket = oss2.Bucket(auth, os.environ.get("OSS_ENDPOINT", "oss-ap-southeast-1.aliyuncs.com"), os.environ.get("OSS_BUCKET", "denny-test-lance"))

# Dataset path in OSS
temp_dir = "${tempDir}"
dataset_name = "${dataset}"
oss_prefix = f"datasets/{dataset_name}/"
sample_count = ${count}

# Download dataset from OSS
os.makedirs(temp_dir, exist_ok=True)

print("Listing objects in OSS...", file=sys.stderr, flush=True)
all_object_keys = []
marker = ''
while True:
    result = bucket.list_objects(prefix=oss_prefix, marker=marker, max_keys=1000)
    for obj in result.object_list:
        if not obj.key.endswith('/'):
            all_object_keys.append(obj.key)
    if not getattr(result, 'is_truncated', False):
        break
    marker = getattr(result, 'next_marker', '')
    if not marker:
        break

print(f"Found {len(all_object_keys)} objects", file=sys.stderr, flush=True)

downloaded = 0
downloaded_rel_paths = []
for object_key in all_object_keys:
    relative_path = object_key.replace(oss_prefix, '')
    local_file = os.path.join(temp_dir, relative_path)
    os.makedirs(os.path.dirname(local_file), exist_ok=True)
    object_data = bucket.get_object(object_key)
    with open(local_file, 'wb') as f:
        f.write(object_data.read())
    downloaded += 1
    downloaded_rel_paths.append(relative_path)

print(f"Downloaded {downloaded} files", file=sys.stderr, flush=True)
if downloaded == 0:
    raise Exception(f"No dataset objects found under prefix {oss_prefix}")

def extract_table_names(db):
    tables_response = db.list_tables()
    if isinstance(tables_response, list):
        return list(tables_response)
    if hasattr(tables_response, 'tables'):
        return list(tables_response.tables)
    try:
        return list(tables_response)
    except Exception:
        return []

dataset_roots = []
def add_root(path):
    if path not in dataset_roots:
        dataset_roots.append(path)

# Always include legacy roots first.
add_root(temp_dir)
legacy_root = os.path.join(temp_dir, 'data.lance')
if os.path.isdir(legacy_root):
    add_root(legacy_root)

# Discover shard roots from downloaded object keys.
discovered_shards = set()
for rel_path in downloaded_rel_paths:
    if rel_path.startswith('shard-'):
        discovered_shards.add(rel_path.split('/', 1)[0])

for shard_name in sorted(discovered_shards):
    shard_dir = os.path.join(temp_dir, shard_name)
    if os.path.isdir(shard_dir):
        add_root(shard_dir)
    shard_lance = os.path.join(shard_dir, 'data.lance')
    if os.path.isdir(shard_lance):
        add_root(shard_lance)

# Also scan extracted filesystem in case object names were non-standard.
for entry in sorted(os.listdir(temp_dir)):
    if not entry.startswith('shard-'):
        continue
    shard_dir = os.path.join(temp_dir, entry)
    if os.path.isdir(shard_dir):
        add_root(shard_dir)
    shard_lance = os.path.join(shard_dir, 'data.lance')
    if os.path.isdir(shard_lance):
        add_root(shard_lance)

records = []
total_count = 0
opened_tables = 0

for root in dataset_roots:
    try:
        db = lancedb.connect(root)
        table_names = extract_table_names(db)
        if not table_names:
            continue

        print(f"Found tables at {root}: {table_names}", file=sys.stderr, flush=True)
        table = db.open_table(table_names[0])
        opened_tables += 1
        table_count = int(table.count_rows())
        total_count += table_count
        records.extend(table.to_pandas().to_dict(orient='records'))
    except Exception as exc:
        print(f"Skipping unreadable root {root}: {exc}", file=sys.stderr, flush=True)
        continue

if opened_tables == 0:
    raise Exception("No tables found in LanceDB database")

print(f"Dataset has {total_count} vectors across {opened_tables} table(s)", file=sys.stderr, flush=True)

if total_count <= 0 or len(records) == 0:
    sampled_records = []
else:
    sampled_records = random.sample(records, min(sample_count, len(records)))

# Prepare results
samples = []
for idx, row in enumerate(sampled_records):
    doc_id = row.get('_id', str(idx))
    vector_data = row.get('vector', [])
    category_data = row.get('category', 'unknown')

    # Handle numpy arrays and pyarrow types
    if hasattr(doc_id, 'item'):
        doc_id = doc_id.item()
    if hasattr(vector_data, 'tolist'):
        vector_data = vector_data.tolist()
    elif hasattr(vector_data, 'as_py'):
        vector_data = vector_data.as_py()
    if hasattr(category_data, 'item'):
        category_data = category_data.item()
    elif hasattr(category_data, 'as_py'):
        category_data = category_data.as_py()

    samples.append({
        'id': str(doc_id),
        'vector': list(vector_data) if vector_data is not None else [],
        'category': str(category_data) if category_data is not None else 'unknown'
    })

# Cleanup
import shutil
shutil.rmtree(temp_dir, ignore_errors=True)

print(json.dumps({'success': True, 'samples': samples, 'total': total_count}))
`;

    // Prepare environment with OSS credentials
    // Note: ossConfig.endpoint already contains the full endpoint (e.g., "oss-ap-southeast-1-internal.aliyuncs.com")
    const env = {
      OSS_ACCESS_KEY_ID: ossConfig.accessKeyId,
      OSS_ACCESS_KEY_SECRET: ossConfig.accessKeySecret,
      OSS_ENDPOINT: (ossConfig as any).endpoint || `${ossConfig.region}.aliyuncs.com`,
      OSS_REGION: ossConfig.region,
      OSS_BUCKET: ossConfig.bucket,
    };

    const { stdout } = await execWithTimeout(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`, 60000, env);

    const data = JSON.parse(stdout.trim());

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Sample vectors error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

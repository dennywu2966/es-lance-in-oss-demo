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
result = bucket.list_objects(prefix=oss_prefix)
print(f"Found {len(result.object_list)} objects", file=sys.stderr, flush=True)

downloaded = 0
for obj in result.object_list:
    if not obj.key.endswith('/'):
        relative_path = obj.key.replace(oss_prefix, '')
        local_file = os.path.join(temp_dir, relative_path)
        os.makedirs(os.path.dirname(local_file), exist_ok=True)
        object_data = bucket.get_object(obj.key)
        with open(local_file, 'wb') as f:
            f.write(object_data.read())
        downloaded += 1

print(f"Downloaded {downloaded} files", file=sys.stderr, flush=True)

# Open Lance dataset using lancedb (new API)
db = lancedb.connect(temp_dir)

# Get table names - handle different LanceDB response formats
tables_response = db.list_tables()
if isinstance(tables_response, list):
    table_names = tables_response
elif hasattr(tables_response, 'tables'):
    table_names = tables_response.tables
else:
    table_names = list(tables_response)

if not table_names:
    raise Exception("No tables found in LanceDB database")

print(f"Found tables: {table_names}", file=sys.stderr, flush=True)

# Open the first table (usually 'data')
table = db.open_table(table_names[0])

# Get total count
total_count = table.count_rows()
print(f"Dataset has {total_count} vectors", file=sys.stderr, flush=True)

# Sample random indices
sample_indices = random.sample(range(min(total_count, sample_count * 10)), min(sample_count, total_count))

# Fetch sampled vectors using to_pandas with row filter
df = table.to_pandas()
sampled_df = df.iloc[sample_indices]

# Prepare results
samples = []
for idx, row in sampled_df.iterrows():
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

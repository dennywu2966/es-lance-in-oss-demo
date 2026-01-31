import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getOSSConfig } from "@/lib/oss-client";

const execAsync = promisify(exec);

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
import lance
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

# Open Lance dataset
dataset = lance.dataset(temp_dir)

# Get total count
total_count = dataset.count_rows()
print(f"Dataset has {total_count} vectors", file=sys.stderr, flush=True)

# Sample random indices
sample_indices = random.sample(range(min(total_count, sample_count * 10)), min(sample_count, total_count))

# Fetch sampled vectors
table = dataset.take(sample_indices)
data = table.to_pydict()

# Prepare results
samples = []
for i in range(len(data['_id'])):
    doc_id = data['_id'][i]
    vector_data = data['vector'][i]
    if hasattr(vector_data, 'as_py'):
        vector_data = vector_data.as_py()
    category_data = data['category'][i]
    if hasattr(category_data, 'as_py'):
        category_data = category_data.as_py()

    samples.append({
        'id': doc_id,
        'vector': vector_data.tolist() if hasattr(vector_data, 'tolist') else list(vector_data),
        'category': category_data
    })

# Cleanup
import shutil
shutil.rmtree(temp_dir, ignore_errors=True)

print(json.dumps({'success': True, 'samples': samples, 'total': total_count}))
`;

    // Prepare environment with OSS credentials
    const env = {
      OSS_ACCESS_KEY_ID: ossConfig.accessKeyId,
      OSS_ACCESS_KEY_SECRET: ossConfig.accessKeySecret,
      OSS_ENDPOINT: `${ossConfig.region}.aliyuncs.com`,
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

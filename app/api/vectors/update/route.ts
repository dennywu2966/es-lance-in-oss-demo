import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface UpdateRequest {
  dataset: string;
  additionalVectors: number;
  dims: number;
}

function execWithTimeout(command: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    const proc = exec(command, (error, stdout, stderr) => {
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as UpdateRequest;
    const { dataset, additionalVectors, dims } = body;

    if (!dataset || !additionalVectors || !dims) {
      return NextResponse.json(
        {
          success: false,
          error: "Dataset, additionalVectors, and dims are required",
        },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    const tempDir = `/tmp/lance-update-${Date.now()}`;

    // Python script to update Lance dataset
    const pythonScript = `
import os
import sys
import json
import shutil

# Clear proxy settings FIRST before any imports
for var in list(os.environ.keys()):
    if 'proxy' in var.lower():
        del os.environ[var]

import oss2
import lance
import numpy as np
import pyarrow as pa

# OSS credentials (from environment)
auth = oss2.Auth(os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"])
bucket = oss2.Bucket(auth, os.environ.get("OSS_REGION", "oss-ap-southeast-1") + ".aliyuncs.com", os.environ.get("OSS_BUCKET", "denny-test-lance"))

temp_dir = "${tempDir}"
dataset_name = "${dataset}"
oss_prefix = f"datasets/{dataset_name}/"
additional_vectors = ${additionalVectors}
dims = ${dims}

# Download existing dataset from OSS
os.makedirs(temp_dir, exist_ok=True)

print("Downloading existing dataset...", file=sys.stderr, flush=True)
result = bucket.list_objects(prefix=oss_prefix)
downloaded_files = 0
total_bytes = 0
for obj in result.object_list:
    if not obj.key.endswith('/'):
        # Get the relative path from the OSS prefix
        relative_path = obj.key.replace(oss_prefix, '')
        local_file = os.path.join(temp_dir, relative_path)

        # Create directory structure
        local_dir = os.path.dirname(local_file)
        os.makedirs(local_dir, exist_ok=True)

        # Download file with chunked reading and verification
        print(f"  [{obj.size} bytes] Downloading: {relative_path}", file=sys.stderr, flush=True)
        object_data = bucket.get_object(obj.key)

        # Download in chunks to handle large files properly
        chunk_size = 1024 * 1024  # 1MB chunks
        bytes_written = 0
        with open(local_file, 'wb') as f:
            while True:
                chunk = object_data.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                bytes_written += len(chunk)

        # Verify file size matches expected size
        if bytes_written != obj.size:
            print(f"  WARNING: Size mismatch! Expected {obj.size}, got {bytes_written}", file=sys.stderr, flush=True)
            # Try to re-download once on failure
            object_data = bucket.get_object(obj.key)
            with open(local_file, 'wb') as f:
                while True:
                    chunk = object_data.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    bytes_written += len(chunk)

            if bytes_written != obj.size:
                print(json.dumps({'success': False, 'error': f'File corruption: {relative_path} size mismatch after retry'}))
                sys.exit(1)

        downloaded_files += 1
        total_bytes += bytes_written

print(f"Downloaded {downloaded_files} files ({total_bytes} bytes total)", file=sys.stderr, flush=True)

# List downloaded files for verification
print("Files in temp_dir:", file=sys.stderr, flush=True)
for root, dirs, files in os.walk(temp_dir):
    for file in files:
        full_path = os.path.join(root, file)
        file_size = os.path.getsize(full_path)
        rel_path = os.path.relpath(full_path, temp_dir)
        print(f"  {rel_path}: {file_size} bytes", file=sys.stderr, flush=True)

# Verify the dataset is valid
try:
    print(f"Opening dataset: {temp_dir}", file=sys.stderr, flush=True)
    dataset = lance.dataset(temp_dir)
    existing_count = dataset.count_rows()
    print(f"Dataset opened successfully: {existing_count} vectors", file=sys.stderr, flush=True)
except Exception as e:
    print(f"ERROR opening dataset: {e}", file=sys.stderr, flush=True)
    print(json.dumps({'success': False, 'error': f'Failed to open dataset: {str(e)}'}))
    sys.exit(1)

# Generate new normalized vectors
print(f"Generating {additional_vectors} new vectors...", file=sys.stderr, flush=True)
new_vectors_array = np.random.randn(additional_vectors, dims).astype(np.float32)
new_vectors_array = new_vectors_array / np.linalg.norm(new_vectors_array, axis=1, keepdims=True)

# Create schema matching existing dataset
vector_type = pa.list_(pa.float32(), list_size=dims)
schema = pa.schema([
    pa.field('_id', pa.string()),
    pa.field('vector', vector_type),
    pa.field('category', pa.string())
])

# Create FixedSizeListArray for new vectors
flat_vectors = new_vectors_array.flatten()
vector_array = pa.FixedSizeListArray.from_arrays(
    pa.array(flat_vectors, type=pa.float32()),
    dims
)

# Create table for new data
categories = np.random.choice(['tech', 'science', 'business', 'finance', 'health'], additional_vectors)
new_start_id = existing_count
new_table = pa.table({
    '_id': [f"doc_{new_start_id + i}" for i in range(additional_vectors)],
    'vector': vector_array,
    'category': pa.array(categories.tolist())
}, schema=schema)

print(f"Appending {additional_vectors} vectors to existing {existing_count}...", file=sys.stderr, flush=True)

# Read existing table and combine
try:
    existing_table = dataset.to_table()
    print(f"Existing table loaded: {existing_table.num_rows} rows", file=sys.stderr, flush=True)
    combined_table = pa.concat_tables([existing_table, new_table])
    print(f"Combined table: {combined_table.num_rows} total rows", file=sys.stderr, flush=True)
except Exception as e:
    print(f"ERROR combining tables: {e}", file=sys.stderr, flush=True)
    print(json.dumps({'success': False, 'error': f'Failed to combine tables: {str(e)}'}))
    sys.exit(1)

# Write to a new location
output_path = temp_dir + "_new"
print(f"Writing to: {output_path}", file=sys.stderr, flush=True)
try:
    lance.write_dataset(combined_table, output_path)
    print(f"Dataset written successfully", file=sys.stderr, flush=True)
except Exception as e:
    print(f"ERROR writing dataset: {e}", file=sys.stderr, flush=True)
    print(json.dumps({'success': False, 'error': f'Failed to write dataset: {str(e)}'}))
    sys.exit(1)

# Rebuild IVF-PQ index if dataset is large enough
total_vectors = combined_table.num_rows
if total_vectors >= 256:
    print(f"Rebuilding IVF-PQ index for {total_vectors} vectors...", file=sys.stderr, flush=True)
    try:
        new_dataset = lance.dataset(output_path)
        num_partitions = max(2, min(total_vectors // 100, 256))
        new_dataset.create_index(
            column='vector',
            index_type='IVF_PQ',
            metric='cosine',
            num_partitions=num_partitions,
            num_sub_vectors=min(dims // 8, 64)
        )
        print("Index created successfully", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"WARNING: Failed to create index: {e}", file=sys.stderr, flush=True)
        # Continue anyway - the index is optional for functionality

# Upload updated dataset back to OSS with NEW name reflecting updated vector count
print("Uploading updated dataset to OSS...", file=sys.stderr, flush=True)

# Create new dataset name with updated vector count
import time
new_dataset_name = f"vectors-{total_vectors}-dims-{dims}-{int(time.time() * 1000)}"
new_oss_prefix = f"datasets/{new_dataset_name}/"

# Delete old dataset files first
result = bucket.list_objects(prefix=oss_prefix)
for obj in result.object_list:
    if not obj.key.endswith('/'):
        bucket.delete_object(obj.key)
print(f"Deleted old dataset: {dataset_name}", file=sys.stderr, flush=True)

# Upload new files with proper file reading to NEW location
uploaded = 0
upload_bytes = 0
for root, dirs, files in os.walk(output_path):
    for file in files:
        local_path = os.path.join(root, file)
        relative_path = os.path.relpath(local_path, output_path)
        oss_key = f"{new_oss_prefix}{relative_path}"

        # Read file content and upload properly
        file_size = os.path.getsize(local_path)
        print(f"  Uploading: {relative_path} ({file_size} bytes)", file=sys.stderr, flush=True)
        with open(local_path, 'rb') as f:
            bucket.put_object(oss_key, f.read())
        uploaded += 1
        upload_bytes += file_size

print(f"Uploaded {uploaded} files ({upload_bytes} bytes total) to {new_dataset_name}", file=sys.stderr, flush=True)

# Cleanup
shutil.rmtree(temp_dir, ignore_errors=True)
shutil.rmtree(output_path, ignore_errors=True)

print(json.dumps({
    'success': True,
    'dataset': new_dataset_name,
    'total_vectors': total_vectors
}))
`;

    const { stdout, stderr } = await execWithTimeout(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`, 180000);

    // Parse the output - get the last line which should be JSON
    const lines = stdout.trim().split('\n');
    const jsonLine = lines[lines.length - 1];
    const result = JSON.parse(jsonLine);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      dataset: result.dataset, // Use the new dataset name returned from Python
      vectors: result.total_vectors,
      dims,
      uploadTime: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("Update dataset error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        vectors: 0,
        dims: 0,
      },
      { status: 500 }
    );
  }
}

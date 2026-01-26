import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface VectorMetadataRequest {
  dataset: string;
}

interface DatasetMetadata {
  name: string;
  vectors: number;
  dimensions: number;
  schema: {
    id: string;
    vector: string;
    category: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataset } = body as VectorMetadataRequest;

    if (!dataset) {
      return NextResponse.json(
        { success: false, error: "Dataset is required" },
        { status: 400 }
      );
    }

    // Download dataset from OSS to temp location
    const tempDir = `/tmp/lance-metadata-${Date.now()}`;

    const pythonScript = `
import os
import sys
import json

# Clear proxy settings FIRST before any imports
for var in list(os.environ.keys()):
    if 'proxy' in var.lower():
        del os.environ[var]

import oss2
import lance

# OSS credentials (from environment)
auth = oss2.Auth(os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"])
bucket = oss2.Bucket(auth, os.environ.get("OSS_REGION", "oss-ap-southeast-1") + ".aliyuncs.com", os.environ.get("OSS_BUCKET", "denny-test-lance"))

# Dataset path in OSS
temp_dir = "${tempDir}"
dataset_name = "${dataset}"
oss_prefix = f"datasets/{dataset_name}/"

# Download dataset from OSS
os.makedirs(temp_dir, exist_ok=True)

result = bucket.list_objects(prefix=oss_prefix)
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

# Open Lance dataset
dataset = lance.dataset(temp_dir)

# Get metadata
vectors_count = dataset.count_rows()
schema = dataset.schema

# Get vector dimensions from schema
vector_dim = None
for field in schema:
    if field.name == 'vector':
        if hasattr(field.type, 'list_size'):
            vector_dim = field.type.list_size

# Cleanup
import shutil
shutil.rmtree(temp_dir, ignore_errors=True)

metadata = {
    'name': dataset_name,
    'vectors': vectors_count,
    'dimensions': vector_dim or 0,
    'schema': {
        'id': 'string',
        'vector': f'fixed_size_list[{vector_dim}]',
        'category': 'string'
    }
}

print(json.dumps({'success': True, 'metadata': metadata}))
`;

    const { stdout } = await execAsync(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`);

    const data = JSON.parse(stdout.trim());

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Get metadata error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

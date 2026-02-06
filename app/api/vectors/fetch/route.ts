import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface VectorFetchRequest {
  dataset: string;
  docId: string;
}

interface VectorData {
  _id: string;
  id: string;
  title: string;
  text: string;
  topic: string;
  category: string;
  vector: number[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataset, docId } = body as VectorFetchRequest;

    if (!dataset || !docId) {
      return NextResponse.json(
        { success: false, error: "Dataset and docId are required" },
        { status: 400 }
      );
    }

    // Download dataset from OSS to temp location
    const tempDir = `/tmp/lance-fetch-${Date.now()}`;

    // First, we need to get the OSS credentials and dataset info
    // For now, we'll use a Python script to:
    // 1. Download the dataset from OSS
    // 2. Query for the specific document
    // 3. Return the vector data

    const pythonScript = `
import os
import sys
import json

# Clear proxy settings FIRST before any imports
for var in list(os.environ.keys()):
    if 'proxy' in var.lower():
        del os.environ[var]

import oss2
import lancedb

# OSS credentials (from environment)
auth = oss2.Auth(os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"])
bucket = oss2.Bucket(auth, os.environ.get("OSS_REGION", "oss-ap-southeast-1") + ".aliyuncs.com", os.environ.get("OSS_BUCKET", "denny-test-lance"))

# Dataset path in OSS
temp_dir = "${tempDir}"
dataset_name = "${dataset}"
oss_prefix = f"datasets/{dataset_name}/"

# Download dataset from OSS
os.makedirs(temp_dir, exist_ok=True)

import sys
print("Downloading dataset from OSS...", file=sys.stderr, flush=True)
result = bucket.list_objects(prefix=oss_prefix)
downloaded = 0

for obj in result.object_list:
    if not obj.key.endswith('/'):
        # Get relative path from OSS prefix (e.g., _versions/1.manifest)
        relative_path = obj.key.replace(oss_prefix, '')
        # Download to temp directory
        local_file = os.path.join(temp_dir, relative_path)
        os.makedirs(os.path.dirname(local_file), exist_ok=True)
        # Download file content from OSS and write to local file
        object_data = bucket.get_object(obj.key)
        with open(local_file, 'wb') as f:
            f.write(object_data.read())
        downloaded += 1

print(f"Downloaded {downloaded} files", file=sys.stderr, flush=True)

# Open Lance dataset using LanceDB (new API)
db = lancedb.connect(temp_dir)

# Get table names and open the first one
tables = db.list_tables()
if not tables:
    raise Exception("No tables found in LanceDB database")
table = db.open_table(tables[0])

# Load all data to pandas dataframe
df = table.to_pandas()
query_data = df.to_dict('list')

# Find the document
result = None
for i in range(len(query_data['_id'])):
    doc_id = query_data['_id'][i]
    if doc_id == "${docId}":
        # Helper function to convert PyArrow scalars
        def to_string(val):
            if hasattr(val, 'as_py'):
                return val.as_py()
            return str(val)

        def to_list(val):
            if hasattr(val, 'as_py'):
                val = val.as_py()
            if hasattr(val, 'tolist'):
                return val.tolist()
            return list(val)

        result = {
            '_id': to_string(doc_id),
            'id': to_string(query_data['id'][i]),
            'title': to_string(query_data['title'][i]),
            'text': to_string(query_data['text'][i]),
            'topic': to_string(query_data['topic'][i]),
            'category': to_string(query_data['category'][i]),
            'vector': to_list(query_data['vector'][i])
        }
        break

# Cleanup
import shutil
shutil.rmtree("${tempDir}", ignore_errors=True)

if result:
    print(json.dumps({'success': True, 'data': result}))
else:
    print(json.dumps({'success': False, 'error': 'Document not found'}))
`;

    const { stdout } = await execAsync(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`);

    const data = JSON.parse(stdout.trim());

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Fetch vector error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

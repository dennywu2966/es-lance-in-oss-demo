import { NextRequest, NextResponse } from "next/server";

interface BackfillRequest {
  dataset: string;
  esEndpoint?: string;
  esIndex?: string;
}

interface BackfillResponse {
  success: boolean;
  indexed?: number;
  failed?: number;
  error?: string;
  details?: string;
}

// Helper to fetch dataset metadata and sample
async function getDatasetSample(dataset: string): Promise<{ _id: string[]; category: string[]; text: string[] }> {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  const tempDir = `/tmp/lance-backfill-${Date.now()}`;

  const pythonScript = `
import os
import sys

# Clear proxy settings
for var in list(os.environ.keys()):
    if 'proxy' in var.lower():
        del os.environ[var]

import oss2
import lance

# OSS credentials (from environment)
auth = oss2.Auth(os.environ["OSS_ACCESS_KEY_ID"], os.environ["OSS_ACCESS_KEY_SECRET"])
bucket = oss2.Bucket(auth, os.environ.get("OSS_REGION", "oss-ap-southeast-1") + ".aliyuncs.com", os.environ.get("OSS_BUCKET", "denny-test-lance"))

temp_dir = "${tempDir}"
dataset_name = "${dataset}"
oss_prefix = f"datasets/{dataset_name}/"

# Download dataset from OSS
os.makedirs(temp_dir, exist_ok=True)
result = bucket.list_objects(prefix=oss_prefix)
for obj in result.object_list:
    if not obj.key.endswith('/'):
        relative_path = obj.key.replace(oss_prefix, '')
        local_file = os.path.join(temp_dir, relative_path)
        os.makedirs(os.path.dirname(local_file), exist_ok=True)
        object_data = bucket.get_object(obj.key)
        with open(local_file, 'wb') as f:
            f.write(object_data.read())

dataset = lance.dataset(temp_dir)
table = dataset.to_table()
data = table.to_pydict()

# Sample first 100 to avoid timeout
sample_size = min(100, len(data['_id']))
output = {
    '_id': [data['_id'][i].as_py() if hasattr(data['_id'][i], 'as_py') else data['_id'][i] for i in range(sample_size)],
    'category': [data['category'][i].as_py() if hasattr(data['category'][i], 'as_py') else data['category'][i] for i in range(sample_size)],
    'text': [data['text'][i].as_py() if hasattr(data['text'][i], 'as_py') else data['text'][i] for i in range(sample_size)]
}

import json
import shutil
shutil.rmtree(temp_dir, ignore_errors=True)
print(json.dumps(output))
`;

  const { stdout } = await execAsync(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`);

  return JSON.parse(stdout.trim());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as BackfillRequest;
    const { dataset } = body;

    if (!dataset) {
      return NextResponse.json(
        { success: false, error: "Dataset name is required" },
        { status: 400 }
      );
    }

    const ES_HOST = body.esEndpoint || process.env.ES_HOST || 'http://localhost:9200';
    const ES_INDEX = body.esIndex || process.env.ES_INDEX || 'lance-validation-test';
    const ES_AUTH = Buffer.from('elastic-admin:elastic-password').toString('base64');

    // Fetch dataset sample
    const sample = await getDatasetSample(dataset);

    let indexed = 0;
    let failed = 0;

    // Index documents in batches
    const batchSize = 10;
    for (let i = 0; i < sample._id.length; i += batchSize) {
      const batch = sample._id.slice(i, i + batchSize);

      const bulkBody = batch.flatMap((id, idx) => {
        const category = sample.category[i + idx];
        const text = sample.text[i + idx];

        return [
          { index: { _index: ES_INDEX, _id: id } },
          { document: { id, category, text, embedding: { is_indexing: true } } },
        ];
      });

      const response = await fetch(`${ES_HOST}/_bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Authorization': `Basic ${ES_AUTH}`,
        },
        body: bulkBody.map((line) => JSON.stringify(line)).join('\n') + '\n',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.errors) {
          failed += batch.length;
        } else {
          indexed += batch.length;
        }
      } else {
        failed += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      indexed,
      failed,
      details: `Backfilled ${indexed} documents from dataset "${dataset}" to index "${ES_INDEX}"`,
    });
  } catch (error: any) {
    console.error('Backfill error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Backfill failed',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}

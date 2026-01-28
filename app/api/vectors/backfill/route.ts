import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import OSS from "ali-oss";

const execAsync = promisify(exec);

// OSS Configuration
const OSS_CONFIG = {
  region: process.env.OSS_REGION || "oss-ap-southeast-1",
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
  bucket: process.env.OSS_BUCKET || "denny-test-lance",
};

const client = new OSS(OSS_CONFIG);

interface BackfillRequest {
  dataset?: string;
  esIndex?: string;
  createIndex?: boolean;
}

interface BackfillResponse {
  success: boolean;
  indexedDocuments?: number;
  totalDocuments?: number;
  vectorDimensions?: number;
  duration?: string;
  esIndex?: string;
  message?: string;
  error?: string;
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
async function createESIndex(esIndex: string, datasetUri?: string): Promise<void> {
  const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';

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
    category: { type: "keyword" }
  };

  // Add lance_vector field if dataset URI is provided
  if (datasetUri) {
    properties.embedding = {
      type: "lance_vector",
      dims: 768,
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

  const response = await fetch(`${ES_HOST}/${esIndex}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from('elastic:mdNf7J+HVTB33syeww7i').toString('base64')}`
    },
    body: JSON.stringify(mapping)
  });

  if (!response.ok && response.status !== 400) {
    // 400 might mean index already exists, which is ok
    throw new Error(`Failed to create ES index: ${response.status} ${response.statusText}`);
  }
}

// Index a batch of documents into Elasticsearch (metadata only, no vectors)
async function indexDocuments(esIndex: string, documents: DocumentMetadata[]): Promise<void> {
  const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';

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
        category: doc.category
      }
    );
  }

  // Execute bulk request
  const response = await fetch(`${ES_HOST}/_bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Authorization': `Basic ${Buffer.from('elastic:mdNf7J+HVTB33syeww7i').toString('base64')}`
    },
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
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json() as BackfillRequest;
    const { dataset, esIndex, createIndex = true } = body;

    if (!dataset) {
      return NextResponse.json({
        success: false,
        error: "Dataset name is required. Please specify which dataset to backfill.",
      }, { status: 400 });
    }

    const finalEsIndex = esIndex || process.env.ES_INDEX || 'lance-validation-test';
    const tempDir = `/tmp/lance-backfill-${Date.now()}`;
    const datasetPath = `datasets/${dataset}`;

    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Download dataset from OSS
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
      const relativePath = obj.name.replace(`${datasetPath}/`, "");
      const localFilePath = `${tempDir}/${relativePath}`;

      // Ensure directory exists
      const dir = localFilePath.substring(0, localFilePath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });

      await client.get(obj.name, localFilePath);
    }

    // Read documents (metadata only, no vectors) using Python
    const pythonScript = `
import os
import sys
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

import lance
import json

dataset_path = "${tempDir}"

# Open dataset
dataset = lance.dataset(dataset_path)

# Get total count
total = dataset.count_rows()

# Load all documents without vectors (vectors stored in Lance, not ES)
table = dataset.to_table(columns=['_id', 'id', 'title', 'text', 'topic', 'category'])

# Convert to list of dicts
data = table.to_pydict()

result = []
for i in range(len(data['id'])):
    # Helper function to convert PyArrow scalars
    def to_string(val):
        if hasattr(val, 'as_py'):
            return val.as_py()
        return str(val)

    result.append({
        '_id': to_string(data['_id'][i]),
        'id': to_string(data['id'][i]),
        'title': to_string(data['title'][i]),
        'text': to_string(data['text'][i]),
        'topic': to_string(data['topic'][i]),
        'category': to_string(data['category'][i])
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

    // Create ES index if requested
    if (createIndex) {
      try {
        // Construct OSS URI for lance_vector field
        const datasetUri = `oss://${OSS_CONFIG.bucket}/${datasetPath}`;
        await createESIndex(finalEsIndex, datasetUri);
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
      await indexDocuments(finalEsIndex, batch);
      indexedCount += batch.length;
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      esIndex: finalEsIndex,
      totalDocuments: documents.length,
      indexedDocuments: indexedCount,
      duration: `${duration}ms`,
      message: `Successfully backfilled ${indexedCount} documents (metadata only) to Elasticsearch index "${finalEsIndex}". Vectors remain in Lance/OSS for efficient kNN search.`,
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

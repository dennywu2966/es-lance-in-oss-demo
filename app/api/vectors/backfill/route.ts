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

interface DocumentWithVector {
  id: string;
  title: string;
  text: string;
  topic: string;
  created_at: string;
  vector: number[];
}

// Create Elasticsearch index with proper mapping for dense_vector
async function createESIndex(esIndex: string): Promise<void> {
  const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';

  const mapping = {
    mappings: {
      properties: {
        id: { type: "keyword" },
        title: {
          type: "text",
          fields: {
            keyword: { type: "keyword" }
          }
        },
        text: { type: "text" },
        topic: { type: "keyword" },
        created_at: { type: "date" },
        embedding: {
          type: "dense_vector",
          dims: 768,
          index: true,
          similarity: "cosine"
        }
      }
    }
  };

  const response = await fetch(`${ES_HOST}/${esIndex}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from('elastic-admin:elastic-password').toString('base64')}`
    },
    body: JSON.stringify(mapping)
  });

  if (!response.ok && response.status !== 400) {
    // 400 might mean index already exists, which is ok
    throw new Error(`Failed to create ES index: ${response.status} ${response.statusText}`);
  }
}

// Index a batch of documents into Elasticsearch
async function indexDocuments(esIndex: string, documents: DocumentWithVector[]): Promise<void> {
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
        created_at: doc.created_at,
        embedding: doc.vector
      }
    );
  }

  // Execute bulk request
  const response = await fetch(`${ES_HOST}/_bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Authorization': `Basic ${Buffer.from('elastic-admin:elastic-password').toString('base64')}`
    },
    body: bulkBody.map((line) => JSON.stringify(line)).join('\n') + '\n'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to index documents: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data.errors) {
    console.error('Bulk indexing had errors:', data.items);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json() as BackfillRequest;
    const esIndex = body.esIndex || process.env.ES_INDEX || 'lance-validation-test';
    const shouldCreateIndex = body.createIndex !== false; // Default to true

    const tempDir = `/tmp/lance-backfill-${Date.now()}`;
    const datasetPath = "lance-documents/dataset.lance";
    const localPath = `${tempDir}/dataset.lance`;

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
        error: "No documents dataset found in OSS. Please generate documents first.",
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

    // Read documents with vectors using Python
    const pythonScript = `
import os
import sys
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

import lance
import json

dataset_path = "${localPath}"

# Open dataset
dataset = lance.dataset(dataset_path)

# Get total count
total = dataset.count_rows()

# Load all documents with vectors
table = dataset.to_table()

# Convert to list of dicts
data = table.to_pydict()

result = []
for i in range(len(data['id'])):
    # Extract vector data
    vec_data = data['vector'][i]
    if hasattr(vec_data, 'as_py'):
        vec_data = vec_data.as_py()
    vector_list = vec_data.tolist() if hasattr(vec_data, 'tolist') else list(vec_data)

    result.append({
        'id': data['id'][i],
        'title': data['title'][i],
        'text': data['text'][i],
        'topic': data['topic'][i],
        'created_at': data['created_at'][i],
        'vector': vector_list
    })

# Output as JSON
print(json.dumps({'documents': result, 'total': total}))
`;

    const { stdout } = await execAsync(
      `python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`
    );

    const parsedOutput = JSON.parse(stdout.trim());
    const documents: DocumentWithVector[] = parsedOutput.documents;

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
    if (shouldCreateIndex) {
      try {
        await createESIndex(esIndex);
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
      await indexDocuments(esIndex, batch);
      indexedCount += batch.length;
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      esIndex,
      totalDocuments: documents.length,
      indexedDocuments: indexedCount,
      duration: `${duration}ms`,
      vectorDimensions: documents[0]?.vector.length || 0,
      message: `Successfully backfilled ${indexedCount} documents to Elasticsearch index "${esIndex}"`,
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

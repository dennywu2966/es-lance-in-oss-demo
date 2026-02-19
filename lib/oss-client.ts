import OSS from 'ali-oss';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// Read OSS credentials from file or environment variables
export async function getOSSConfig() {
  // Try environment variables first
  if (process.env.OSS_ACCESS_KEY_ID && process.env.OSS_ACCESS_KEY_SECRET) {
    const endpoint = process.env.OSS_ENDPOINT || 'oss-ap-southeast-1.aliyuncs.com';
    return {
      region: endpoint.replace('.aliyuncs.com', ''),
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      bucket: process.env.OSS_BUCKET || 'denny-test-lance',
    };
  }

  // Fallback to credentials file - read endpoint from credentials
  try {
    const credsPath = path.join(process.env.HOME || '', '.oss', 'credentials.json');
    const credsContent = await fs.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(credsContent);

    // Use the endpoint from credentials file (supports internal endpoints)
    const endpoint = creds.endpoint || 'oss-ap-southeast-1.aliyuncs.com';
    const region = endpoint.replace('.aliyuncs.com', '');

    return {
      region,
      endpoint,
      accessKeyId: creds.access_key_id,
      accessKeySecret: creds.access_key_secret,
      bucket: creds.bucket_name || 'denny-test-lance',
    };
  } catch (error) {
    throw new Error('Failed to read OSS credentials from environment or ~/.oss/credentials.json');
  }
}

// Lazy OSS client - initialized on first use
let clientInstance: OSS | null = null;

export async function getClient(): Promise<OSS> {
  if (!clientInstance) {
    const config = await getOSSConfig();
    clientInstance = new OSS(config);
  }
  return clientInstance;
}

export interface VectorDataset {
  name: string;
  vectors: number;
  dims: number;
  size: string;
  lastModified: string;
  shardCount?: number;
  shardingStrategy?: 'NONE' | 'ES_ROUTING';
  shardPath?: string;
  datasetName?: string;
  uriPrefix?: string;
  // Compatibility fields for clients expecting snake_case
  shard_count?: number;
  sharding_strategy?: 'NONE' | 'ES_ROUTING';
  shard_path?: string;
  dataset_name?: string;
  uri_prefix?: string;
}

export interface GenerateResult {
  success: boolean;
  dataset?: string;
  vectors: number;
  dims: number;
  shardCount?: number;
  shardingStrategy?: 'NONE' | 'ES_ROUTING';
  error?: string;
  uploadTime?: number;
}

async function readDatasetMetadata(client: OSS, metaObjectKey: string): Promise<Record<string, any> | null> {
  try {
    const metaRes = await client.get(metaObjectKey);
    const content = (metaRes as any)?.content;
    let raw = '';

    if (typeof content === 'string') {
      raw = content;
    } else if (Buffer.isBuffer(content)) {
      raw = content.toString('utf-8');
    } else if (content != null) {
      raw = String(content);
    }

    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to read dataset metadata from ${metaObjectKey}:`, error);
    return null;
  }
}

// List all Lance datasets in OSS
export async function listDatasets(): Promise<VectorDataset[]> {
  try {
    const client = await getClient();
    const result = await client.list({
      prefix: 'datasets/',
      'max-keys': 100,
    });

    if (!result.objects) return [];

    // Group by dataset directory and accumulate sizes
    const datasets = new Map<string, VectorDataset>();
    const datasetSizes = new Map<string, number>();
    const datasetMetaObjects = new Map<string, string>();

    for (const obj of result.objects) {
      const match = obj.name.match(/datasets\/([^/]+)\//);
      if (match) {
        const datasetName = match[1];

        if (obj.name.endsWith('/dataset.meta.json')) {
          datasetMetaObjects.set(datasetName, obj.name);
        }

        // Accumulate total size
        datasetSizes.set(datasetName, (datasetSizes.get(datasetName) || 0) + obj.size);

        if (!datasets.has(datasetName)) {
          // Parse metadata from filename
          // Try pattern: vectors-100-dims-768-timestamp
          let metaMatch = datasetName.match(/vectors-(\d+)-dims-(\d+)/);
          let vectors = 0;
          let dims = 0;

          // Try pattern: real-87k-dims-768
          if (!metaMatch) {
            metaMatch = datasetName.match(/real-(\d+)k-dims-(\d+)/);
            if (metaMatch) {
              // Convert "87k" to actual number (known exact counts)
              const kValue = metaMatch[1];
              if (kValue === '87') {
                vectors = 87394; // Exact count from ag_news dataset
              } else {
                vectors = parseInt(kValue) * 1000;
              }
              dims = parseInt(metaMatch[2]);
              datasets.set(datasetName, {
                name: datasetName,
                vectors,
                dims,
                size: formatBytes(obj.size), // Will be updated later
                lastModified: new Date(obj.lastModified).toISOString(),
                shardCount: 1,
                shardingStrategy: 'NONE',
                shard_count: 1,
                sharding_strategy: 'NONE',
              });
              continue;
            }
          }

          // Try pattern: test-small-20-dims-768
          if (!metaMatch) {
            metaMatch = datasetName.match(/test-small-(\d+)-dims-(\d+)/);
            if (metaMatch) {
              vectors = parseInt(metaMatch[1]);
              dims = parseInt(metaMatch[2]);
              datasets.set(datasetName, {
                name: datasetName,
                vectors,
                dims,
                size: formatBytes(obj.size),
                lastModified: new Date(obj.lastModified).toISOString(),
                shardCount: 1,
                shardingStrategy: 'NONE',
                shard_count: 1,
                sharding_strategy: 'NONE',
              });
              continue;
            }
          }

          // Use matched values or defaults
          vectors = metaMatch ? parseInt(metaMatch[1]) : 0;
          dims = metaMatch ? parseInt(metaMatch[2]) : 0;

          datasets.set(datasetName, {
            name: datasetName,
            vectors,
            dims,
            size: formatBytes(obj.size), // Will be updated later
            lastModified: new Date(obj.lastModified).toISOString(),
            shardCount: 1,
            shardingStrategy: 'NONE',
            shard_count: 1,
            sharding_strategy: 'NONE',
          });
        }
      }
    }

    // Update sizes with accumulated totals
    for (const [datasetName, totalSize] of datasetSizes) {
      const dataset = datasets.get(datasetName);
      if (dataset) {
        dataset.size = formatBytes(totalSize);
      }
    }

    // Enrich from metadata sidecar if available
    for (const [datasetName, metaKey] of datasetMetaObjects) {
      const dataset = datasets.get(datasetName);
      if (!dataset) continue;

      const metadata = await readDatasetMetadata(client, metaKey);
      if (!metadata) continue;

      const shardCountValue = Number(metadata.shard_count ?? metadata.shardCount ?? dataset.shardCount ?? 1);
      const normalizedShardCount = Number.isFinite(shardCountValue) && shardCountValue > 0 ? Math.floor(shardCountValue) : 1;
      const strategyRaw = String(metadata.sharding_strategy ?? metadata.shardingStrategy ?? dataset.shardingStrategy ?? 'NONE').toUpperCase();
      const normalizedStrategy: 'NONE' | 'ES_ROUTING' = strategyRaw === 'ES_ROUTING' ? 'ES_ROUTING' : 'NONE';
      const shardPath = metadata.shard_path ?? metadata.shardPath;
      const datasetNameInStorage = metadata.dataset_name ?? metadata.datasetName;
      const uriPrefixInStorage = metadata.uri_prefix ?? metadata.uriPrefix;
      const vectorsValue = Number(metadata.vectors);
      const dimsValue = Number(metadata.dims);

      dataset.shardCount = normalizedShardCount;
      dataset.shard_count = normalizedShardCount;
      dataset.shardingStrategy = normalizedStrategy;
      dataset.sharding_strategy = normalizedStrategy;

      if (typeof shardPath === 'string' && shardPath.length > 0) {
        dataset.shardPath = shardPath;
        dataset.shard_path = shardPath;
      }

      if (typeof datasetNameInStorage === 'string' && datasetNameInStorage.length > 0) {
        dataset.datasetName = datasetNameInStorage;
        dataset.dataset_name = datasetNameInStorage;
      }
      if (typeof uriPrefixInStorage === 'string' && uriPrefixInStorage.length > 0) {
        dataset.uriPrefix = uriPrefixInStorage;
        dataset.uri_prefix = uriPrefixInStorage;
      }

      if (Number.isFinite(vectorsValue) && vectorsValue > 0) {
        dataset.vectors = Math.floor(vectorsValue);
      }
      if (Number.isFinite(dimsValue) && dimsValue > 0) {
        dataset.dims = Math.floor(dimsValue);
      }
    }

    return Array.from(datasets.values()).sort(
      (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );
  } catch (error: any) {
    console.error('Failed to list datasets:', error);
    throw new Error(`Failed to list datasets: ${error.message}`);
  }
}

// Delete a dataset from OSS
export async function deleteDataset(datasetName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getClient();
    const result = await client.list({
      prefix: `datasets/${datasetName}/`,
    });

    if (result.objects) {
      // Delete all objects in the dataset
      for (const obj of result.objects) {
        await client.delete(obj.name);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete dataset:', error);
    return { success: false, error: error.message };
  }
}

// Retry wrapper for Jina API calls — handles HTTP 429 with exponential back-off.
// Exported so hybrid/route.ts can reuse the same logic.
export async function jinaFetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.status !== 429) {
      return response; // success or non-retryable error — let caller handle
    }

    // 429 — back off before retry
    if (attempt === maxRetries) {
      lastError = new Error(`Jina API error: 429 (exhausted ${maxRetries} retries)`);
      break;
    }

    // Honour Retry-After header if present; otherwise exponential back-off
    const retryAfter = response.headers.get('Retry-After');
    const delayMs = retryAfter
      ? Math.min(parseInt(retryAfter, 10) * 1000, 120000)
      : baseDelayMs * Math.pow(2, attempt);

    console.log(`Jina 429 — retry ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw lastError!;
}

// Generate Lance dataset and upload to OSS with GLM docs and Jina embeddings
export async function generateAndUploadDataset(
  vectors: number,
  dims: number,
  options?: {
    shardCount?: number;
    shardingStrategy?: 'NONE' | 'ES_ROUTING';
  }
): Promise<GenerateResult> {
  const startTime = Date.now();
  const tempDir = `/tmp/lance-gen-${Date.now()}`;
  const normalizedShardCount = Math.max(1, Math.floor(options?.shardCount ?? 1));
  const normalizedShardingStrategy: 'NONE' | 'ES_ROUTING' =
    (options?.shardingStrategy || 'NONE') === 'ES_ROUTING' ? 'ES_ROUTING' : 'NONE';
  const strategySlug = normalizedShardingStrategy.toLowerCase().replace('_', '-');
  const datasetName = `vectors-${vectors}-dims-${dims}-shards-${normalizedShardCount}-${strategySlug}-${Date.now()}`;
  const localPath = `${tempDir}/${datasetName}.lance`;

  const GLM_API_KEY = process.env.GLM_API_KEY || '74830934db8146fb84b2c12daa182d5f.NnK1nfrYHm4Tqdgc';
  const JINA_API_KEY = process.env.JINA_API_KEY || 'jina_4d22586fca5140e99831e91c67f7b09aBX3XfmHSkXlBEhn3PvJna9cZYOXb';

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Step 1: Generate fake documents using GLM API
    console.log('Generating documents with GLM...');
    const documents: Array<{id: string; title: string; text: string; topic: string}> = [];

    // Generate documents in parallel batches for better performance
    const glmBatchSize = 10;
    for (let i = 0; i < vectors; i += glmBatchSize) {
      const currentBatch = Math.min(glmBatchSize, vectors - i);
      const batchPromises: Promise<void>[] = [];

      for (let j = 0; j < currentBatch; j++) {
        const topics = ['Vector Databases', 'Machine Learning', 'Elasticsearch', 'Cloud Computing', 'Neural Networks', 'Natural Language Processing', 'DevOps', 'Data Engineering', 'Microservices', 'Deep Learning'];
        const selectedTopic = topics[Math.floor(Math.random() * topics.length)];

        const docPromise = (async () => {
          try {
            const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GLM_API_KEY}`,
              },
              body: JSON.stringify({
                model: 'GLM-4-Flash',
                messages: [
                  {
                    role: 'user',
                    content: `Generate a short technical document (150-200 words) about ${selectedTopic}. Include a title and the main content. Return as JSON with "title" and "text" fields.`
                  }
                ],
                temperature: 0.7,
                max_tokens: 500,
              }),
            });

            if (!response.ok) {
              throw new Error(`GLM API error: ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            // Parse the JSON response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const docContent = JSON.parse(jsonMatch[0]);
              documents.push({
                id: `doc_${String(i + j).padStart(4, '0')}`,
                title: docContent.title || `${selectedTopic} Overview`,
                text: docContent.text || content,
                topic: selectedTopic
              });
            } else {
              // Fallback if JSON parsing fails
              documents.push({
                id: `doc_${String(i + j).padStart(4, '0')}`,
                title: `${selectedTopic} - Document ${i + j}`,
                text: content,
                topic: selectedTopic
              });
            }
          } catch (error: any) {
            console.error(`Failed to generate document ${i + j}:`, error.message);
            // Fallback to simple text
            documents.push({
              id: `doc_${String(i + j).padStart(4, '0')}`,
              title: `${selectedTopic} - Article ${i + j}`,
              text: `This document discusses ${selectedTopic} concepts, implementations, and best practices in modern software development.`,
              topic: selectedTopic
            });
          }
        })();

        batchPromises.push(docPromise);
      }

      // Wait for all documents in batch to complete
      await Promise.all(batchPromises);

      // Rate limiting delay between batches (reduced from 500ms to 100ms)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Generated ${documents.length} documents`);

    // Step 2: Generate embeddings using Jina API (parallelized for speed)
    console.log('Generating embeddings with Jina...');
    const embeddings: number[][] = [];
    const jinaBatchSize = 50;

    for (let i = 0; i < documents.length; i += jinaBatchSize) {
      const batch = documents.slice(i, i + jinaBatchSize);
      try {
        // Send entire batch as a single Jina API call (input accepts string[])
        const response = await jinaFetchWithRetry('https://api.jina.ai/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JINA_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'jina-embeddings-v2-base-en',
            input: batch.map(doc => doc.text),
            encoding_type: 'float',
          }),
        }, 5, 2000); // generate is slow-tolerant: 5 retries, 2s base delay

        if (!response.ok) {
          throw new Error(`Jina API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.data && data.data.length === batch.length) {
          data.data.forEach((item: any) => {
            if (item.embedding) {
              embeddings.push(item.embedding);
            } else {
              throw new Error('Invalid response format from Jina API');
            }
          });
        } else {
          throw new Error(`Jina returned ${data.data?.length ?? 0} embeddings, expected ${batch.length}`);
        }
      } catch (error: any) {
        console.error(`Failed to generate embeddings for batch starting at ${i}:`, error.message);
        throw error;
      }

      // Rate-limit-friendly delay between batches
      if (i + jinaBatchSize < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`Generated ${embeddings.length} embeddings with ${embeddings[0].length} dimensions`);

    // Step 3: Create Lance dataset with documents and embeddings.
    // Use temp files instead of embedding large JSON directly in shell command to avoid E2BIG.
    const records = documents.map((doc, idx) => ({
      _id: doc.id,
      ...doc,
      vector: embeddings[idx],
    }));
    const payloadPath = `${tempDir}/documents-with-embeddings.json`;
    const generatorScriptPath = `${tempDir}/build_lance_dataset.py`;
    await fs.writeFile(payloadPath, JSON.stringify(records), 'utf-8');

    const generatorScript = `
import json
import os
import sys

os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

import numpy as np
import lancedb
import pyarrow as pa

if len(sys.argv) != 3:
    raise RuntimeError("Usage: build_lance_dataset.py <payload.json> <output_path>")

payload_path = sys.argv[1]
output_path = sys.argv[2]
dataset_name = "data"

with open(payload_path, "r", encoding="utf-8") as f:
    documents_data = json.load(f)

if not isinstance(documents_data, list) or len(documents_data) == 0:
    raise RuntimeError("No documents to write")

vectors_array = np.array([doc['vector'] for doc in documents_data], dtype=np.float32)
dims = vectors_array.shape[1]

flat_vectors = vectors_array.flatten()
vector_array = pa.FixedSizeListArray.from_arrays(
    pa.array(flat_vectors, type=pa.float32()),
    dims
)

categories = np.array([doc.get('topic') for doc in documents_data])
table = pa.table({
    '_id': pa.array([doc.get('_id') for doc in documents_data]),
    'id': pa.array([doc.get('id') for doc in documents_data]),
    'title': pa.array([doc.get('title') for doc in documents_data]),
    'text': pa.array([doc.get('text') for doc in documents_data]),
    'topic': pa.array([doc.get('topic') for doc in documents_data]),
    'category': pa.array(categories.tolist()),
    'vector': vector_array
})

db = lancedb.connect(output_path)
tb = db.create_table(dataset_name, table, mode="overwrite")

n_vectors = len(documents_data)
if n_vectors >= 100:
    num_partitions = max(2, min(n_vectors // 10, 32))
    tb.create_index(
        vector_column_name="vector",
        index_type="IVF_PQ",
        metric="cosine",
        num_partitions=num_partitions,
        num_sub_vectors=min(dims // 8, 64),
        replace=True
    )

print(f"Created: {tb.count_rows()} documents with {dims}-dim vectors")
`;
    await fs.writeFile(generatorScriptPath, generatorScript, { encoding: 'utf-8', mode: 0o700 });
    await execAsync(`python3 ${JSON.stringify(generatorScriptPath)} ${JSON.stringify(payloadPath)} ${JSON.stringify(localPath)}`);

    // Upload to OSS
    const client = await getClient();
    const files = await getAllFiles(localPath);

    for (const file of files) {
      const relativePath = file.replace(localPath + '/', '');
      const ossKey = `datasets/${datasetName}/${relativePath}`;

      await client.put(ossKey, file);
    }

    // Persist dataset profile metadata for downstream auto-detection
    const metadata = {
      version: 1,
      dataset: datasetName,
      vectors: documents.length,
      dims: embeddings[0].length,
      shard_count: normalizedShardCount,
      sharding_strategy: normalizedShardingStrategy,
      dataset_name: 'data.lance',
    };
    await client.put(
      `datasets/${datasetName}/dataset.meta.json`,
      Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8')
    );

    const uploadTime = Date.now() - startTime;

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      success: true,
      dataset: datasetName,
      vectors: documents.length,
      dims: embeddings[0].length,
      shardCount: normalizedShardCount,
      shardingStrategy: normalizedShardingStrategy,
      uploadTime,
    };
  } catch (error: any) {
    // Cleanup on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      success: false,
      vectors: 0,
      dims: 0,
      error: error.message,
    };
  }
}

// Helper: Get all files recursively
async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function traverse(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  await traverse(dirPath);
  return files;
}

// Helper: Format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Document interface for fake documents
export interface FakeDocument {
  id: string;
  title: string;
  text: string;
  topic: string;
  created_at: string;
}

// Hardcoded fake documents covering tech topics
const FAKE_DOCUMENTS: FakeDocument[] = [
  {
    id: "doc-001",
    title: "Introduction to Vector Databases",
    text: "Vector databases are specialized databases designed to store and query vector embeddings efficiently. Unlike traditional databases that use exact matches, vector databases use approximate nearest neighbor (ANN) algorithms to find similar vectors based on distance metrics like cosine similarity or Euclidean distance. They're essential for AI applications including semantic search, recommendation systems, and image recognition.",
    topic: "databases",
    created_at: "2024-01-15T10:00:00Z"
  },
  {
    id: "doc-002",
    title: "Machine Learning Model Optimization",
    text: "Optimizing machine learning models involves various techniques including quantization, pruning, and knowledge distillation. Quantization reduces the precision of model weights from 32-bit floating point to 8-bit integers, significantly reducing model size and improving inference speed without substantial accuracy loss. These techniques are crucial for deploying ML models in production environments with limited resources.",
    topic: "machine-learning",
    created_at: "2024-01-16T14:30:00Z"
  },
  {
    id: "doc-003",
    title: "Elasticsearch Query DSL Guide",
    text: "Elasticsearch provides a powerful Query DSL (Domain Specific Language) based on JSON. It supports various query types including match queries for full-text search, term queries for exact matching, range queries for numeric and date fields, and bool queries for combining multiple query clauses. Understanding the query DSL is essential for building effective search applications.",
    topic: "search-engines",
    created_at: "2024-01-17T09:15:00Z"
  },
  {
    id: "doc-004",
    title: "Cloud Computing Service Models",
    text: "Cloud computing offers three main service models: Infrastructure as a Service (IaaS), Platform as a Service (PaaS), and Software as a Service (SaaS). IaaS provides virtualized computing resources like AWS EC2, PaaS offers development and deployment platforms like Google App Engine, and SaaS delivers applications over the internet like Salesforce. Each model offers different levels of control and management responsibility.",
    topic: "cloud-computing",
    created_at: "2024-01-18T16:45:00Z"
  },
  {
    id: "doc-005",
    title: "Natural Language Processing with Transformers",
    text: "Transformer architecture has revolutionized natural language processing. Models like BERT, GPT, and T5 use self-attention mechanisms to process sequential data more effectively than recurrent neural networks. They can be pre-trained on massive text corpora and fine-tuned for specific tasks like text classification, named entity recognition, and question answering.",
    topic: "ai",
    created_at: "2024-01-19T11:20:00Z"
  },
  {
    id: "doc-006",
    title: "Distributed Systems Consistency Models",
    text: "Distributed systems must balance consistency and availability according to the CAP theorem. Strong consistency ensures all nodes see the same data simultaneously but may impact availability. Eventually consistent systems prioritize availability and partition tolerance, with updates propagating asynchronously. Understanding these trade-offs is crucial for designing reliable distributed applications.",
    topic: "distributed-systems",
    created_at: "2024-01-20T13:00:00Z"
  },
  {
    id: "doc-007",
    title: "Container Orchestration with Kubernetes",
    text: "Kubernetes has become the de facto standard for container orchestration. It automates deployment, scaling, and management of containerized applications across clusters of hosts. Key features include service discovery, load balancing, storage orchestration, automated rollouts and rollbacks, and self-healing capabilities. Kubernetes abstracts infrastructure complexity, enabling developers to focus on application logic.",
    topic: "devops",
    created_at: "2024-01-21T10:30:00Z"
  },
  {
    id: "doc-008",
    title: "Real-time Data Processing with Apache Kafka",
    text: "Apache Kafka is a distributed event streaming platform capable of handling trillions of events per day. It provides high-throughput, low-latency data streams with fault-tolerant storage. Kafka is used for log aggregation, real-time analytics, event sourcing, and as a message broker in microservices architectures. Its pub-sub model with partitioning enables scalable data processing pipelines.",
    topic: "data-engineering",
    created_at: "2024-01-22T15:00:00Z"
  },
  {
    id: "doc-009",
    title: "Graph Databases and Network Analysis",
    text: "Graph databases like Neo4j are designed for storing and querying connected data. They use graph structures with nodes, edges, and properties to represent and navigate relationships. This makes them ideal for social networks, recommendation engines, fraud detection, and knowledge graphs. Graph databases excel at queries involving multiple levels of relationships that would require complex JOINs in relational databases.",
    topic: "databases",
    created_at: "2024-01-23T12:45:00Z"
  },
  {
    id: "doc-010",
    title: "Deep Learning for Computer Vision",
    text: "Convolutional Neural Networks (CNNs) have transformed computer vision tasks. Architectures like ResNet, EfficientNet, and Vision Transformers achieve state-of-the-art performance on image classification, object detection, and segmentation. Transfer learning allows pre-trained models to be adapted for specific tasks with limited data, making deep learning accessible for practical applications.",
    topic: "ai",
    created_at: "2024-01-24T14:20:00Z"
  },
  {
    id: "doc-011",
    title: "Microservices Architecture Patterns",
    text: "Microservices architecture breaks applications into small, independent services that communicate via APIs. Key patterns include service discovery for dynamic endpoint resolution, API gateways for request routing, circuit breakers for fault tolerance, and event-driven communication for loose coupling. While microservices offer scalability and deployment flexibility, they introduce complexity in distributed transactions and debugging.",
    topic: "software-architecture",
    created_at: "2024-01-25T09:00:00Z"
  },
  {
    id: "doc-012",
    title: "Time Series Database Fundamentals",
    text: "Time series databases specialize in storing and querying time-stamped data. They use optimization techniques like downsampling, compression, and partitioning to handle high-velocity data from IoT sensors, monitoring systems, and financial markets. Popular options include InfluxDB, TimescaleDB, and Prometheus. Efficient querying often involves aggregation, windowing, and interpolation operations.",
    topic: "databases",
    created_at: "2024-01-26T11:30:00Z"
  },
  {
    id: "doc-013",
    title: "RESTful API Design Best Practices",
    text: "Designing effective RESTful APIs requires careful consideration of resource naming, HTTP methods, status codes, and content negotiation. Resources should be nouns, actions should be HTTP verbs, and responses should include appropriate status codes. Versioning, pagination, filtering, and HATEOAS links enhance API usability. Consistent error handling and clear documentation are essential for developer experience.",
    topic: "software-development",
    created_at: "2024-01-27T16:15:00Z"
  },
  {
    id: "doc-014",
    title: "Serverless Computing and FaaS",
    text: "Serverless computing abstracts infrastructure management, allowing developers to focus on code. Functions as a Service (FaaS) platforms like AWS Lambda execute code in response to events without provisioning servers. Benefits include automatic scaling, pay-per-use pricing, and reduced operational overhead. However, it requires careful design for cold starts, statelessness, and vendor lock-in.",
    topic: "cloud-computing",
    created_at: "2024-01-28T10:00:00Z"
  },
  {
    id: "doc-015",
    title: "Neural Network Training Techniques",
    text: "Training neural networks effectively requires understanding optimization algorithms, regularization, and hyperparameter tuning. Gradient descent variants like Adam and RMSprop adapt learning rates per parameter. Techniques like dropout, batch normalization, and data augmentation prevent overfitting. Learning rate scheduling and early stopping improve convergence. Proper initialization and gradient clipping ensure stable training.",
    topic: "machine-learning",
    created_at: "2024-01-29T13:45:00Z"
  },
  {
    id: "doc-016",
    title: "Full-Text Search with Inverted Indices",
    text: "Inverted indices are fundamental to full-text search engines. They map terms to document locations, enabling efficient keyword queries. Building involves tokenization, normalization (lowercasing, stemming), and posting list compression. Query processing uses Boolean operations (AND, OR, NOT) and ranking algorithms like TF-IDF or BM25. Modern search engines add phrase queries, fuzzy matching, and relevance tuning.",
    topic: "search-engines",
    created_at: "2024-01-30T15:30:00Z"
  },
  {
    id: "doc-017",
    title: "Reinforcement Learning Applications",
    text: "Reinforcement learning trains agents to make decisions through trial and error. The agent interacts with an environment, receives rewards or penalties, and learns a policy to maximize cumulative reward. Applications include game playing (AlphaGo), robotics, autonomous vehicles, and recommendation systems. Challenges include sample efficiency, credit assignment, and balancing exploration versus exploitation.",
    topic: "ai",
    created_at: "2024-01-31T11:00:00Z"
  },
  {
    id: "doc-018",
    title: "Database Sharding Strategies",
    text: "Sharding horizontally partitions database data across multiple servers. Strategies include hash-based sharding (deterministic distribution), range-based sharding (contiguous data ranges), and geographic sharding (user proximity). While sharding improves scalability and performance, it complicates queries across shards (distributed JOINs) and requires rebalancing mechanisms. Proper shard key selection is critical for even distribution.",
    topic: "databases",
    created_at: "2024-02-01T14:15:00Z"
  },
  {
    id: "doc-019",
    title: "WebAssembly for High-Performance Web Apps",
    text: "WebAssembly (WASM) enables near-native performance in web browsers. It's a binary instruction format compiled from languages like Rust, C++, and Go. WASM complements JavaScript, running computationally intensive tasks like video encoding, cryptography, and game physics. It provides a compact format, fast validation, and sandboxed execution, making it ideal for performance-critical web applications.",
    topic: "software-development",
    created_at: "2024-02-02T09:30:00Z"
  },
  {
    id: "doc-020",
    title: "Hybrid Search: Combining Keyword and Vector Search",
    text: "Hybrid search merges traditional keyword search (BM25) with semantic vector search to leverage both exact matching and contextual understanding. Techniques include score fusion (weighted combination of scores), reciprocal rank fusion (combining ranked lists), and learning to rank models. Hybrid approaches improve relevance for queries where both precise terms and semantic meaning matter, like 'java programming tutorial' versus 'coffee brewing guide'.",
    topic: "search-engines",
    created_at: "2024-02-03T12:00:00Z"
  }
];

// Generate documents with Jina embeddings and upload to OSS as Lance dataset
export async function generateDocumentsWithEmbeddings(): Promise<{
  success: boolean;
  documentCount?: number;
  ossPath?: string;
  error?: string;
}> {
  const JINA_API_KEY = process.env.JINA_API_KEY;
  const tempDir = `/tmp/lance-docs-${Date.now()}`;
  const datasetPath = 'lance-documents/dataset.lance';
  const localPath = `${tempDir}/dataset.lance`;

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Call Jina Embeddings API for each document
    const embeddings: number[][] = [];
    const failedDocs: string[] = [];

    for (const doc of FAKE_DOCUMENTS) {
      try {
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JINA_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'jina-embeddings-v2-base-en',
            input: doc.text,
            encoding_type: 'float',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Jina API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        if (data.data && data.data[0] && data.data[0].embedding) {
          embeddings.push(data.data[0].embedding);
        } else {
          throw new Error('Invalid response format from Jina API');
        }
      } catch (error: any) {
        console.error(`Failed to generate embedding for ${doc.id}:`, error.message);
        failedDocs.push(doc.id);
      }
    }

    if (embeddings.length === 0) {
      throw new Error('Failed to generate any embeddings');
    }

    if (failedDocs.length > 0) {
      console.warn(`Warning: Failed to generate embeddings for ${failedDocs.length} documents: ${failedDocs.join(', ')}`);
    }

    // Generate Lance dataset using Python
    const dims = embeddings[0].length;
    const pythonScript = `
import os
import sys
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

import numpy as np
import lancedb
import pyarrow as pa

output_path = "${localPath}"
dataset_name = "data"

# Document data (passed from Node.js)
documents_data = ${JSON.stringify(FAKE_DOCUMENTS.map((doc, idx) => ({
      ...doc,
      vector: embeddings[idx] || []
    })))}

# Extract vectors and metadata separately
vectors_array = np.array([doc['vector'] for doc in documents_data], dtype=np.float32)

# Define schema with document fields
dims = ${dims}

# Create FixedSizeListArray for vectors
flat_vectors = vectors_array.flatten()
vector_array = pa.FixedSizeListArray.from_arrays(
    pa.array(flat_vectors, type=pa.float32()),
    dims
)

# Create table
table = pa.table({
    'id': pa.array([doc['id'] for doc in documents_data]),
    'title': pa.array([doc['title'] for doc in documents_data]),
    'text': pa.array([doc['text'] for doc in documents_data]),
    'topic': pa.array([doc['topic'] for doc in documents_data]),
    'created_at': pa.array([doc['created_at'] for doc in documents_data]),
    'vector': vector_array
})

# Connect to LanceDB and create table
db = lancedb.connect(output_path)
tb = db.create_table(dataset_name, table, mode="overwrite")

# Create IVF-PQ index
num_partitions = max(2, min(len(documents_data) // 5, 8))
tb.create_index(
    vector_column_name="vector",
    index_type="IVF_PQ",
    metric="cosine",
    num_partitions=num_partitions,
    num_sub_vectors=min(dims // 8, 64),
    replace=True
)

print(f"Created: {tb.count_rows()} documents with ${dims}-dim vectors")
`;

    await execAsync(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`);

    // Upload to OSS
    const client = await getClient();
    const files = await getAllFiles(localPath);

    for (const file of files) {
      const relativePath = file.replace(localPath + '/', '');
      const ossKey = `${datasetPath}/${relativePath}`;

      await client.put(ossKey, file);
    }

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      success: true,
      documentCount: FAKE_DOCUMENTS.length,
      ossPath: datasetPath,
    };
  } catch (error: any) {
    // Cleanup on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      success: false,
      error: error.message,
    };
  }
}

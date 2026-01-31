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

  // Fallback to credentials file - bucket is in Singapore region
  try {
    const credsPath = path.join(process.env.HOME || '', '.oss', 'credentials.json');
    const credsContent = await fs.readFile(credsPath, 'utf-8');
    const creds = JSON.parse(credsContent);

    // The denny-test-lance bucket is in Singapore region (ap-southeast-1)
    const region = 'oss-ap-southeast-1';

    return {
      region,
      accessKeyId: creds.access_key_id,
      accessKeySecret: creds.access_key_secret,
      bucket: 'denny-test-lance',
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
}

export interface GenerateResult {
  success: boolean;
  dataset?: string;
  vectors: number;
  dims: number;
  error?: string;
  uploadTime?: number;
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

    // Group by dataset directory
    const datasets = new Map<string, VectorDataset>();

    for (const obj of result.objects) {
      const match = obj.name.match(/datasets\/([^/]+)\//);
      if (match) {
        const datasetName = match[1];

        if (!datasets.has(datasetName)) {
          // Parse metadata from filename
          const metaMatch = datasetName.match(/vectors-(\d+)-dims-(\d+)/);
          const vectors = metaMatch ? parseInt(metaMatch[1]) : 0;
          const dims = metaMatch ? parseInt(metaMatch[2]) : 0;

          datasets.set(datasetName, {
            name: datasetName,
            vectors,
            dims,
            size: formatBytes(obj.size),
            lastModified: new Date(obj.lastModified).toISOString(),
          });
        }
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

// Generate Lance dataset and upload to OSS with GLM docs and Jina embeddings
export async function generateAndUploadDataset(
  vectors: number,
  dims: number
): Promise<GenerateResult> {
  const startTime = Date.now();
  const tempDir = `/tmp/lance-gen-${Date.now()}`;
  const datasetName = `vectors-${vectors}-dims-${dims}-${Date.now()}`;
  const localPath = `${tempDir}/${datasetName}.lance`;

  const GLM_API_KEY = process.env.GLM_API_KEY || '74830934db8146fb84b2c12daa182d5f.NnK1nfrYHm4Tqdgc';
  const JINA_API_KEY = process.env.JINA_API_KEY || 'jina_4d22586fca5140e99831e91c67f7b09aBX3XfmHSkXlBEhn3PvJna9cZYOXb';

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Step 1: Generate fake documents using GLM API
    console.log('Generating documents with GLM...');
    const documents: Array<{id: string; title: string; text: string; topic: string}> = [];

    // Generate documents in batches
    const batchSize = 5;
    for (let i = 0; i < vectors; i += batchSize) {
      const currentBatch = Math.min(batchSize, vectors - i);

      for (let j = 0; j < currentBatch; j++) {
        const topics = ['Vector Databases', 'Machine Learning', 'Elasticsearch', 'Cloud Computing', 'Neural Networks', 'Natural Language Processing', 'DevOps', 'Data Engineering', 'Microservices', 'Deep Learning'];
        const selectedTopic = topics[Math.floor(Math.random() * topics.length)];

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

          // Rate limiting delay
          await new Promise(resolve => setTimeout(resolve, 500));
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
      }
    }

    console.log(`Generated ${documents.length} documents`);

    // Step 2: Generate embeddings using Jina API
    console.log('Generating embeddings with Jina...');
    const embeddings: number[][] = [];

    for (const doc of documents) {
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
          throw new Error(`Jina API error: ${response.status}`);
        }

        const data = await response.json();
        if (data.data && data.data[0] && data.data[0].embedding) {
          embeddings.push(data.data[0].embedding);
        } else {
          throw new Error('Invalid response format from Jina API');
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error: any) {
        console.error(`Failed to generate embedding for ${doc.id}:`, error.message);
        throw error;
      }
    }

    console.log(`Generated ${embeddings.length} embeddings with ${embeddings[0].length} dimensions`);

    // Step 3: Create Lance dataset with documents and embeddings
    const pythonScript = `
import os
import sys
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

import numpy as np
import lance
import pyarrow as pa

output_path = "${localPath}"

# Document and embedding data
documents_data = ${JSON.stringify(documents.map((doc, idx) => ({
      _id: doc.id,
      ...doc,
      vector: embeddings[idx]
    })))}

# Extract vectors
vectors_array = np.array([doc['vector'] for doc in documents_data], dtype=np.float32)

# Define schema with all document fields
dims = vectors_array.shape[1]
vector_type = pa.list_(pa.float32(), list_size=dims)
schema = pa.schema([
    pa.field('_id', pa.string()),
    pa.field('id', pa.string()),
    pa.field('title', pa.string()),
    pa.field('text', pa.string()),
    pa.field('topic', pa.string()),
    pa.field('category', pa.string()),
    pa.field('vector', vector_type)
])

# Create FixedSizeListArray
flat_vectors = vectors_array.flatten()
vector_array = pa.FixedSizeListArray.from_arrays(
    pa.array(flat_vectors, type=pa.float32()),
    dims
)

# Create table
categories = np.array([doc['topic'] for doc in documents_data])
table = pa.table({
    '_id': pa.array([doc['_id'] for doc in documents_data]),
    'id': pa.array([doc['id'] for doc in documents_data]),
    'title': pa.array([doc['title'] for doc in documents_data]),
    'text': pa.array([doc['text'] for doc in documents_data]),
    'topic': pa.array([doc['topic'] for doc in documents_data]),
    'category': pa.array(categories.tolist()),
    'vector': vector_array
}, schema=schema)

# Write dataset
dataset = lance.write_dataset(table, output_path)

# Create IVF-PQ index for larger datasets
n_vectors = len(documents_data)
if n_vectors >= 100:
    num_partitions = max(2, min(n_vectors // 10, 32))
    dataset.create_index(
        column='vector',
        index_type='IVF_PQ',
        metric='cosine',
        num_partitions=num_partitions,
        num_sub_vectors=min(dims // 8, 64)
    )

print(f"Created: {dataset.count_rows()} documents with {dims}-dim vectors")
`;

    await execAsync(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`);

    // Upload to OSS
    const client = await getClient();
    const files = await getAllFiles(localPath);

    for (const file of files) {
      const relativePath = file.replace(localPath + '/', '');
      const ossKey = `datasets/${datasetName}/${relativePath}`;

      await client.put(ossKey, file);
    }

    const uploadTime = Date.now() - startTime;

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    return {
      success: true,
      dataset: datasetName,
      vectors: documents.length,
      dims: embeddings[0].length,
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
import lance
import pyarrow as pa

output_path = "${localPath}"

# Document data (passed from Node.js)
documents_data = ${JSON.stringify(FAKE_DOCUMENTS.map((doc, idx) => ({
      ...doc,
      vector: embeddings[idx] || []
    })))}

# Extract vectors and metadata separately
vectors_array = np.array([doc['vector'] for doc in documents_data], dtype=np.float32)

# Define schema with document fields
vector_type = pa.list_(pa.float32(), list_size=${dims})
schema = pa.schema([
    pa.field('id', pa.string()),
    pa.field('title', pa.string()),
    pa.field('text', pa.string()),
    pa.field('topic', pa.string()),
    pa.field('created_at', pa.string()),
    pa.field('vector', vector_type)
])

# Create FixedSizeListArray
flat_vectors = vectors_array.flatten()
vector_array = pa.FixedSizeListArray.from_arrays(
    pa.array(flat_vectors, type=pa.float32()),
    ${dims}
)

# Create table
table = pa.table({
    'id': pa.array([doc['id'] for doc in documents_data]),
    'title': pa.array([doc['title'] for doc in documents_data]),
    'text': pa.array([doc['text'] for doc in documents_data]),
    'topic': pa.array([doc['topic'] for doc in documents_data]),
    'created_at': pa.array([doc['created_at'] for doc in documents_data]),
    'vector': vector_array
}, schema=schema)

# Write dataset
dataset = lance.write_dataset(table, output_path)

# Create IVF-PQ index
num_partitions = max(2, min(len(documents_data) // 5, 8))
dataset.create_index(
    column='vector',
    index_type='IVF_PQ',
    metric='cosine',
    num_partitions=num_partitions,
    num_sub_vectors=min(${dims} // 8, 64)
)

print(f"Created: {dataset.count_rows()} documents with ${dims}-dim vectors")
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

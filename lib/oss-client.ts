import OSS from 'ali-oss';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

// OSS Configuration
const OSS_CONFIG = {
  region: process.env.OSS_REGION || 'oss-ap-southeast-1',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  bucket: process.env.OSS_BUCKET || 'denny-test-lance',
};

const client = new OSS(OSS_CONFIG);

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

// Generate Lance dataset and upload to OSS
export async function generateAndUploadDataset(
  vectors: number,
  dims: number
): Promise<GenerateResult> {
  const startTime = Date.now();
  const tempDir = `/tmp/lance-gen-${Date.now()}`;
  const datasetName = `vectors-${vectors}-dims-${dims}-${Date.now()}`;
  const localPath = `${tempDir}/${datasetName}.lance`;

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Generate Lance dataset using Python
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

n_vectors = ${vectors}
dims = ${dims}
output_path = "${localPath}"

# Create normalized vectors
vectors_array = np.random.randn(n_vectors, dims).astype(np.float32)
vectors_array = vectors_array / np.linalg.norm(vectors_array, axis=1, keepdims=True)

# Define schema with pa.string() for Java compatibility
vector_type = pa.list_(pa.float32(), list_size=dims)
schema = pa.schema([
    pa.field('_id', pa.string()),
    pa.field('vector', vector_type),
    pa.field('category', pa.string()),
    pa.field('text', pa.string())  # Text field for backfilling ES documents
])

# Create FixedSizeListArray
flat_vectors = vectors_array.flatten()
vector_array = pa.FixedSizeListArray.from_arrays(
    pa.array(flat_vectors, type=pa.float32()),
    dims
)

# Generate text content for each document
text_templates = [
    "This document discusses {category} innovations and developments in the field.",
    "An analysis of {category} trends and their impact on modern society.",
    "Exploring {category} concepts and their practical applications.",
    "Understanding {category} methodologies and best practices.",
    "{category} research findings and theoretical frameworks."
]
texts = [np.random.choice(text_templates).format(category=cat) for cat in
          np.random.choice(['tech', 'science', 'business', 'finance', 'health'], n_vectors)]

# Create table
categories = np.random.choice(['tech', 'science', 'business', 'finance', 'health'], n_vectors)
table = pa.table({
    '_id': [f"doc_{i}" for i in range(n_vectors)],
    'vector': vector_array,
    'category': pa.array(categories.tolist()),
    'text': pa.array(texts)
}, schema=schema)

# Write dataset
dataset = lance.write_dataset(table, output_path)

# Create IVF-PQ index (skip for small datasets)
if n_vectors >= 256:
    num_partitions = max(2, min(n_vectors // 100, 256))
    dataset.create_index(
        column='vector',
        index_type='IVF_PQ',
        metric='cosine',
        num_partitions=num_partitions,
        num_sub_vectors=min(dims // 8, 64)
    )

print(f"Created: {dataset.count_rows()} vectors, {dims} dims")
`;

    await execAsync(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`);

    // Upload to OSS
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
      vectors,
      dims,
      uploadTime,
    };
  } catch (error: any) {
    // Cleanup on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return {
      success: false,
      vectors,
      dims,
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

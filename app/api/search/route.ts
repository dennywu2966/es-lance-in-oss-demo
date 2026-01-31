import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getOSSConfig } from "@/lib/oss-client";

const execAsync = promisify(exec);

// Helper with timeout
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

interface SearchRequest {
  dataset?: string;
  k?: number;
  numCandidates?: number;
  profile?: boolean;
  useExistingVector?: boolean;
  queryVector?: number[];
}

interface LanceSearchResult {
  id: string;
  vector: number[];
  category: string;
  distance: number;
}

interface LanceSearchOutput {
  results: LanceSearchResult[];
  vectorsCount: number;
  dimensions: number;
  timing?: { [key: string]: number };
}

interface ESTimingData {
  [key: string]: number | string;
}

interface ESProfileResponse {
  took: number;
  timed_out: boolean;
  hits: {
    total: { value: number };
    hits: Array<{
      _id: string;
      _score: number;
      _source: {
        category?: string;
      };
    }>;
  };
  profile?: {
    shards: Array<{
      id: string;
      searches: Array<{
        query: Array<{
          type: string;
          description?: string;
          time_in_nanos: number;
          breakdown?: {
            [key: string]: number;
          };
          debug?: ESTimingData;
        }>;
      }>;
    }>;
  };
}

// Search against Lance dataset using Python (original method)
async function searchLanceDataset(
  dataset: string,
  queryVector: number[],
  k: number,
  numCandidates: number,
  profile: boolean = false,
  ossConfig?: { accessKeyId: string; accessKeySecret: string; region: string; bucket: string }
): Promise<LanceSearchOutput> {
  const tempDir = `/tmp/lance-search-${Date.now()}`;

  const profileFlag = profile ? 'True' : 'False';

  const pythonScript = `
import os
import sys
import json
import time
import numpy as np

# Clear proxy settings FIRST before any imports
for var in list(os.environ.keys()):
    if 'proxy' in var.lower():
        del os.environ[var]

import oss2
import lance

# Profile flag
PROFILE = ${profileFlag}

# Timing dictionary
timing = {}

# OSS credentials (from environment)
auth = oss2.Auth(os.environ.get("OSS_ACCESS_KEY_ID", ""), os.environ.get("OSS_ACCESS_KEY_SECRET", ""))
bucket = oss2.Bucket(auth, os.environ.get("OSS_ENDPOINT", "oss-ap-southeast-1.aliyuncs.com"), os.environ.get("OSS_BUCKET", "denny-test-lance"))

# Dataset path in OSS
temp_dir = "${tempDir}"
dataset_name = "${dataset}"
oss_prefix = f"datasets/{dataset_name}/"

# Timing: OSS download
if PROFILE:
    start = time.time()

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

if PROFILE:
    timing['oss_download_ms'] = int((time.time() - start) * 1000)

# Timing: Dataset open
if PROFILE:
    start = time.time()

# Open Lance dataset
dataset = lance.dataset(temp_dir)

# Get metadata
vectors_count = dataset.count_rows()
schema = dataset.schema

# Get vector dimensions
vector_dim = None
for field in schema:
    if field.name == 'vector':
        if hasattr(field.type, 'list_size'):
            vector_dim = field.type.list_size

if PROFILE:
    timing['dataset_open_ms'] = int((time.time() - start) * 1000)

# Timing: Query preparation
if PROFILE:
    start = time.time()

# Query vector (normalized)
query_vec = np.array(${JSON.stringify(queryVector)}, dtype=np.float32)
if np.linalg.norm(query_vec) > 0:
    query_vec = query_vec / np.linalg.norm(query_vec)

if PROFILE:
    timing['query_prep_ms'] = int((time.time() - start) * 1000)

# Perform kNN search using Lance
try:
    # Timing: Data load
    if PROFILE:
        start = time.time()

    # Use Lance's built-in KNN search with IVF-PQ index
    table = dataset.to_table()

    # Convert to dict for processing
    data = table.to_pydict()

    if PROFILE:
        timing['data_load_ms'] = int((time.time() - start) * 1000)
        # Timing: Similarity calculation
        start = time.time()

    # Calculate cosine similarity for all vectors
    similarities = []
    for i in range(len(data['_id'])):
        vec_data = data['vector'][i]
        if hasattr(vec_data, 'as_py'):
            vec_data = vec_data.as_py()

        vec = np.array(vec_data, dtype=np.float32)

        # Normalize
        if np.linalg.norm(vec) > 0:
            vec = vec / np.linalg.norm(vec)

        # Cosine similarity = dot product of normalized vectors
        similarity = float(np.dot(query_vec, vec))
        similarities.append((similarity, i))

    if PROFILE:
        timing['similarity_calc_ms'] = int((time.time() - start) * 1000)
        # Timing: Sorting
        start = time.time()

    # Sort by similarity (highest first) and take top k
    similarities.sort(reverse=True, key=lambda x: x[0])
    top_k = min(${k}, len(similarities))
    top_results = similarities[:top_k]

    if PROFILE:
        timing['sorting_ms'] = int((time.time() - start) * 1000)
        # Timing: Result formatting
        start = time.time()

    results = []
    for similarity, idx in top_results:
        doc_id = data['_id'][idx]
        if hasattr(doc_id, 'as_py'):
            doc_id = doc_id.as_py()

        vec_data = data['vector'][idx]
        if hasattr(vec_data, 'as_py'):
            vec_data = vec_data.as_py()

        category_data = data['category'][idx]
        if hasattr(category_data, 'as_py'):
            category_data = category_data.as_py()

        results.append({
            'id': doc_id,
            'vector': vec_data.tolist() if hasattr(vec_data, 'tolist') else list(vec_data),
            'category': category_data,
            'distance': similarity
        })

    if PROFILE:
        timing['result_format_ms'] = int((time.time() - start) * 1000)
        # Total search time (excluding cleanup)
        timing['total_search_ms'] = sum(v for k, v in timing.items() if k.endswith('_ms') and isinstance(v, int))

except Exception as e:
    print(f"Search error: {e}", file=sys.stderr, flush=True)
    results = []
    if PROFILE:
        timing['error'] = str(e)

# Timing: Cleanup
if PROFILE:
    start = time.time()

# Cleanup
import shutil
shutil.rmtree(temp_dir, ignore_errors=True)

if PROFILE:
    timing['cleanup_ms'] = int((time.time() - start) * 1000)

output = {
    'results': results,
    'vectorsCount': vectors_count,
    'dimensions': vector_dim or 0
}

if PROFILE:
    output['timing'] = timing

print(json.dumps(output))
`;

  // Prepare environment with OSS credentials
  const env = {
    OSS_ACCESS_KEY_ID: ossConfig?.accessKeyId || '',
    OSS_ACCESS_KEY_SECRET: ossConfig?.accessKeySecret || '',
    OSS_ENDPOINT: ossConfig?.region ? `${ossConfig.region}.aliyuncs.com` : 'oss-ap-southeast-1.aliyuncs.com',
    OSS_BUCKET: ossConfig?.bucket || 'denny-test-lance',
  };

  const { stdout } = await execWithTimeout(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`, 60000, env);

  const parsed = JSON.parse(stdout.trim()) as LanceSearchOutput;
  return {
    results: parsed.results,
    vectorsCount: parsed.vectorsCount,
    dimensions: parsed.dimensions,
    timing: parsed.timing
  };
}

// Search through Elasticsearch with Lance plugin and profiling
async function searchThroughElasticsearch(
  queryVector: number[],
  k: number,
  numCandidates: number,
  profile: boolean
): Promise<{ results: LanceSearchResult[]; timing?: ESTimingData; vectorsCount: number; dimensions: number }> {
  const ES_HOST = process.env.ES_HOST || 'http://localhost:9200';
  const ES_INDEX = process.env.ES_INDEX || 'lance-validation-test';

  // Build Elasticsearch kNN query with profile
  const queryBody = {
    profile: profile,
    knn: {
      field: "embedding",
      query_vector: queryVector,
      k: k,
      num_candidates: numCandidates
    },
    size: k,
    _source: ["category"] // Only fetch category from source
  };

  const response = await fetch(`${ES_HOST}/${ES_INDEX}/_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from('elastic:jZq_c30hq8QMpRwOrOCD').toString('base64')}`
    },
    body: JSON.stringify(queryBody)
  });

  if (!response.ok) {
    throw new Error(`Elasticsearch error: ${response.status} ${response.statusText}`);
  }

  const data: ESProfileResponse = await response.json();

  // Extract results
  const results: LanceSearchResult[] = data.hits.hits.map(hit => ({
    id: hit._id,
    vector: [], // Vector is stored in Lance, not in ES document
    category: hit._source?.category || 'unknown',
    distance: 1 - hit._score // Convert cosine similarity to distance
  }));

  // Extract timing data if profiled
  let timing: ESTimingData | undefined;
  if (profile && data.profile?.shards?.[0]?.searches?.[0]?.query) {
    timing = {};
    const queries = data.profile.shards[0].searches[0].query;
    for (const query of queries) {
      if (query.debug) {
        Object.assign(timing, query.debug);
      }
      if (query.breakdown) {
        for (const [key, value] of Object.entries(query.breakdown)) {
          timing[key] = Math.round(value / 1_000_000); // Convert nanos to ms
        }
      }
    }
    timing['total_query_ms'] = data.took;
  }

  return {
    results,
    timing,
    vectorsCount: data.hits.total.value,
    dimensions: queryVector.length
  };
}

// Get a random vector from the dataset to use as query
async function getRandomVector(
  dataset: string,
  ossConfig?: { accessKeyId: string; accessKeySecret: string; region: string; bucket: string }
): Promise<{ vector: number[]; vectorsCount: number; dimensions: number }> {
  const tempDir = `/tmp/lance-random-${Date.now()}`;

  const pythonScript = `
import os
import sys
import json
import random

# Clear proxy settings FIRST before any imports
for var in list(os.environ.keys()):
    if 'proxy' in var.lower():
        del os.environ[var]

import oss2
import lance

# OSS credentials (from environment)
auth = oss2.Auth(os.environ.get("OSS_ACCESS_KEY_ID", ""), os.environ.get("OSS_ACCESS_KEY_SECRET", ""))
bucket = oss2.Bucket(auth, os.environ.get("OSS_ENDPOINT", "oss-ap-southeast-1.aliyuncs.com"), os.environ.get("OSS_BUCKET", "denny-test-lance"))

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

# Get metadata
vectors_count = dataset.count_rows()
schema = dataset.schema

# Get vector dimensions
vector_dim = None
for field in schema:
    if field.name == 'vector':
        if hasattr(field.type, 'list_size'):
            vector_dim = field.type.list_size

# Get a random vector
random_idx = random.randint(0, min(vectors_count - 1, 100))
table = dataset.take([random_idx])
data = table.to_pydict()

vec_data = data['vector'][0]
if hasattr(vec_data, 'as_py'):
    vec_data = vec_data.as_py()

vector = vec_data.tolist() if hasattr(vec_data, 'tolist') else list(vec_data)

# Cleanup
import shutil
shutil.rmtree(temp_dir, ignore_errors=True)

print(json.dumps({
    'vector': vector,
    'vectorsCount': vectors_count,
    'dimensions': vector_dim or 0
}))
`;

  // Prepare environment with OSS credentials
  const env = {
    OSS_ACCESS_KEY_ID: ossConfig?.accessKeyId || '',
    OSS_ACCESS_KEY_SECRET: ossConfig?.accessKeySecret || '',
    OSS_ENDPOINT: ossConfig?.region ? `${ossConfig.region}.aliyuncs.com` : 'oss-ap-southeast-1.aliyuncs.com',
    OSS_BUCKET: ossConfig?.bucket || 'denny-test-lance',
  };

  const { stdout } = await execWithTimeout(`python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`, 60000, env);

  return JSON.parse(stdout.trim());
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json() as SearchRequest;
    const k = body.k || 5;
    const numCandidates = body.numCandidates || k * 2;
    const profile = body.profile || false;
    const useExistingVector = body.useExistingVector || false;

    // Get OSS config for Python scripts
    const ossConfig = await getOSSConfig();

    // Get the latest dataset if not specified
    let dataset = body.dataset;
    if (!dataset) {
      // Try to get list of datasets and use the latest one
      try {
        const listRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/vectors/list`);
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.success && listData.datasets.length > 0) {
            dataset = listData.datasets[0].name;
          }
        }
      } catch (e) {
        console.error("Failed to get dataset list:", e);
      }

      // Fallback to default if still no dataset
      if (!dataset) {
        return NextResponse.json(
          {
            success: false,
            error: "No dataset available. Please generate a dataset first.",
            results: [],
            latency: "N/A",
          },
          { status: 400 }
        );
      }
    }

    // Determine query vector
    let queryVector: number[];
    if (body.queryVector && body.queryVector.length > 0) {
      queryVector = body.queryVector;
    } else if (!useExistingVector) {
      // Get a random vector from the dataset to use as query
      const randomVecData = await getRandomVector(dataset, ossConfig);
      queryVector = randomVecData.vector;
    } else {
      // Get a random vector as fallback
      const randomVecData = await getRandomVector(dataset, ossConfig);
      queryVector = randomVecData.vector;
    }

    // Choose search method based on profile parameter
    // Note: Currently only Python search returns timing data
    // ES search will be available once Lance plugin Profile API integration is complete
    let searchResults: {
      results: LanceSearchResult[];
      timing?: ESTimingData;
      vectorsCount: number;
      dimensions: number;
    };

    // Use Lance Python search with profiling support
    const lanceResults = await searchLanceDataset(
      dataset,
      queryVector,
      k,
      numCandidates,
      profile,
      ossConfig
    );
    searchResults = {
      results: lanceResults.results,
      vectorsCount: lanceResults.vectorsCount,
      dimensions: lanceResults.dimensions,
      timing: lanceResults.timing
    };

    const latency = Date.now() - startTime;

    // Format results with cosine similarity (0-1, higher is better)
    const results = searchResults.results.map((r, idx) => ({
      id: r.id,
      category: r.category,
      score: r.distance, // Cosine similarity from Lance Python
      index: dataset,
      vector: r.vector,
    }));

    return NextResponse.json({
      success: true,
      results,
      latency: `${latency}ms`,
      totalHits: searchResults.vectorsCount,
      queryDimension: searchResults.dimensions,
      queryVector,
      datasetName: dataset,
      vectorsCount: searchResults.vectorsCount,
      timing: searchResults.timing,
    });
  } catch (error: any) {
    console.error("Search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Search failed",
        results: [],
        latency: "N/A",
      },
      { status: 500 }
    );
  }
}

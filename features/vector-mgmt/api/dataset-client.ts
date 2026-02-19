/**
 * Dataset API client for communicating with Python backend
 */

const NO_STORE_FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
};

export interface Dataset {
  name: string;
  vectors: number;
  dims: number;
  size: string;
  last_modified: string;
  shard_count?: number;
  sharding_strategy?: 'NONE' | 'ES_ROUTING';
  shard_path?: string;
  dataset_name?: string;
  uri_prefix?: string;
}

export interface DatasetGenerateRequest {
  vectors: number;
  dims: number;
  shard_count?: number;
  sharding_strategy?: 'NONE' | 'ES_ROUTING';
}

export interface DatasetGenerateResponse {
  success: boolean;
  job_id: string;
  message: string;
}

export interface DatasetAppendRequest {
  dataset: string;
  vectors: number;
  target_shard_id?: number;
}

export interface DatasetAppendResponse {
  success: boolean;
  job_id: string;
  message: string;
}

export interface JobStatus {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result: {
    dataset_name?: string;
    vectors?: number;
    dims?: number;
    upload_result?: any;
    message?: string;
  };
  error: string;
  created_at: string;
  updated_at: string;
}

/**
 * List all datasets via same-origin Next.js API.
 */
export async function listDatasets(): Promise<{ success: boolean; datasets: Dataset[]; count: number }> {
  const response = await fetch('/api/vectors/list', NO_STORE_FETCH_OPTIONS);
  if (!response.ok) {
    throw new Error(`Failed to list datasets: ${response.status}`);
  }
  const payload = await response.json();
  if (!payload?.success) {
    throw new Error(payload?.error || 'Failed to list datasets');
  }
  return payload;
}

/**
 * Start dataset generation job
 */
export async function generateDataset(request: DatasetGenerateRequest): Promise<DatasetGenerateResponse> {
  try {
    const response = await fetch('/api/vectors/generate/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`Failed to start generation: ${response.status}${bodyText ? ` - ${bodyText}` : ''}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Failed to start dataset generation:', error);
    throw error;
  }
}

/**
 * Start dataset append job
 */
export async function appendDataset(request: DatasetAppendRequest): Promise<DatasetAppendResponse> {
  try {
    const response = await fetch('/api/vectors/append/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`Failed to start append: ${response.status}${bodyText ? ` - ${bodyText}` : ''}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error('Failed to start dataset append:', error);
    throw error;
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`/api/vectors/status/${encodeURIComponent(jobId)}`, NO_STORE_FETCH_OPTIONS);
  if (!response.ok) {
    throw new Error(`Failed to get job status: ${response.status}`);
  }
  return await response.json();
}

/**
 * Subscribe to job progress via SSE
 */
export function subscribeToJobProgress(jobId: string, callbacks: {
  onProgress: (progress: number, status: string, message?: string) => void;
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}): () => void {
  const eventSource = new EventSource(`/api/vectors/stream/${encodeURIComponent(jobId)}`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.error) {
        callbacks.onError(data.error);
        eventSource.close();
        return;
      }

      if (data.status === 'completed') {
        callbacks.onComplete(data.result);
        eventSource.close();
        return;
      }

      if (data.status === 'failed') {
        callbacks.onError(data.error);
        eventSource.close();
        return;
      }

      callbacks.onProgress(data.progress, data.status, data.result?.message);
    } catch (e) {
      console.error('Failed to parse SSE data:', e);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    callbacks.onError('Connection error');
    eventSource.close();
  };

  // Return cleanup function
  return () => {
    eventSource.close();
  };
}

/**
 * Delete a dataset
 * Uses Next.js API so OSS + Elasticsearch index cleanup stay consistent.
 */
export async function deleteDataset(datasetName: string): Promise<{ success: boolean; dataset_name?: string; message?: string }> {
  const response = await fetch('/api/vectors/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset: datasetName }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to delete dataset: ${response.status}`);
  }
  return await response.json();
}

/**
 * @deprecated
 * Kept for compatibility if callers still need direct backend deletion explicitly.
 */
export async function deleteDatasetViaPython(datasetName: string): Promise<{ success: boolean; dataset_name?: string; message?: string }> {
  try {
    const response = await fetch(`/api/vectors/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: datasetName }),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete dataset: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    throw new Error(error?.message || 'Python backend dataset deletion failed');
  }
}

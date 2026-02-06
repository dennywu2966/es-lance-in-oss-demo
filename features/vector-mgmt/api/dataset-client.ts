/**
 * Dataset API client for communicating with Python backend
 */

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export interface Dataset {
  name: string;
  vectors: number;
  dims: number;
  size: string;
  last_modified: string;
}

export interface DatasetGenerateRequest {
  vectors: number;
  dims: number;
}

export interface DatasetGenerateResponse {
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
 * List all datasets from Python backend
 * Falls back to Next.js API if Python backend is not configured or unavailable
 */
export async function listDatasets(): Promise<{ success: boolean; datasets: Dataset[]; count: number }> {
  // Skip Python backend call if using default URL (no real backend configured)
  const usingDefaultBackend = PYTHON_BACKEND_URL === 'http://localhost:8000' && !process.env.PYTHON_BACKEND_URL;

  if (usingDefaultBackend) {
    // Go directly to Next.js API
    try {
      const response = await fetch('/api/vectors/list');
      if (!response.ok) {
        return { success: false, datasets: [], count: 0 };
      }
      return await response.json();
    } catch {
      return { success: false, datasets: [], count: 0 };
    }
  }

  // Try Python backend if explicitly configured
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/datasets`);
    if (!response.ok) {
      throw new Error(`Failed to list datasets: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.warn('Python backend unavailable, falling back to Next.js API');
    // Fallback to Next.js API if Python backend unavailable
    try {
      const fallbackResponse = await fetch('/api/vectors/list');
      return await fallbackResponse.json();
    } catch {
      return { success: false, datasets: [], count: 0 };
    }
  }
}

/**
 * Start dataset generation job
 */
export async function generateDataset(request: DatasetGenerateRequest): Promise<DatasetGenerateResponse> {
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/dataset/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to start generation: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error('Failed to start dataset generation:', error);
    throw error;
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/dataset/status/${jobId}`);
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
  const eventSource = new EventSource(`${PYTHON_BACKEND_URL}/api/v1/dataset/stream/${jobId}`);

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
 * Falls back to Next.js API if Python backend is not configured
 */
export async function deleteDataset(datasetName: string): Promise<{ success: boolean; dataset_name?: string; message?: string }> {
  // Skip Python backend call if using default URL (no real backend configured)
  const usingDefaultBackend = PYTHON_BACKEND_URL === 'http://localhost:8000' && !process.env.PYTHON_BACKEND_URL;

  if (usingDefaultBackend) {
    // Go directly to Next.js API
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

  // Try Python backend if explicitly configured
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/v1/dataset/${datasetName}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete dataset: ${response.status}`);
    }
    return await response.json();
  } catch (error: any) {
    console.warn('Python backend unavailable, falling back to Next.js API');
    // Fallback to Next.js API
    const fallbackResponse = await fetch('/api/vectors/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset: datasetName }),
    });
    if (!fallbackResponse.ok) {
      const fallbackError = await fallbackResponse.json();
      throw new Error(fallbackError.error || `Failed to delete dataset: ${fallbackResponse.status}`);
    }
    return await fallbackResponse.json();
  }
}

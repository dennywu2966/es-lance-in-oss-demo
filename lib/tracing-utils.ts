/**
 * Tracing utilities for Lance Demo search operations
 */
import { Span, SpanKind, SpanStatusCode, trace, context } from '@opentelemetry/api';
import { getTracer } from './tracing';

/**
 * Create a child span from the current context
 */
export function startChildSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
}

/**
 * Create a server span for incoming HTTP request
 */
export function startServerSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, {
    kind: SpanKind.SERVER,
    attributes,
  });
}

/**
 * Create a client span for outgoing calls (ES, OSS)
 */
export function startClientSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, {
    kind: SpanKind.CLIENT,
    attributes,
  });
}

/**
 * Execute a function within a span context
 */
export async function traceAsync<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, string | number | boolean>;
  }
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: options?.kind || SpanKind.INTERNAL,
    attributes: options?.attributes,
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Trace OSS download operation
 */
export async function traceOSSDownload<T>(
  datasetName: string,
  fn: () => Promise<T & { cacheHit?: boolean; bytesDownloaded?: number; filesCount?: number }>
): Promise<T> {
  return traceAsync(
    'oss.download',
    async (span) => {
      span.setAttribute('dataset.name', datasetName);
      const result = await fn();

      // Add result attributes if available
      if (typeof result === 'object' && result !== null) {
        const r = result as Record<string, unknown>;
        if ('cacheHit' in r) span.setAttribute('oss.cache_hit', Boolean(r.cacheHit));
        if ('bytesDownloaded' in r) span.setAttribute('oss.bytes_downloaded', Number(r.bytesDownloaded));
        if ('filesCount' in r) span.setAttribute('oss.files_count', Number(r.filesCount));
      }

      return result;
    },
    { kind: SpanKind.CLIENT }
  );
}

/**
 * Trace Lance dataset open operation
 */
export async function traceLanceOpen<T>(
  datasetName: string,
  fn: () => Promise<T>
): Promise<T> {
  return traceAsync(
    'lance.dataset.open',
    async (span) => {
      span.setAttribute('dataset.name', datasetName);
      return fn();
    },
    { kind: SpanKind.INTERNAL }
  );
}

/**
 * Trace Lance search execution
 */
export async function traceLanceSearch<T>(
  options: { k: number; numCandidates: number; dimensions?: number },
  fn: () => Promise<T>
): Promise<T> {
  return traceAsync(
    'lance.search.execute',
    async (span) => {
      span.setAttribute('search.k', options.k);
      span.setAttribute('search.num_candidates', options.numCandidates);
      if (options.dimensions) {
        span.setAttribute('dataset.dimensions', options.dimensions);
      }
      return fn();
    },
    { kind: SpanKind.INTERNAL }
  );
}

/**
 * Trace Elasticsearch kNN search
 */
export async function traceESKnnSearch<T>(
  indexName: string,
  fn: () => Promise<T & { took?: number; hitsCount?: number }>
): Promise<T> {
  return traceAsync(
    'elasticsearch.search.knn',
    async (span) => {
      span.setAttribute('es.index', indexName);
      const result = await fn();

      if (typeof result === 'object' && result !== null) {
        const r = result as Record<string, unknown>;
        if ('took' in r) span.setAttribute('es.took_ms', Number(r.took));
        if ('hitsCount' in r) span.setAttribute('es.hits_count', Number(r.hitsCount));
      }

      return result;
    },
    { kind: SpanKind.CLIENT }
  );
}

/**
 * Trace Elasticsearch BM25 text search
 */
export async function traceESTextSearch<T>(
  indexName: string,
  fn: () => Promise<T & { took?: number; hitsCount?: number }>
): Promise<T> {
  return traceAsync(
    'elasticsearch.search.bm25',
    async (span) => {
      span.setAttribute('es.index', indexName);
      const result = await fn();

      if (typeof result === 'object' && result !== null) {
        const r = result as Record<string, unknown>;
        if ('took' in r) span.setAttribute('es.took_ms', Number(r.took));
        if ('hitsCount' in r) span.setAttribute('es.hits_count', Number(r.hitsCount));
      }

      return result;
    },
    { kind: SpanKind.CLIENT }
  );
}

/**
 * Trace RRF fusion operation
 */
export async function traceRRFFusion<T>(
  fn: () => Promise<T>
): Promise<T> {
  return traceAsync(
    'search.fusion.rrf',
    async () => fn(),
    { kind: SpanKind.INTERNAL }
  );
}

/**
 * Record timing from Python subprocess into span
 */
export function recordPythonTiming(span: Span, timing: Record<string, number | boolean>): void {
  for (const [key, value] of Object.entries(timing)) {
    if (typeof value === 'number') {
      span.setAttribute(`python.${key}`, value);
    } else if (typeof value === 'boolean') {
      span.setAttribute(`python.${key}`, value);
    }
  }
}

/**
 * OpenTelemetry tracing configuration for Lance Demo
 * Exports traces directly to Elasticsearch for visualization in Kibana
 */
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, Tracer, SpanStatusCode, context, SpanKind } from '@opentelemetry/api';
import { ESTraceExporter } from './es-trace-exporter';

// Singleton tracer provider
let tracerProvider: NodeTracerProvider | null = null;
let isInitialized = false;

// Configuration from environment or defaults
const ES_HOST = process.env.ES_HOST || 'https://localhost:9200';
const ES_USER = process.env.ES_USER || 'elastic';
const ES_PASS = process.env.ES_PASS || 'Summer11';
const SERVICE_NAME = 'lance-demo';
const SERVICE_VERSION = '1.0.0';

/**
 * Initialize OpenTelemetry tracing
 * Should be called once at application startup
 */
export function initTracing(): void {
  if (isInitialized) {
    return;
  }

  // Create resource with service information
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    'host.name': process.env.HOSTNAME || 'localhost',
  });

  // Create tracer provider
  tracerProvider = new NodeTracerProvider({
    resource,
  });

  // Create ES exporter
  const esExporter = new ESTraceExporter({
    node: ES_HOST,
    auth: {
      username: ES_USER,
      password: ES_PASS,
    },
    indexPrefix: 'traces-lance-spans',
    tls: {
      rejectUnauthorized: false,
    },
  });

  // Add batch processor for efficient export
  tracerProvider.addSpanProcessor(
    new BatchSpanProcessor(esExporter, {
      maxQueueSize: 100,
      maxExportBatchSize: 50,
      scheduledDelayMillis: 1000,
      exportTimeoutMillis: 30000,
    })
  );

  // Register as global tracer provider
  tracerProvider.register();

  isInitialized = true;
  console.log('[Tracing] OpenTelemetry initialized - exporting to ES');
}

/**
 * Get a tracer instance for creating spans
 */
export function getTracer(name: string = 'lance-demo'): Tracer {
  if (!isInitialized) {
    initTracing();
  }
  return trace.getTracer(name, SERVICE_VERSION);
}

/**
 * Shutdown tracing - call on application exit
 */
export async function shutdownTracing(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    isInitialized = false;
    tracerProvider = null;
  }
}

// Re-export commonly used types and utilities
export { SpanStatusCode, SpanKind, context, trace };

/**
 * Helper to create a span and execute a function within it
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
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

  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Helper to add attributes to current span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    for (const [key, value] of Object.entries(attributes)) {
      currentSpan.setAttribute(key, value);
    }
  }
}

/**
 * Helper to add an event to current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.addEvent(name, attributes);
  }
}

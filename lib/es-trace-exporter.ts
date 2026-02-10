/**
 * Custom OpenTelemetry SpanExporter that writes traces directly to Elasticsearch
 */
import { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { Client } from '@elastic/elasticsearch';

export interface ESTraceExporterConfig {
  node: string;
  auth: {
    username: string;
    password: string;
  };
  indexPrefix?: string;
  tls?: {
    rejectUnauthorized: boolean;
  };
}

interface TraceDocument {
  '@timestamp': string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status: string;
  status_message: string;
  start_time: number;
  end_time: number;
  duration_ms: number;
  service: {
    name: string;
    version: string;
  };
  resource: Record<string, unknown>;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
}

const SPAN_KIND_MAP: Record<number, string> = {
  0: 'INTERNAL',
  1: 'SERVER',
  2: 'CLIENT',
  3: 'PRODUCER',
  4: 'CONSUMER',
};

const STATUS_CODE_MAP: Record<number, string> = {
  0: 'UNSET',
  1: 'OK',
  2: 'ERROR',
};

export class ESTraceExporter implements SpanExporter {
  private client: Client;
  private indexPrefix: string;
  private serviceName: string;
  private serviceVersion: string;
  private shutdownRequested = false;

  constructor(config: ESTraceExporterConfig) {
    this.client = new Client({
      node: config.node,
      auth: config.auth,
      tls: config.tls || { rejectUnauthorized: false },
    });
    this.indexPrefix = config.indexPrefix || 'traces-lance';
    this.serviceName = 'lance-demo';
    this.serviceVersion = '1.0.0';
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (this.shutdownRequested) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }

    this.exportSpans(spans)
      .then(() => {
        resultCallback({ code: ExportResultCode.SUCCESS });
      })
      .catch((error) => {
        console.error('Failed to export spans to ES:', error.message);
        resultCallback({ code: ExportResultCode.FAILED });
      });
  }

  private async exportSpans(spans: ReadableSpan[]): Promise<void> {
    if (spans.length === 0) return;

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '.');
    const indexName = `${this.indexPrefix}-${today}`;

    const operations = spans.flatMap((span) => {
      const doc = this.spanToDocument(span);
      return [
        { index: { _index: indexName } },
        doc,
      ];
    });

    const response = await this.client.bulk({
      operations,
      refresh: true, // Make documents searchable immediately
    });

    if (response.errors) {
      const errorItems = response.items.filter((item) => item.index?.error);
      console.error('Bulk index errors:', JSON.stringify(errorItems.slice(0, 3)));
    }
  }

  private spanToDocument(span: ReadableSpan): TraceDocument {
    const startTimeMs = Math.floor(span.startTime[0] * 1000 + span.startTime[1] / 1e6);
    const endTimeMs = Math.floor(span.endTime[0] * 1000 + span.endTime[1] / 1e6);
    const durationMs = endTimeMs - startTimeMs;

    // Extract resource attributes
    const resourceAttrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(span.resource.attributes)) {
      resourceAttrs[key] = value;
    }

    // Extract span attributes
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(span.attributes)) {
      attributes[key] = value;
    }

    // Extract events
    const events = span.events.map((event) => {
      const eventAttrs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(event.attributes || {})) {
        eventAttrs[key] = value;
      }
      return {
        name: event.name,
        timestamp: Math.floor(event.time[0] * 1000 + event.time[1] / 1e6),
        attributes: eventAttrs,
      };
    });

    return {
      '@timestamp': new Date(startTimeMs).toISOString(),
      trace_id: span.spanContext().traceId,
      span_id: span.spanContext().spanId,
      parent_span_id: span.parentSpanId || null,
      name: span.name,
      kind: SPAN_KIND_MAP[span.kind] || 'INTERNAL',
      status: STATUS_CODE_MAP[span.status.code] || 'UNSET',
      status_message: span.status.message || '',
      start_time: startTimeMs,
      end_time: endTimeMs,
      duration_ms: durationMs,
      service: {
        name: this.serviceName,
        version: this.serviceVersion,
      },
      resource: resourceAttrs,
      attributes,
      events,
    };
  }

  async shutdown(): Promise<void> {
    this.shutdownRequested = true;
    await this.client.close();
  }

  async forceFlush(): Promise<void> {
    // No-op for this exporter as we export synchronously in batches
  }
}

import { datasetIndexName } from "@/lib/dataset-profile";
import { ES_HOST as CONFIG_ES_HOST, ES_AUTH as CONFIG_ES_AUTH, ES_SECURITY_ENABLED } from "@/entities/search/model/config";

export interface ESIndexDeleteResult {
  success: boolean;
  index: string;
  status: number;
  missing?: boolean;
  error?: string;
}

export async function deleteESIndex(index: string): Promise<ESIndexDeleteResult> {
  const esHost = (process.env.ES_HOST || CONFIG_ES_HOST || "https://127.0.0.1:9200").replace(/\/$/, "");
  const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  try {
    const headers: Record<string, string> = {};
    if (ES_SECURITY_ENABLED) {
      headers.Authorization = `Basic ${CONFIG_ES_AUTH}`;
    }

    const response = await fetch(`${esHost}/${index}`, {
      method: "DELETE",
      headers,
    });

    if (response.status === 404) {
      return {
        success: true,
        index,
        status: 404,
        missing: true,
      };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        success: false,
        index,
        status: response.status,
        error: body || response.statusText || "Unknown Elasticsearch error",
      };
    }

    return {
      success: true,
      index,
      status: response.status,
      missing: false,
    };
  } catch (error: any) {
    return {
      success: false,
      index,
      status: 0,
      error: error?.message || String(error),
    };
  } finally {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
  }
}

export async function deleteDatasetESIndex(datasetName: string): Promise<ESIndexDeleteResult> {
  return deleteESIndex(datasetIndexName(datasetName));
}

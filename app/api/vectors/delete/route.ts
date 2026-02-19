import { NextRequest, NextResponse } from "next/server";
import { deleteDataset } from "@/lib/oss-client";
import { deleteDatasetESIndex } from "@/lib/es-index-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dataset } = body;

    if (!dataset) {
      return NextResponse.json(
        {
          success: false,
          error: "Dataset name is required",
        },
        { status: 400 }
      );
    }

    const result = await deleteDataset(dataset);

    if (result.success) {
      const esCleanup = await deleteDatasetESIndex(dataset);
      if (!esCleanup.success) {
        return NextResponse.json(
          {
            success: false,
            error: `Dataset deleted from OSS but failed to clean Elasticsearch index "${esCleanup.index}": ${esCleanup.error || `HTTP ${esCleanup.status}`}`,
            dataset_name: dataset,
            es_index: esCleanup.index,
            oss_deleted: true,
            es_index_deleted: false,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Dataset "${dataset}" deleted successfully`,
        dataset_name: dataset,
        es_index: esCleanup.index,
        es_index_deleted: !esCleanup.missing,
        es_index_missing: Boolean(esCleanup.missing),
      });
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

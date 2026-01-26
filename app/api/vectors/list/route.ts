import { NextResponse } from "next/server";
import { listDatasets } from "@/lib/oss-client";

export async function GET() {
  try {
    const datasets = await listDatasets();

    return NextResponse.json({
      success: true,
      datasets,
      count: datasets.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        datasets: [],
      },
      { status: 500 }
    );
  }
}

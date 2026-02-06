import { NextResponse } from "next/server";
import { listDatasets } from "@/lib/oss-client";

// Cache for 60 seconds - datasets list doesn't change frequently
export const revalidate = 60;
export const dynamic = 'force-dynamic';

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

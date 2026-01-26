import { NextRequest, NextResponse } from "next/server";
import { generateAndUploadDataset } from "@/lib/oss-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const vectors = Math.min(Math.max(body.vectors || 100, 10), 10000); // Clamp between 10-10000
    const dims = Math.min(Math.max(body.dims || 10, 2), 4096); // Clamp between 2-4096

    const result = await generateAndUploadDataset(vectors, dims);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        vectors: 0,
        dims: 0,
      },
      { status: 500 }
    );
  }
}

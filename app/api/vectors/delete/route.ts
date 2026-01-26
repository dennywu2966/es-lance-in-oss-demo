import { NextRequest, NextResponse } from "next/server";
import { deleteDataset } from "@/lib/oss-client";

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
      return NextResponse.json({
        success: true,
        message: `Dataset "${dataset}" deleted successfully`,
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

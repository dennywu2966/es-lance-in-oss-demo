import { NextRequest, NextResponse } from "next/server";
import { generateDocumentsWithEmbeddings } from "@/lib/oss-client";

export async function POST(req: NextRequest) {
  try {
    const result = await generateDocumentsWithEmbeddings();

    if (result.success) {
      return NextResponse.json({
        success: true,
        documentCount: result.documentCount,
        ossPath: result.ossPath,
        message: `Successfully generated ${result.documentCount} documents with Jina embeddings and uploaded to ${result.ossPath}`,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Document generation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Document generation failed",
      },
      { status: 500 }
    );
  }
}

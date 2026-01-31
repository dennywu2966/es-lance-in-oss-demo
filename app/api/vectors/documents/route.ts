import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/oss-client";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);

interface Document {
  _id: string;
  id: string;
  title: string;
  text: string;
  topic: string;
  category: string;
  vector: number[];
}

interface DocumentsRequest {
  dataset?: string;
  limit?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DocumentsRequest;
    const { dataset, limit = 20 } = body;

    if (!dataset) {
      return NextResponse.json({
        success: false,
        error: "Dataset name is required",
      }, { status: 400 });
    }

    const tempDir = `/tmp/lance-docs-fetch-${Date.now()}`;
    const datasetPath = `datasets/${dataset}`;
    const localPath = `${tempDir}/dataset.lance`;

    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Download dataset from OSS
    const client = await getClient();
    const result = await client.list({
      prefix: datasetPath,
    });

    if (!result.objects || result.objects.length === 0) {
      await fs.rm(tempDir, { recursive: true, force: true });
      return NextResponse.json({
        success: false,
        error: `Dataset "${dataset}" not found. Please generate a dataset first.`,
      });
    }

    // Download all files
    for (const obj of result.objects) {
      const relativePath = obj.name.replace(`${datasetPath}/`, "");
      const localFilePath = `${tempDir}/${relativePath}`;

      // Ensure directory exists
      const dir = localFilePath.substring(0, localFilePath.lastIndexOf("/"));
      await fs.mkdir(dir, { recursive: true });

      await client.get(obj.name, localFilePath);
    }

    // Read documents using Python
    const pythonScript = `
import os
import sys
os.environ.pop('http_proxy', None)
os.environ.pop('https_proxy', None)
os.environ.pop('all_proxy', None)
os.environ.pop('ALL_PROXY', None)

import lance

dataset_path = "${tempDir}"
limit = ${limit}

# Open dataset
dataset = lance.dataset(dataset_path)

# Get total count
total = dataset.count_rows()

# Load all documents (or limited number) - exclude vector field for display
if limit > 0:
    table = dataset.to_table(columns=['_id', 'id', 'title', 'text', 'topic', 'category'], limit=limit)
else:
    table = dataset.to_table(columns=['_id', 'id', 'title', 'text', 'topic', 'category'])

# Convert to list of dicts
documents = table.to_pydict()

result = []
for i in range(len(documents['id'])):
    # Helper function to convert PyArrow scalars
    def to_string(val):
        if hasattr(val, 'as_py'):
            return val.as_py()
        return str(val)

    result.append({
        '_id': to_string(documents['_id'][i]),
        'id': to_string(documents['id'][i]),
        'title': to_string(documents['title'][i]),
        'text': to_string(documents['text'][i]),
        'topic': to_string(documents['topic'][i]),
        'category': to_string(documents['category'][i])
    })

# Output as JSON
import json
print(json.dumps({'documents': result, 'total': total}))
`;

    const { stdout } = await execAsync(
      `python3 - <<'PYEOF'\n${pythonScript}\nPYEOF`
    );

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });

    // Parse output
    const data = JSON.parse(stdout.trim());

    return NextResponse.json({
      success: true,
      documents: data.documents,
      total: data.total,
    });
  } catch (error: any) {
    console.error("Failed to fetch documents:", error);

    // Cleanup on error
    try {
      await fs.rm(`/tmp/lance-docs-fetch-${Date.now()}`, {
        recursive: true,
        force: true,
      });
    } catch {}

    return NextResponse.json({
      success: false,
      error: error.message || "Failed to fetch documents",
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import OSS from "ali-oss";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execAsync = promisify(exec);

// OSS Configuration
const OSS_CONFIG = {
  region: process.env.OSS_REGION || "oss-ap-southeast-1",
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
  bucket: process.env.OSS_BUCKET || "denny-test-lance",
};

const client = new OSS(OSS_CONFIG);

interface Document {
  id: string;
  title: string;
  text: string;
  topic: string;
  created_at: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { limit = 20 } = body;

    const tempDir = `/tmp/lance-docs-fetch-${Date.now()}`;
    const datasetPath = "lance-documents/dataset.lance";
    const localPath = `${tempDir}/dataset.lance`;

    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Download dataset from OSS
    const result = await client.list({
      prefix: datasetPath,
    });

    if (!result.objects || result.objects.length === 0) {
      await fs.rm(tempDir, { recursive: true, force: true });
      return NextResponse.json({
        success: false,
        error: "No documents dataset found. Please generate documents first.",
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

dataset_path = "${localPath}"
limit = ${limit}

# Open dataset
dataset = lance.dataset(dataset_path)

# Get total count
total = dataset.count_rows()

# Load all documents (or limited number)
if limit > 0:
    table = dataset.to_table(columns=['id', 'title', 'text', 'topic', 'created_at'], limit=limit)
else:
    table = dataset.to_table(columns=['id', 'title', 'text', 'topic', 'created_at'])

# Convert to list of dicts
documents = table.to_pydict()

result = []
for i in range(len(documents['id'])):
    result.append({
        'id': documents['id'][i],
        'title': documents['title'][i],
        'text': documents['text'][i],
        'topic': documents['topic'][i],
        'created_at': documents['created_at'][i]
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

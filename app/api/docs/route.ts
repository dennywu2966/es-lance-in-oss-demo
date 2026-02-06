import { NextRequest, NextResponse } from 'next/server';

const PLUGINS_BASE_PATH = '/home/denny/projects/es-9.2.4-plugins';

// Cache for 5 minutes - documentation tree changes infrequently
export const revalidate = 300;
export const dynamic = 'force-dynamic';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

/**
 * Build a tree structure from the base path
 * Only includes .md files for performance and relevance
 */
function buildTree(dir: string, relativePath: string = ''): FileNode[] {
  const fs = require('fs');
  const path = require('path');

  const fullPath = path.join(dir, relativePath);

  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  // Sort: directories first, then files alphabetically
  entries.sort((a: any, b: any) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    // Skip hidden files/directories and common build artifacts
    if (entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'build' ||
        entry.name === '.gradle' ||
        entry.name === 'target') {
      continue;
    }

    const entryPath = path.join(relativePath, entry.name);
    const entryFullPath = path.join(fullPath, entry.name);

    if (entry.isDirectory()) {
      const children = buildTree(dir, entryPath);
      // Only include directories that contain markdown files
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: entryPath,
          type: 'directory',
          children,
        });
      }
    } else if (entry.name.endsWith('.md')) {
      nodes.push({
        name: entry.name,
        path: entryPath,
        type: 'file',
      });
    }
  }

  return nodes;
}

/**
 * Read file content safely
 */
function readFileContent(relativePath: string): string | null {
  const fs = require('fs');
  const path = require('path');

  // Security: ensure path stays within base directory
  const resolvedPath = path.resolve(PLUGINS_BASE_PATH, relativePath);
  if (!resolvedPath.startsWith(PLUGINS_BASE_PATH)) {
    return null;
  }

  try {
    return fs.readFileSync(resolvedPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * GET /api/docs
 * Query params:
 *   - path: optional file path to read content
 *   - tree: if present, returns full tree structure
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filePath = searchParams.get('path');

  // If path is provided, return file content
  if (filePath) {
    const content = readFileContent(filePath);
    if (content === null) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    return NextResponse.json({ content, path: filePath });
  }

  // Otherwise, return tree structure
  const tree = buildTree(PLUGINS_BASE_PATH);

  // Highlight important files at the root
  const highlighted = tree.map(node => {
    if (node.name === 'future_plan.md') {
      return { ...node, priority: 'high' };
    }
    if (node.name === 'CLAUDE.md' || node.name === 'BUILDING.md' || node.name === 'CONTRIBUTING.md') {
      return { ...node, priority: 'medium' };
    }
    return node;
  });

  return NextResponse.json({ tree: highlighted });
}

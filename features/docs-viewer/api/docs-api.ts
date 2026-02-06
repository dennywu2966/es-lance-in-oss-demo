export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  priority?: 'high' | 'medium';
  children?: FileNode[];
}

export interface FileContent {
  content: string;
  path: string;
}

export interface DocsTreeResponse {
  tree: FileNode[];
}

const API_BASE = '/api/docs';

/**
 * Fetch the markdown file tree
 */
export async function fetchDocsTree(): Promise<FileNode[]> {
  const response = await fetch(`${API_BASE}?${Date.now()}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch docs tree');
  }
  const data: DocsTreeResponse = await response.json();
  return data.tree;
}

/**
 * Fetch file content by path
 */
export async function fetchFileContent(path: string): Promise<string> {
  const response = await fetch(`${API_BASE}?path=${encodeURIComponent(path)}`, {
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error('Failed to fetch file content');
  }
  const data: FileContent = await response.json();
  return data.content;
}

/**
 * Find a node in the tree by path
 */
export function findNodeByPath(tree: FileNode[], path: string): FileNode | null {
  for (const node of tree) {
    if (node.path === path) {
      return node;
    }
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Get the default file to show (future_plan.md or first available)
 */
export function getDefaultFile(tree: FileNode[]): string {
  // Priority 1: future_plan.md
  for (const node of tree) {
    if (node.name === 'future_plan.md') {
      return node.path;
    }
  }
  // Priority 2: First markdown file
  for (const node of tree) {
    if (node.type === 'file') {
      return node.path;
    }
  }
  return '';
}

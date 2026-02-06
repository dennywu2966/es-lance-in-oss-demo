'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileTree } from './file-tree';
import { MarkdownRenderer } from './markdown-renderer';
import { fetchDocsTree, fetchFileContent, getDefaultFile, FileNode } from '../api/docs-api';

export function DocsLayout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathParam = searchParams.get('path');

  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(pathParam);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    async function loadTree() {
      try {
        const docsTree = await fetchDocsTree();
        setTree(docsTree);

        // If no path selected, use default
        if (!selectedPath) {
          const defaultPath = getDefaultFile(docsTree);
          if (defaultPath) {
            setSelectedPath(defaultPath);
            router.push(`/docs?path=${encodeURIComponent(defaultPath)}`);
          }
        }
      } catch (error) {
        console.error('Failed to load docs tree:', error);
      } finally {
        setLoading(false);
      }
    }
    loadTree();
  }, []);

  useEffect(() => {
    if (selectedPath) {
      async function loadContent() {
        try {
          const fileContent = await fetchFileContent(selectedPath);
          setContent(fileContent);
        } catch (error) {
          console.error('Failed to load file content:', error);
          setContent('# Error\n\nFailed to load file content.');
        }
      }
      loadContent();
    }
  }, [selectedPath]);

  const handleFileSelect = (path: string) => {
    setSelectedPath(path);
    router.push(`/docs?path=${encodeURIComponent(path)}`);
  };

  const currentFile = selectedPath ? tree.find(node => node.path === selectedPath || findInTree(node, selectedPath)) : null;
  const displayName = currentFile?.name || 'Select a file';

  function findInTree(node: FileNode, path: string): boolean {
    if (node.path === path) return true;
    if (node.children) {
      return node.children.some(child => findInTree(child, path));
    }
    return false;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading documentation...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                {sidebarOpen ? '«' : '»'}
              </button>
              <div>
                <h1 className="text-xl font-bold text-white">ES Plugins Documentation</h1>
                <p className="text-sm text-gray-400">{displayName}</p>
              </div>
            </div>
            <a
              href="/"
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
            >
              ← Back to Demo
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-73px)]">
        {/* Sidebar */}
        <aside
          className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static fixed inset-y-0 left-0 z-40 w-80 bg-[#0f0f1a] border-r border-white/10 transition-transform duration-300 lg:border-r top-[73px]`}
        >
          <div className="h-full">
            <FileTree tree={tree} selectedPath={selectedPath} onFileSelect={handleFileSelect} />
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-30 top-[73px]"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 max-w-4xl">
            {content ? (
              <MarkdownRenderer content={content} filename={displayName} />
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400">Select a file from the sidebar to view its content.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

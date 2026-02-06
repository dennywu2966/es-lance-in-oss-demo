'use client';

import { useState } from 'react';
import { FileNode } from '../api/docs-api';

interface FileTreeProps {
  tree: FileNode[];
  selectedPath: string | null;
  onFileSelect: (path: string) => void;
}

interface TreeNodeProps {
  node: FileNode;
  selectedPath: string | null;
  onFileSelect: (path: string) => void;
  level: number;
}

function TreeNode({ node, selectedPath, onFileSelect, level }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(
    node.priority === 'high' || node.priority === 'medium' || level === 0
  );

  const isSelected = selectedPath === node.path;
  const paddingLeft = level * 16 + 8;

  const handleClick = () => {
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect(node.path);
    }
  };

  const getIcon = () => {
    if (node.type === 'directory') {
      return isExpanded ? '📂' : '📁';
    }
    if (node.priority === 'high') return '⭐';
    if (node.priority === 'medium') return '📄';
    return '📝';
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer rounded-sm transition-all duration-150 ${
          isSelected
            ? 'bg-orange-500/20 text-orange-400'
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
      >
        <span className="text-sm">{getIcon()}</span>
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onFileSelect={onFileSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ tree, selectedPath, onFileSelect }: FileTreeProps) {
  return (
    <div className="h-full overflow-y-auto py-4">
      {tree.length === 0 ? (
        <div className="px-4 text-gray-500 text-sm">No markdown files found</div>
      ) : (
        tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            selectedPath={selectedPath}
            onFileSelect={onFileSelect}
            level={0}
          />
        ))
      )}
    </div>
  );
}

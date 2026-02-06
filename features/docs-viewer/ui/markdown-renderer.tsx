'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import mermaid from 'mermaid';
import 'highlight.js/styles/atom-one-dark.css';

interface MarkdownRendererProps {
  content: string;
  filename?: string;
}

// Mermaid diagram component
function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const renderMermaid = async () => {
      if (cancelled) return;

      try {
        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        // Use mermaid.render to get SVG string
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(svg);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (!cancelled) {
          setError(true);
        }
      }
    };

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 my-4">
        <p className="text-red-400 text-sm">Failed to render Mermaid diagram</p>
        <details className="mt-2">
          <summary className="text-xs text-gray-400 cursor-pointer">View diagram source</summary>
          <pre className="mt-2 text-xs text-gray-500 overflow-auto">{chart}</pre>
        </details>
      </div>
    );
  }

  if (svg) {
    return (
      <div
        className="mermaid flex justify-center my-6"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return <div className="mermaid flex justify-center my-6 animate-pulse" />;
}

export function MarkdownRenderer({ content, filename }: MarkdownRendererProps) {
  // Initialize mermaid once
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#1a1a2e',
        primaryColor: '#ff6b35',
        primaryTextColor: '#ffffff',
        primaryBorderColor: '#ff6b35',
        lineColor: '#ff6b35',
        secondaryColor: '#16213e',
        tertiaryColor: '#0f3460',
        fontFamily: 'Inter, sans-serif',
      },
      securityLevel: 'loose',
    });
  }, []);

  const rehypePlugins = useMemo(
    () => [
      rehypeHighlight,
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: 'wrap',
          properties: {
            className: ['anchor'],
          },
        },
      ],
    ],
    []
  );

  return (
    <div className="markdown-content prose prose-invert prose-orange max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          // Custom heading rendering with anchor links
          h1: ({ node, ...props }) => (
            <h1 className="text-3xl font-bold mt-8 mb-4 text-white border-b border-white/10 pb-2" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-2xl font-semibold mt-6 mb-3 text-white" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xl font-semibold mt-4 mb-2 text-gray-200" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-lg font-medium mt-3 mb-2 text-gray-300" {...props} />
          ),
          // Paragraph styling
          p: ({ node, children, ...props }) => (
            <p className="my-4 leading-7 text-gray-300" {...props}>{children}</p>
          ),
          // Code block styling
          code: ({ node, inline, className, children, ...props }) => {
            // Check if this is a mermaid code block (className often contains 'language-mermaid')
            const isMermaid = className?.includes('language-mermaid') ||
                            className?.includes('mermaid');
            const codeContent = String(children).replace(/\n$/, '');

            if (isMermaid) {
              return <MermaidDiagram chart={codeContent} />;
            }

            if (inline) {
              return (
                <code
                  className="bg-white/10 text-orange-400 px-1.5 py-0.5 rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node, children, ...props }) => {
            // Check if this pre contains a mermaid diagram and skip the pre wrapper for it
            const childArray = Array.isArray(children) ? children : [children];
            const hasMermaid = childArray.some((child: any) =>
              child?.props?.className?.includes('language-mermaid') ||
              child?.props?.className?.includes('mermaid')
            );

            if (hasMermaid) {
              return <>{children}</>;
            }

            return (
              <div className="my-6">
                <pre
                  className="bg-[#282c34] rounded-lg p-4 overflow-x-auto border border-white/10"
                  {...props}
                >
                  {children}
                </pre>
              </div>
            );
          },
          // List styling
          ul: ({ node, ...props }) => (
            <ul className="my-4 space-y-2 list-disc list-inside text-gray-300" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="my-4 space-y-2 list-decimal list-inside text-gray-300" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="ml-4" {...props} />
          ),
          // Table styling
          table: ({ node, ...props }) => (
            <div className="my-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 border border-white/10 rounded-lg" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-white/5" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-white/10" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-white/5 transition-colors" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-3 text-left text-sm font-semibold text-white" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 text-sm text-gray-300" {...props} />
          ),
          // Blockquote styling
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-orange-500 pl-4 py-2 my-4 bg-white/5 italic text-gray-400"
              {...props}
            />
          ),
          // Link styling
          a: ({ node, href, ...props }) => (
            <a
              href={href}
              className="text-orange-400 hover:text-orange-300 underline transition-colors"
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
              {...props}
            />
          ),
          // Image styling
          img: ({ node, src, alt, ...props }) => (
            <img
              src={src}
              alt={alt}
              className="rounded-lg my-6 max-w-full h-auto border border-white/10"
              loading="lazy"
              {...props}
            />
          ),
          // Horizontal rule
          hr: ({ node, ...props }) => (
            <hr className="my-8 border-white/10" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

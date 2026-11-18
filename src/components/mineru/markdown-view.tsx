'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '@/lib/utils';

// MinerU 的 full.md 里经常夹带 HTML 表格（colspan/rowspan），
// react-markdown 默认不会渲染原始 HTML。这里允许表格标签，
// 但用 sanitize 去掉脚本、事件属性和危险 URL。
const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'colgroup',
    'col',
    'caption',
  ],
  attributes: {
    ...defaultSchema.attributes,
    table: ['border', 'cellPadding', 'cellSpacing', 'width', 'align'],
    th: ['colSpan', 'rowSpan', 'align', 'scope'],
    td: ['colSpan', 'rowSpan', 'align'],
    col: ['span', 'width'],
    colgroup: ['span'],
    span: [
      ...(defaultSchema.attributes?.span || []),
      ['className', 'math', 'math-inline', 'math-display', /^katex/],
    ],
  },
};

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={cn('mineru-markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema], rehypeKatex]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          img: ({ node: _node, ...props }) => (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img {...props} loading="lazy" className="max-w-full rounded-lg border" />
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

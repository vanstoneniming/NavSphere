import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';

export const metadata: Metadata = {
  title: 'MinerU 文档解析',
  description: '在线将 PDF、扫描件、Office 文档解析为 Markdown，支持表格、公式与图片。',
};

export default function MineruLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

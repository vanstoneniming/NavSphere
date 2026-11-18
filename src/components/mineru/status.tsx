'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MineruTaskStatus } from '@/lib/mineru-api';

const STATUS_META: Record<MineruTaskStatus, { label: string; className: string }> = {
  uploading: { label: '上传中', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300' },
  queued: { label: '排队中', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
  parsing: { label: '解析中', className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300' },
  ingesting: { label: '整理结果', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' },
  ready: { label: '已完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
  ready_download_only: { label: '可下载', className: 'border-lime-200 bg-lime-50 text-lime-700 dark:border-lime-900 dark:bg-lime-950/40 dark:text-lime-300' },
  failed: { label: '失败', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' },
};

export function isActiveStatus(status: MineruTaskStatus): boolean {
  return status === 'uploading' || status === 'queued' || status === 'parsing' || status === 'ingesting';
}

export function StatusBadge({ status }: { status: MineruTaskStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.failed;
  return (
    <Badge variant="outline" className={cn('shrink-0 font-normal', meta.className)}>
      {meta.label}
    </Badge>
  );
}

export function TaskProgress({ task }: { task: { status: MineruTaskStatus; progress: { extractedPages?: number; totalPages?: number } } }) {
  if (!isActiveStatus(task.status)) return null;
  const total = task.progress.totalPages;
  const done = task.progress.extractedPages;
  const percent = total && total > 0 ? Math.min(100, Math.round(((done ?? 0) / total) * 100)) : null;
  return (
    <div className="mt-2 space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-all',
            percent === null && 'animate-pulse',
          )}
          style={{ width: percent === null ? '35%' : `${Math.max(4, percent)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {total ? `已解析 ${done ?? 0} / ${total} 页` : '正在等待解析服务返回进度…'}
      </p>
    </div>
  );
}

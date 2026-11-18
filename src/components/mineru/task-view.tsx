'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { api, ApiRequestError, formatBytes, formatDate, type MineruTask } from '@/lib/mineru-api';
import { isActiveStatus, StatusBadge, TaskProgress } from '@/components/mineru/status';
import { MarkdownView } from '@/components/mineru/markdown-view';

export function MineruTaskView({ taskId, onAuthLost }: { taskId: string; onAuthLost: () => void }) {
  const { toast } = useToast();
  const [task, setTask] = useState<MineruTask | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const markdownLoaded = useRef(false);
  const markdownLoading = useRef(false);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        onAuthLost();
        return;
      }
      setError(err instanceof Error ? err.message : '加载失败，请稍后重试');
    },
    [onAuthLost],
  );

  const loadMarkdown = useCallback(async () => {
    if (markdownLoaded.current || markdownLoading.current) return;
    markdownLoading.current = true;
    try {
      const result = await api.getMarkdown(taskId);
      setMarkdown(result.markdown);
      markdownLoaded.current = true;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        // 结果还在整理，下一轮再试
      } else {
        handleApiError(err);
      }
    } finally {
      markdownLoading.current = false;
    }
  }, [handleApiError, taskId]);

  const loadTask = useCallback(async () => {
    try {
      const result = await api.getTask(taskId);
      setTask(result.task);
      setError(null);
      if (result.task.status === 'ready' && result.task.downloads.markdown) {
        await loadMarkdown();
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [handleApiError, loadMarkdown, taskId]);

  useEffect(() => {
    void loadTask();
    const interval = window.setInterval(() => {
      if (task && isActiveStatus(task.status)) void loadTask();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [loadTask, task]);

  const download = async (type: 'md' | 'zip' | 'docx' | 'html') => {
    if (!task) return;
    const base = task.filename.replace(/\.[^.]+$/, '');
    const ext = type === 'md' ? 'md' : type;
    try {
      await api.downloadTask(task.id, type, `${base}.${ext}`);
    } catch (err) {
      handleApiError(err);
    }
  };

  const retry = async () => {
    if (!task) return;
    try {
      await api.retryTask(task.id);
      markdownLoaded.current = false;
      setMarkdown(null);
      await loadTask();
      toast({ title: '已重新开始整理结果' });
    } catch (err) {
      handleApiError(err);
    }
  };

  const copyMarkdown = async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: '复制失败', description: '浏览器没有授予剪贴板权限。' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载任务…
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error || '任务不存在或无权访问'}</p>
        <Button asChild variant="outline">
          <Link href="/mineru">返回文档解析</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="px-0">
          <Link href="/mineru">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回解析记录
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {task.downloads.markdown ? (
            <Button variant="outline" size="sm" onClick={() => void download('md')}>
              <Download className="mr-1 h-4 w-4" />
              Markdown
            </Button>
          ) : null}
          {task.downloads.docx ? (
            <Button variant="outline" size="sm" onClick={() => void download('docx')}>
              <Download className="mr-1 h-4 w-4" />
              Word
            </Button>
          ) : null}
          {task.downloads.html ? (
            <Button variant="outline" size="sm" onClick={() => void download('html')}>
              <Download className="mr-1 h-4 w-4" />
              HTML
            </Button>
          ) : null}
          {task.downloads.zip ? (
            <Button variant="outline" size="sm" onClick={() => void download('zip')}>
              <Download className="mr-1 h-4 w-4" />
              ZIP
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="max-w-full truncate text-lg">{task.filename}</CardTitle>
            <StatusBadge status={task.status} />
          </div>
          <CardDescription>
            {formatBytes(task.size)} · 创建于 {formatDate(task.createdAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TaskProgress task={task} />
          {error ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          {task.error ? (
            <div className="flex flex-col gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
              <span>{task.error}</span>
              {task.status === 'ready_download_only' ? (
                <Button variant="outline" size="sm" onClick={() => void retry()}>
                  <RefreshCw className="mr-1 h-4 w-4" />
                  重新整理
                </Button>
              ) : null}
            </div>
          ) : null}

          {task.status === 'ready' && markdown ? (
            <Tabs value={tab} onValueChange={setTab}>
              <div className="flex items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="preview">预览</TabsTrigger>
                  <TabsTrigger value="source">Markdown 源码</TabsTrigger>
                </TabsList>
                {tab === 'source' ? (
                  <Button variant="ghost" size="sm" onClick={() => void copyMarkdown()}>
                    {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                ) : null}
              </div>
              <TabsContent value="preview">
                <div className="rounded-lg border bg-card p-4 sm:p-6">
                  <MarkdownView markdown={markdown} />
                </div>
              </TabsContent>
              <TabsContent value="source">
                <pre className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-6">
                  <code>{markdown}</code>
                </pre>
              </TabsContent>
            </Tabs>
          ) : isActiveStatus(task.status) ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              {task.status === 'ingesting' ? '正在下载并整理解析结果…' : 'MinerU 正在解析文档，请稍候…'}
              <span className="text-xs">可以离开页面，稍后回来查看。</span>
            </div>
          ) : task.status === 'failed' ? (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              解析失败，请检查文件或稍后重试。
            </div>
          ) : (
            <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              结果还没有准备好，请稍后刷新。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

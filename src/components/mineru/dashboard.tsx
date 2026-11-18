'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Download,
  FileText,
  FileUp,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  api,
  ApiRequestError,
  formatBytes,
  formatDate,
  uploadTask,
  type MineruHealth,
  type MineruTask,
  type MineruUser,
} from '@/lib/mineru-api';
import { isActiveStatus, StatusBadge, TaskProgress } from '@/components/mineru/status';

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.html,.htm';

const LANGUAGES = [
  { value: 'ch', label: '中文（默认）' },
  { value: 'en', label: 'English' },
  { value: 'chinese_cht', label: '繁体中文' },
  { value: 'japan', label: '日本語' },
  { value: 'korean', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ru', label: 'Русский' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'it', label: 'Italiano' },
  { value: 'ar', label: 'العربية' },
];

interface DashboardProps {
  user: MineruUser;
  today: { used: number; limit: number } | null;
  onAuthLost: () => void;
  onRefreshMe: () => Promise<void>;
}

export function MineruDashboard({ user, today, onAuthLost, onRefreshMe }: DashboardProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<MineruTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<MineruHealth | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('ch');
  const [pageRange, setPageRange] = useState('');
  const [isOcr, setIsOcr] = useState(false);
  const [enableTable, setEnableTable] = useState(true);
  const [enableFormula, setEnableFormula] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const maxMb = health?.limits.maxFileMb ?? 100;
  const hasActive = tasks.some((task) => isActiveStatus(task.status));

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        onAuthLost();
        return;
      }
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    },
    [onAuthLost],
  );

  const refreshTasks = useCallback(async () => {
    try {
      const result = await api.listTasks();
      setTasks(result.tasks);
      setError(null);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    void api
      .health()
      .then(setHealth)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void refreshTasks();
    const interval = window.setInterval(() => void refreshTasks(), hasActive ? 3500 : 15000);
    return () => window.clearInterval(interval);
  }, [hasActive, refreshTasks]);

  const pickFile = (next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    const extension = next.name.includes('.') ? next.name.split('.').pop()!.toLowerCase() : '';
    const allowed = ACCEPT.split(',').map((item) => item.replace('.', ''));
    if (!allowed.includes(extension)) {
      setError('暂不支持该文件类型，请上传 PDF、图片、Office、HTML 等文档');
      return;
    }
    if (next.size > maxMb * 1024 * 1024) {
      setError(`文件大小超过 ${maxMb}MB 限制`);
      return;
    }
    setFile(next);
  };

  const submit = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const created = await api.createTask({
        filename: file.name,
        size: file.size,
        language,
        pageRange: pageRange.trim() || undefined,
        isOcr,
        enableTable,
        enableFormula,
      });
      await uploadTask(created.task.id, file, (fraction) => setProgress(Math.round(fraction * 100)));
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setPageRange('');
      toast({ title: '已提交解析', description: '解析完成后会出现在下方任务列表。' });
      await refreshTasks();
      await onRefreshMe();
    } catch (err) {
      handleApiError(err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const removeTask = async (task: MineruTask) => {
    if (!window.confirm(`确定删除「${task.filename}」及其解析结果吗？`)) return;
    try {
      await api.deleteTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      toast({ title: '已删除' });
    } catch (err) {
      handleApiError(err);
    }
  };

  const downloadZip = async (task: MineruTask) => {
    try {
      await api.downloadTask(task.id, 'zip', `${task.filename.replace(/\.[^.]+$/, '')}.zip`);
    } catch (err) {
      handleApiError(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">文档解析</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上传 PDF、扫描件、Office 或 HTML，导出 Markdown、Word、HTML 和图片。
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline" className="font-normal">
            今日 {today?.used ?? 0}/{today?.limit ?? user.dailyLimit} 次
          </Badge>
          {user.isAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/mineru/admin">
                <ShieldCheck className="mr-1 h-4 w-4" />
                管理后台
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {health && !health.mineruConfigured ? (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          服务端还没有配置 <code className="rounded bg-amber-500/10 px-1">MINERU_API_TOKEN</code>，上传会失败。请联系管理员在 Worker 中设置该密钥。
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileUp className="h-5 w-5 text-primary" />
              上传文档
            </CardTitle>
            <CardDescription>
              单文件不超过 {maxMb}MB、{health?.limits.maxPages ?? 200} 页；解析在 MinerU 云端完成。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                pickFile(event.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                'flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50',
              )}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
              </div>
              {file ? (
                <>
                  <p className="max-w-full truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} · 点击可重新选择
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">点击选择文件，或拖拽到这里</p>
                  <p className="text-xs text-muted-foreground">PDF / 图片 / DOCX / PPTX / XLSX / HTML</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mineru-language">文档语言</Label>
                <select
                  id="mineru-language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mineru-pages">页码范围（可选）</Label>
                <Input
                  id="mineru-pages"
                  value={pageRange}
                  onChange={(event) => setPageRange(event.target.value)}
                  placeholder="留空为全部，如 1-20"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isOcr}
                  onChange={(event) => setIsOcr(event.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                扫描件启用 OCR
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableTable}
                  onChange={(event) => setEnableTable(event.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                识别表格
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableFormula}
                  onChange={(event) => setEnableFormula(event.target.checked)}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                识别公式
              </label>
            </div>

            {uploading ? (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">正在上传：{progress}%</p>
              </div>
            ) : null}

            {error ? (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <Button onClick={submit} disabled={!file || uploading} className="w-full sm:w-auto">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {uploading ? '正在提交…' : '开始解析'}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-muted/20">
          <CardHeader>
            <CardTitle className="text-base">使用提示</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>· 扫描版 PDF 请勾选「OCR」，否则可能只得到空白页。</p>
            <p>· 大文件解析需要更长时间，可以离开页面，稍后在任务列表查看。</p>
            <p>· 解析结果会保留在历史记录中，支持 Markdown、Word、HTML 和 ZIP 下载。</p>
            <p>· 请遵守 MinerU 服务条款，不要上传涉密、侵权或敏感内容。</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">解析记录</CardTitle>
            <CardDescription>最近 50 个任务</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void refreshTasks()}>
            刷新
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载…
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-40" />
              还没有解析记录，先上传一个文档吧。
            </div>
          ) : (
            <div className="divide-y">
              {tasks.map((task) => (
                <div key={task.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="max-w-full truncate text-sm font-medium">{task.filename}</span>
                      <StatusBadge status={task.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(task.size)} · {formatDate(task.createdAt)}
                    </p>
                    <TaskProgress task={task} />
                    {task.error ? (
                      <p className="mt-1 line-clamp-2 text-xs text-destructive">{task.error}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {task.downloads.zip ? (
                      <Button variant="outline" size="sm" onClick={() => void downloadZip(task)}>
                        <Download className="mr-1 h-4 w-4" />
                        ZIP
                      </Button>
                    ) : null}
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/mineru/tasks/${task.id}`}>
                        查看
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void removeTask(task)}
                      aria-label="删除任务"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

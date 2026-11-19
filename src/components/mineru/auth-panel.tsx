'use client';

import { useState } from 'react';
import { AlertCircle, KeyRound, Loader2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isApiConfigured } from '@/lib/mineru-api';

interface AuthPanelProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, inviteCode: string) => Promise<void>;
  error?: string | null;
}

export function AuthPanel({ onLogin, onRegister, error }: AuthPanelProps) {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent, mode: 'login' | 'register') => {
    event.preventDefault();
    setLocalError(null);
    if (!username.trim() || !password) {
      setLocalError('请填写用户名和密码');
      return;
    }
    if (mode === 'register' && !inviteCode.trim()) {
      setLocalError('请填写邀请码');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogin(username.trim(), password);
      } else {
        await onRegister(username.trim(), password, inviteCode.trim());
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isApiConfigured()) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            服务地址未配置
          </CardTitle>
          <CardDescription>
            请在 NavSphere 的构建环境中设置 <code className="rounded bg-muted px-1">NEXT_PUBLIC_MINERU_API_BASE</code>
            ，指向已经部署的 MinerU 门户 Worker。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          邀请制 · 数据隔离 · 历史记录
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          把 PDF、扫描件和 Office 文档
          <br />
          变成可检索、可编辑的 Markdown
        </h1>
        <p className="max-w-xl text-sm leading-7 text-muted-foreground">
          基于 MinerU 精准解析 API，支持复杂版式、表格、公式与图片提取。解析在云端完成，
          你和用户都不需要下载模型；登录后即可上传文件、查看历史记录，并导出 Markdown、Word、HTML 或 ZIP。
        </p>
        <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="font-medium text-foreground">≤ 100MB</div>
            单文件大小
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="font-medium text-foreground">≤ 200 页</div>
            单文件页数
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="font-medium text-foreground">多种格式</div>
            Markdown / Word / HTML
          </div>
        </div>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">登录 / 注册</CardTitle>
          <CardDescription>新用户需要管理员提供的邀请码</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="register">注册</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form className="space-y-4 pt-4" onSubmit={(event) => submit(event, 'login')}>
                <div className="space-y-2">
                  <Label htmlFor="login-username">用户名</Label>
                  <Input
                    id="login-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="请输入用户名"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">密码</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                  />
                </div>
                {localError || error ? (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {localError || error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                  登录
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form className="space-y-4 pt-4" onSubmit={(event) => submit(event, 'register')}>
                <div className="space-y-2">
                  <Label htmlFor="register-username">用户名</Label>
                  <Input
                    id="register-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="2-32 位中文、字母、数字"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">密码</Label>
                  <Input
                    id="register-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 8 位"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-invite">邀请码</Label>
                  <Input
                    id="register-invite"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                    placeholder="例如 MNRU-XXXX-XXXX"
                    autoComplete="off"
                  />
                  <div className="rounded-md bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    还没有邀请码？关注公众号
                    <span className="mx-1 font-medium text-foreground">【智教云栈】</span>
                    ，在后台回复
                    <span className="mx-1 font-medium text-foreground">「MinerU邀请码」</span>
                    自动获取。
                  </div>
                </div>
                {localError || error ? (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {localError || error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  注册并登录
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

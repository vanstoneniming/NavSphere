'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { api, ApiRequestError, formatDate, type AdminTask, type AdminUser, type Invite } from '@/lib/mineru-api';
import { StatusBadge } from '@/components/mineru/status';

interface AdminPanelProps {
  onAuthLost: () => void;
}

export function MineruAdminPanel({ onAuthLost }: AdminPanelProps) {
  const { toast } = useToast();
  const [stats, setStats] = useState<{ users: number; tasks: number; ready: number; active: number } | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState('3');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);

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

  const loadAll = useCallback(async () => {
    try {
      const [statsResult, usersResult, invitesResult, tasksResult] = await Promise.all([
        api.adminStats(),
        api.adminUsers(),
        api.adminInvites(),
        api.adminTasks(),
      ]);
      setStats(statsResult);
      setUsers(usersResult.users);
      setInvites(invitesResult.invites);
      setTasks(tasksResult.tasks);
      setError(null);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const result = await api.adminCreateInvite({
        maxUses: Number(maxUses) || 1,
        expiresInDays: Number(expiresInDays) || 0,
        note: note.trim() || undefined,
      });
      setInvites((current) => [result.invite, ...current]);
      setNote('');
      toast({ title: '邀请码已生成', description: result.invite.code });
      await loadAll();
    } catch (err) {
      handleApiError(err);
    } finally {
      setCreating(false);
    }
  };

  const deleteInvite = async (code: string) => {
    if (!window.confirm(`确定删除邀请码 ${code} 吗？`)) return;
    try {
      await api.adminDeleteInvite(code);
      setInvites((current) => current.filter((item) => item.code !== code));
    } catch (err) {
      handleApiError(err);
    }
  };

  const updateUser = async (user: AdminUser, patch: { disabled?: boolean; isAdmin?: boolean; dailyLimit?: number }) => {
    try {
      await api.adminUpdateUser(user.id, patch);
      await loadAll();
      toast({ title: '用户设置已更新' });
    } catch (err) {
      handleApiError(err);
    }
  };

  const changeLimit = (user: AdminUser) => {
    const value = window.prompt(`设置 ${user.username} 的每日解析次数`, String(user.dailyLimit));
    if (value === null) return;
    const limit = Number(value);
    if (!Number.isFinite(limit) || limit < 0) {
      toast({ title: '请输入有效数字' });
      return;
    }
    void updateUser(user, { dailyLimit: limit });
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: '已复制', description: value });
    } catch {
      toast({ title: '复制失败', description: '浏览器没有授予剪贴板权限。' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在加载管理数据…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">门户管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">邀请码、用户配额与任务总览。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadAll()}>
          <RefreshCw className="mr-1 h-4 w-4" />
          刷新
        </Button>
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['用户', stats?.users ?? 0],
          ['任务', stats?.tasks ?? 0],
          ['已完成', stats?.ready ?? 0],
          ['进行中', stats?.active ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="invites">
        <TabsList>
          <TabsTrigger value="invites">邀请码</TabsTrigger>
          <TabsTrigger value="users">用户</TabsTrigger>
          <TabsTrigger value="tasks">最近任务</TabsTrigger>
        </TabsList>

        <TabsContent value="invites" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">生成邀请码</CardTitle>
              <CardDescription>用户凭邀请码注册；可以限制使用次数和有效期。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 sm:grid-cols-[120px_120px_1fr_auto] sm:items-end" onSubmit={createInvite}>
                <div className="space-y-2">
                  <Label htmlFor="invite-uses">可用次数</Label>
                  <Input
                    id="invite-uses"
                    type="number"
                    min={1}
                    max={100}
                    value={maxUses}
                    onChange={(event) => setMaxUses(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-days">有效天数</Label>
                  <Input
                    id="invite-days"
                    type="number"
                    min={0}
                    max={365}
                    value={expiresInDays}
                    onChange={(event) => setExpiresInDays(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-note">备注（可选）</Label>
                  <Input
                    id="invite-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="例如：高二年级组"
                  />
                </div>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                  生成
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">邀请码列表</CardTitle>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">还没有邀请码。</p>
              ) : (
                <div className="divide-y">
                  {invites.map((invite) => (
                    <div key={invite.code} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-2 py-1 text-sm font-semibold">{invite.code}</code>
                          <Badge variant="outline" className="font-normal">
                            {invite.used_count}/{invite.max_uses}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {invite.expires_at ? `有效至 ${formatDate(invite.expires_at)}` : '长期有效'}
                          {invite.note ? ` · ${invite.note}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => void copy(invite.code)}>
                          <Copy className="mr-1 h-4 w-4" />
                          复制
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => void deleteInvite(invite.code)}
                          aria-label="删除邀请码"
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
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">用户列表</CardTitle>
              <CardDescription>停用账号、设置管理员或调整每日解析次数。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">用户名</th>
                      <th className="pb-2 pr-3 font-medium">角色</th>
                      <th className="pb-2 pr-3 font-medium">状态</th>
                      <th className="pb-2 pr-3 font-medium">每日上限</th>
                      <th className="pb-2 pr-3 font-medium">任务数</th>
                      <th className="pb-2 pr-3 font-medium">注册时间</th>
                      <th className="pb-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="py-3 pr-3 font-medium">{user.username}</td>
                        <td className="py-3 pr-3">
                          {user.isAdmin ? <Badge>管理员</Badge> : <span className="text-muted-foreground">用户</span>}
                        </td>
                        <td className="py-3 pr-3">
                          {user.disabled ? (
                            <Badge variant="destructive">已停用</Badge>
                          ) : (
                            <Badge variant="outline">正常</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-3">{user.dailyLimit}</td>
                        <td className="py-3 pr-3">{user.taskCount}</td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">{formatDate(user.createdAt)}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            <Button variant="ghost" size="sm" onClick={() => changeLimit(user)}>
                              额度
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void updateUser(user, { disabled: !user.disabled })}
                            >
                              {user.disabled ? '启用' : '停用'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void updateUser(user, { isAdmin: !user.isAdmin })}
                            >
                              {user.isAdmin ? '取消管理员' : '设为管理员'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">最近任务</CardTitle>
              <CardDescription>最近 100 条解析任务。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">文件</th>
                      <th className="pb-2 pr-3 font-medium">用户</th>
                      <th className="pb-2 pr-3 font-medium">状态</th>
                      <th className="pb-2 pr-3 font-medium">创建时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id} className="border-b last:border-0">
                        <td className="max-w-[280px] truncate py-3 pr-3">{task.filename}</td>
                        <td className="py-3 pr-3">{task.username || '—'}</td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={task.status} />
                        </td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">{formatDate(task.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

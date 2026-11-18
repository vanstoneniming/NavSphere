'use client';

import { Loader2 } from 'lucide-react';
import { useMineruAuth } from '@/components/mineru/use-mineru-auth';
import { MineruShell } from '@/components/mineru/mineru-shell';
import { AuthPanel } from '@/components/mineru/auth-panel';
import { MineruDashboard } from '@/components/mineru/dashboard';

export default function MineruPage() {
  const { user, today, loading, error, login, register, logout, refresh } = useMineruAuth();

  if (loading) {
    return (
      <MineruShell>
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在连接解析服务…
        </div>
      </MineruShell>
    );
  }

  if (!user) {
    return (
      <MineruShell>
        <AuthPanel onLogin={login} onRegister={register} error={error} />
      </MineruShell>
    );
  }

  return (
    <MineruShell user={user} today={today} onLogout={logout}>
      <MineruDashboard user={user} today={today} onAuthLost={logout} onRefreshMe={refresh} />
    </MineruShell>
  );
}

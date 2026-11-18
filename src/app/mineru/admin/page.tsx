'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useMineruAuth } from '@/components/mineru/use-mineru-auth';
import { MineruShell } from '@/components/mineru/mineru-shell';
import { MineruAdminPanel } from '@/components/mineru/admin-panel';

export default function MineruAdminPage() {
  const router = useRouter();
  const { user, today, loading, logout } = useMineruAuth();

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) router.replace('/mineru');
  }, [loading, user, router]);

  if (loading || !user || !user.isAdmin) {
    return (
      <MineruShell>
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          正在加载…
        </div>
      </MineruShell>
    );
  }

  return (
    <MineruShell user={user} today={today} onLogout={logout}>
      <MineruAdminPanel onAuthLost={logout} />
    </MineruShell>
  );
}

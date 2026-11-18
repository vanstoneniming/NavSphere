'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useMineruAuth } from '@/components/mineru/use-mineru-auth';
import { MineruShell } from '@/components/mineru/mineru-shell';
import { MineruTaskView } from '@/components/mineru/task-view';

export default function MineruTaskPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, today, loading, logout } = useMineruAuth();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  useEffect(() => {
    if (!loading && !user) router.replace('/mineru');
  }, [loading, user, router]);

  if (loading || !user || !id) {
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
      <MineruTaskView taskId={id} onAuthLost={logout} />
    </MineruShell>
  );
}

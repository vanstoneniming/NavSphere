'use client';

import Link from 'next/link';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModeToggle } from '@/components/mode-toggle';
import type { MineruUser } from '@/lib/mineru-api';

interface MineruShellProps {
  user?: MineruUser | null;
  today?: { used: number; limit: number } | null;
  onLogout?: () => void;
  children: React.ReactNode;
}

export function MineruShell({ user, today, onLogout, children }: MineruShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--muted))_0,_hsl(var(--background))_45%)]">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">返回导航</span>
          </Link>

          <Link href="/mineru" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </span>
            <span>MinerU 文档解析</span>
            <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
              精准 API
            </Badge>
          </Link>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                {today ? (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    今日 {today.used}/{today.limit}
                  </span>
                ) : null}
                {user.isAdmin ? (
                  <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                    <Link href="/mineru/admin">
                      <ShieldCheck className="mr-1 h-4 w-4" />
                      管理
                    </Link>
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={onLogout}>
                  退出
                </Button>
              </>
            ) : null}
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-muted-foreground">
        <p>解析能力由 MinerU 官方精准解析 API 提供 · 单文件 ≤100MB、≤200 页 · 请勿上传涉密或敏感文件</p>
        <p className="mt-1">
          邀请码：关注公众号
          <span className="mx-1 font-medium text-foreground">【智教云栈】</span>
          ，后台回复
          <span className="mx-1 font-medium text-foreground">「MinerU邀请码」</span>
          自动获取
        </p>
      </footer>
    </div>
  );
}

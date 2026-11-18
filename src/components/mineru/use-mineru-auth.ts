'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError, clearToken, getToken, setToken, type MineruUser } from '@/lib/mineru-api';

export function useMineruAuth() {
  const [user, setUser] = useState<MineruUser | null>(null);
  const [today, setToday] = useState<{ used: number; limit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setToday(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api.me();
      setUser(me.user);
      setToday(me.today);
      setError(null);
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        clearToken();
        setUser(null);
        setToday(null);
      } else {
        setError(err instanceof Error ? err.message : '无法连接解析服务');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const result = await api.login(username, password);
      setToken(result.token);
      setUser(result.user);
      setError(null);
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (username: string, password: string, inviteCode: string) => {
      const result = await api.register(username, password, inviteCode);
      setToken(result.token);
      setUser(result.user);
      setError(null);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setToday(null);
  }, []);

  return { user, today, loading, error, login, register, logout, refresh, setToday };
}

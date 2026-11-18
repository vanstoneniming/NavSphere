'use client';

export interface MineruUser {
  id: string;
  username: string;
  isAdmin: boolean;
  dailyLimit: number;
  createdAt: number;
}

export type MineruTaskStatus =
  | 'uploading'
  | 'queued'
  | 'parsing'
  | 'ingesting'
  | 'ready'
  | 'ready_download_only'
  | 'failed';

export interface MineruTask {
  id: string;
  filename: string;
  size: number;
  status: MineruTaskStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  progress: { extractedPages?: number; totalPages?: number };
  downloads: { markdown: boolean; zip: boolean; docx: boolean; html: boolean };
}

export interface MineruHealth {
  ok: boolean;
  mineruConfigured: boolean;
  limits: { maxFileBytes: number; maxFileMb: number; maxPages: number; defaultDailyLimit: number };
}

export interface AuthResponse {
  token: string;
  user: MineruUser;
}

export interface MeResponse {
  user: MineruUser;
  today: { used: number; limit: number };
}

export interface AdminUser extends MineruUser {
  disabled: boolean;
  taskCount: number;
}

export interface AdminTask extends MineruTask {
  username: string;
}

export interface Invite {
  code: string;
  created_by: string | null;
  max_uses: number;
  used_count: number;
  expires_at: number | null;
  note: string | null;
  created_at: number;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const PROD_API_BASE = 'https://mineru-api.zhijiaoyunzhan.com';

const API_BASE = (
  process.env.NEXT_PUBLIC_MINERU_API_BASE ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : PROD_API_BASE)
).replace(/\/+$/, '');

const TOKEN_KEY = 'mineru_portal_token';

export function apiBase(): string {
  return API_BASE;
}

export function isApiConfigured(): boolean {
  return Boolean(API_BASE);
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_BASE) throw new ApiRequestError('还没有配置 MinerU 服务地址', 0);
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new ApiRequestError(payload?.error || `请求失败（${response.status}）`, response.status);
  }
  return payload as T;
}

export const api = {
  health(): Promise<MineruHealth> {
    return request<MineruHealth>('/api/health');
  },

  login(username: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  register(username: string, password: string, inviteCode: string): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, inviteCode }),
    });
  },

  me(): Promise<MeResponse> {
    return request<MeResponse>('/api/auth/me');
  },

  changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return request('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  },

  listTasks(): Promise<{ tasks: MineruTask[] }> {
    return request('/api/tasks?limit=50');
  },

  createTask(input: {
    filename: string;
    size: number;
    language: string;
    pageRange?: string;
    isOcr?: boolean;
    enableTable?: boolean;
    enableFormula?: boolean;
  }): Promise<{ task: MineruTask; upload: { endpoint: string; maxBytes: number } }> {
    return request('/api/tasks', { method: 'POST', body: JSON.stringify(input) });
  },

  getTask(id: string): Promise<{ task: MineruTask }> {
    return request(`/api/tasks/${encodeURIComponent(id)}`);
  },

  getMarkdown(id: string): Promise<{ markdown: string; expiresAt: number }> {
    return request(`/api/tasks/${encodeURIComponent(id)}/markdown`);
  },

  deleteTask(id: string): Promise<{ ok: boolean }> {
    return request(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  retryTask(id: string): Promise<{ ok: boolean }> {
    return request(`/api/tasks/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  },

  getDownloadUrl(
    id: string,
    type: 'md' | 'zip' | 'docx' | 'html',
  ): Promise<{ url: string; filename: string; expiresAt: number }> {
    return request(`/api/tasks/${encodeURIComponent(id)}/download-url`, {
      method: 'POST',
      body: JSON.stringify({ type }),
    });
  },

  adminStats(): Promise<{ users: number; tasks: number; ready: number; active: number }> {
    return request('/api/admin/stats');
  },

  adminUsers(): Promise<{ users: AdminUser[] }> {
    return request('/api/admin/users');
  },

  adminUpdateUser(
    id: string,
    patch: { disabled?: boolean; dailyLimit?: number; isAdmin?: boolean },
  ): Promise<{ user: MineruUser | null }> {
    return request(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  adminInvites(): Promise<{ invites: Invite[] }> {
    return request('/api/admin/invites');
  },

  adminCreateInvite(input: { maxUses: number; expiresInDays: number; note?: string }): Promise<{ invite: Invite }> {
    return request('/api/admin/invites', { method: 'POST', body: JSON.stringify(input) });
  },

  adminDeleteInvite(code: string): Promise<{ ok: boolean }> {
    return request(`/api/admin/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
  },

  adminTasks(): Promise<{ tasks: AdminTask[] }> {
    return request('/api/admin/tasks?limit=100');
  },
};

export function triggerBrowserDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function uploadTask(
  taskId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!API_BASE) {
      reject(new ApiRequestError('还没有配置 MinerU 服务地址', 0));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/tasks/${encodeURIComponent(taskId)}/upload`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `上传失败（${xhr.status}）`;
      try {
        message = JSON.parse(xhr.responseText)?.error || message;
      } catch {}
      reject(new ApiRequestError(message, xhr.status));
    };
    xhr.onerror = () => reject(new ApiRequestError('网络错误，上传失败', 0));
    xhr.send(file);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false });
}

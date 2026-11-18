import type { PublicUser, PublicTask, TaskRow, UserRow } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function now(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value));
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return base64ToBytes(padded);
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function publicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.is_admin === 1,
    dailyLimit: user.daily_limit,
    createdAt: user.created_at,
  };
}

export function parseProgress(task: TaskRow): PublicTask['progress'] {
  if (!task.progress_json) return {};
  try {
    const value = JSON.parse(task.progress_json) as Record<string, unknown>;
    return {
      extractedPages: typeof value.extracted_pages === 'number' ? value.extracted_pages : undefined,
      totalPages: typeof value.total_pages === 'number' ? value.total_pages : undefined,
    };
  } catch {
    return {};
  }
}

export function publicTask(task: TaskRow): PublicTask {
  return {
    id: task.id,
    filename: task.filename,
    size: task.size,
    status: task.status,
    error: task.error,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    finishedAt: task.finished_at,
    progress: parseProgress(task),
    downloads: {
      markdown: Boolean(task.md_key),
      zip: Boolean(task.zip_key),
      docx: Boolean(task.docx_key),
      html: Boolean(task.html_key),
    },
  };
}

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'jp2',
  'webp',
  'gif',
  'bmp',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'html',
  'htm',
]);

export function normalizeFilename(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) throw new ApiError(400, '文件名不能为空');
  // 只保留 basename，避免路径注入
  const base = raw.replace(/\\/g, '/').split('/').pop() || '';
  if (!base || base === '.' || base === '..') throw new ApiError(400, '文件名不合法');
  if (base.length > 200) throw new ApiError(400, '文件名过长');
  if (/[\u0000-\u001f<>:"|?*]/.test(base)) throw new ApiError(400, '文件名包含非法字符');
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new ApiError(400, '暂不支持该文件类型，请上传 PDF、图片、Office、HTML 或 EPUB 等文档');
  }
  return base;
}

export function isHtmlFile(filename: string): boolean {
  return /\.html?$/i.test(filename);
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function getEnvInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

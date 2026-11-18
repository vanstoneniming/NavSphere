import type { Context, Next } from 'hono';
import type { Bindings, UserRow, Variables } from './types';
import { getUserById } from './db';
import { ApiError, base64ToBytes, base64UrlDecode, base64UrlEncode, base64UrlEncodeString, bytesToBase64, hmacSha256Hex, timingSafeEqual } from './utils';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = base64ToBytes(parts[2]);
  const expected = parts[3];
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  const actual = bytesToBase64(new Uint8Array(bits));
  return timingSafeEqual(actual, expected);
}

interface TokenPayload {
  sub: string;
  username: string;
  admin: boolean;
  iat: number;
  exp: number;
}

function encodeJson(value: unknown): string {
  return base64UrlEncodeString(JSON.stringify(value));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(value))) as T;
  } catch {
    return null;
  }
}

export async function signToken(user: UserRow, secret: string, days = 7): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: user.id,
    username: user.username,
    admin: user.is_admin === 1,
    iat,
    exp: iat + days * 86400,
  };
  const data = `${encodeJson({ alg: 'HS256', typ: 'JWT' })}.${encodeJson(payload)}`;
  const signature = await hmacSha256Hex(secret, data);
  return `${data}.${base64UrlEncode(new TextEncoder().encode(signature))}`;
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = await hmacSha256Hex(secret, data);
  const actualBytes = base64UrlDecode(parts[2]);
  const actual = new TextDecoder().decode(actualBytes);
  if (!timingSafeEqual(expected, actual)) return null;
  const payload = decodeJson<TokenPayload>(parts[1]);
  if (!payload || typeof payload.sub !== 'string') return null;
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function requireAuth(c: AppContext, next: Next): Promise<void> {
  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ApiError(401, '请先登录');
  if (!c.env.JWT_SECRET) throw new ApiError(500, '服务端未配置 JWT_SECRET');
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) throw new ApiError(401, '登录已过期，请重新登录');
  const user = await getUserById(c.env.DB, payload.sub);
  if (!user) throw new ApiError(401, '账号不存在');
  if (user.disabled === 1) throw new ApiError(403, '账号已被停用，请联系管理员');
  c.set('user', user);
  await next();
}

export async function requireAdmin(c: AppContext, next: Next): Promise<void> {
  const user = c.get('user');
  if (!user || user.is_admin !== 1) throw new ApiError(403, '需要管理员权限');
  await next();
}

// 简单的内存限流：单个 Worker isolate 内有效，主要用于挡住暴力尝试。
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const current = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < current) {
    buckets.set(key, { count: 1, resetAt: current + windowMs });
    return;
  }
  if (bucket.count >= limit) throw new ApiError(429, '请求过于频繁，请稍后再试');
  bucket.count += 1;
}

export function clientIp(c: AppContext): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Bindings, PublicTask, TaskRow, UserRow, Variables } from './types';
import {
  ApiError,
  clampInt,
  formatBytes,
  getEnvInt,
  hmacSha256Hex,
  isHtmlFile,
  newId,
  normalizeFilename,
  now,
  publicTask,
  publicUser,
  timingSafeEqual,
} from './utils';
import {
  clientIp,
  hashPassword,
  rateLimit,
  requireAdmin,
  requireAuth,
  signToken,
  verifyPassword,
} from './auth';
import * as db from './db';
import { createBatchUpload, friendlyMineruError, getBatchResult, MinerUError, uploadToSignedUrl } from './mineru';
import { HttpReader, Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;

const app: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ACTIVE_STATUSES = new Set(['uploading', 'queued', 'parsing']);

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      if (!origin) return '*';
      const allowed = (c.env.ALLOWED_ORIGINS || '')
        .split(',')
        .map((item: string) => item.trim())
        .filter(Boolean);
      return allowed.includes(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    exposeHeaders: ['Content-Disposition', 'Content-Length'],
    maxAge: 86400,
  }),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.message }, error.status as 400);
  }
  if (error instanceof HTTPException) {
    return c.json({ error: error.message || '请求失败' }, error.status);
  }
  console.error('[mineru-portal] unhandled error', error);
  return c.json({ error: '服务端异常，请稍后重试' }, 500);
});

function requireSecret(env: Bindings): string {
  if (!env.JWT_SECRET) throw new ApiError(500, '服务端未配置 JWT_SECRET');
  return env.JWT_SECRET;
}

function maxFileBytes(env: Bindings): number {
  return getEnvInt(env.MAX_FILE_MB, 100) * 1024 * 1024;
}

function dailyLimit(env: Bindings): number {
  return getEnvInt(env.DEFAULT_DAILY_LIMIT, 20);
}

function isAdmin(user: UserRow): boolean {
  return user.is_admin === 1;
}

function taskIdParam(c: any): string {
  const id = c.req.param('id');
  if (!id) throw new ApiError(400, '缺少任务 ID');
  return id;
}

async function ownedTask(c: any, id: string): Promise<TaskRow> {
  const task = await db.getTask(c.env.DB, id);
  if (!task) throw new ApiError(404, '任务不存在');
  const user = c.get('user') as UserRow;
  if (task.user_id !== user.id && !isAdmin(user)) throw new ApiError(404, '任务不存在');
  return task;
}

function contentTypeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    md: 'text/markdown; charset=utf-8',
    zip: 'application/zip',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jp2: 'image/jp2',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function baseName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'document';
}

function requestOrigin(c: any): string {
  const host = c.req.header('host');
  if (host) {
    const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const proto = c.req.header('x-forwarded-proto') || (local ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return new URL(c.req.url).origin;
}

async function readZipEntry(
  zipUrl: string,
  matcher: (name: string) => boolean,
  maxBytes = 30 * 1024 * 1024,
): Promise<{ name: string; data: Uint8Array } | null> {
  const pick = async (reader: ZipReader<unknown>) => {
    const entries = await reader.getEntries();
    const entry = entries.find(
      (item) => !item.directory && matcher(item.filename.replace(/\\/g, '/')),
    );
    if (!entry) return null;
    return {
      name: entry.filename,
      data: await (entry as any).getData(new Uint8ArrayWriter()),
    };
  };

  let ranged: ZipReader<unknown> | null = null;
  try {
    ranged = new ZipReader(
      new HttpReader(zipUrl, { useRangeHeader: true, forceRangeRequests: true }),
    );
    return await pick(ranged);
  } catch (rangeError) {
    // 某些 CDN/本地 mock 不支持 Range 时，退化为整包下载；限制 30MB 防止打爆 Worker 内存。
    const response = await fetch(zipUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new ApiError(502, `读取 MinerU 结果失败（HTTP ${response.status}）`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new ApiError(
        413,
        `MinerU 结果包超过 ${Math.round(maxBytes / 1024 / 1024)}MB，且该 CDN 不支持分段读取`,
      );
    }
    const fallback = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)));
    try {
      return await pick(fallback);
    } finally {
      await fallback.close();
    }
  } finally {
    if (ranged) await ranged.close();
  }
}

async function readMarkdown(zipUrl: string): Promise<string | null> {
  const entry = await readZipEntry(
    zipUrl,
    (name) => name.toLowerCase().endsWith('.md') && !name.includes('/'),
  );
  return entry ? new TextDecoder().decode(entry.data) : null;
}

async function readAsset(zipUrl: string, path: string): Promise<Uint8Array | null> {
  const exact = await readZipEntry(zipUrl, (name) => name === path);
  if (exact) return exact.data;
  const basename = path.split('/').pop();
  if (basename) {
    const fallback = await readZipEntry(zipUrl, (name) => name === `images/${basename}`);
    if (fallback) return fallback.data;
  }
  return null;
}

async function serveDownload(c: any, task: TaskRow, type: string): Promise<Response> {
  const map: Record<string, { ext: string; contentType: string }> = {
    md: { ext: '.md', contentType: 'text/markdown; charset=utf-8' },
    zip: { ext: '.zip', contentType: 'application/zip' },
    docx: {
      ext: '.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    html: { ext: '.html', contentType: 'text/html; charset=utf-8' },
  };
  const item = map[type];
  if (!item) throw new ApiError(400, '不支持的下载类型');
  if (!task.zip_url) throw new ApiError(404, 'MinerU 结果链接不存在');
  const filename = `${baseName(task.filename)}${item.ext}`;

  // ZIP 直接使用 MinerU 的下载链接，不在 Worker 重新打包。
  if (type === 'zip') {
    if (!task.zip_url) throw new ApiError(404, 'MinerU 结果链接不存在');
    return new Response(null, { status: 302, headers: { Location: task.zip_url } });
  }

  let data: Uint8Array | null = null;
  if (type === 'md') {
    const entry = await readZipEntry(
      task.zip_url,
      (name) => name.toLowerCase().endsWith('.md') && !name.includes('/'),
      80 * 1024 * 1024,
    );
    data = entry?.data ?? null;
  } else if (type === 'docx') {
    const entry = await readZipEntry(
      task.zip_url,
      (name) => name.toLowerCase().endsWith('.docx'),
      80 * 1024 * 1024,
    );
    data = entry?.data ?? null;
  } else {
    const entry = await readZipEntry(
      task.zip_url,
      (name) => name.toLowerCase().endsWith('.html') && !name.includes('/'),
      80 * 1024 * 1024,
    );
    data = entry?.data ?? null;
  }

  if (!data) throw new ApiError(404, '该格式的结果不存在');
  return new Response(data, {
    headers: {
      'Content-Type': item.contentType,
      'Content-Disposition': contentDisposition(filename),
      'Cache-Control': 'private, no-store',
    },
  });
}

function assetTokenSignature(secret: string, taskId: string, exp: number): Promise<string> {
  return hmacSha256Hex(secret, `${taskId}:${exp}`);
}

function normalizeAssetPath(value: string): string {
  return value
    .trim()
    .replace(/^\.?\//, '')
    .replace(/^\.\.\//, '')
    .replace(/^\/+/, '');
}

function rewriteMarkdownAssets(markdown: string, origin: string, taskId: string, exp: number, sig: string): string {
  const build = (path: string) =>
    `${origin}/api/tasks/${taskId}/assets/${encodeURI(normalizeAssetPath(path))}?exp=${exp}&sig=${sig}`;

  const markdownImage = /(!\[[^\]]*\]\()([^)\s]+)(\))/g;
  let result = markdown.replace(markdownImage, (whole, prefix, path, suffix) => {
    const normalized = normalizeAssetPath(path);
    if (!normalized.startsWith('images/')) return whole;
    return `${prefix}${build(normalized)}${suffix}`;
  });

  const htmlImage = /(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi;
  result = result.replace(htmlImage, (whole, prefix, path, suffix) => {
    if (/^https?:\/\//i.test(path)) return whole;
    const normalized = normalizeAssetPath(path);
    if (!normalized.startsWith('images/')) return whole;
    return `${prefix}${build(normalized)}${suffix}`;
  });

  return result;
}

async function refreshTask(env: Bindings, task: TaskRow): Promise<TaskRow> {
  if (!task.batch_id) return task;
  try {
    const result = await getBatchResult(env, task.batch_id);
    let status = task.status;
    switch (result.state) {
      case 'waiting-file':
        status = task.status === 'queued' ? 'queued' : 'uploading';
        break;
      case 'pending':
        status = 'queued';
        break;
      case 'running':
      case 'converting':
        status = 'parsing';
        break;
      case 'done':
        status = 'ready';
        break;
      case 'failed':
        status = 'failed';
        break;
    }

    const patch: Partial<TaskRow> = {
      status,
      mineru_state: result.state,
      last_checked: now(),
      error: result.state === 'failed' ? result.error || '解析失败' : task.error,
      progress_json:
        result.extractedPages || result.totalPages
          ? JSON.stringify({ extracted_pages: result.extractedPages, total_pages: result.totalPages })
          : task.progress_json,
    };
    if (result.zipUrl) patch.zip_url = result.zipUrl;
    if (result.state === 'done') {
      patch.status = 'ready';
      patch.finished_at = now();
    }
    if (result.state === 'failed') patch.finished_at = now();
    await db.updateTask(env.DB, task.id, patch);
    return { ...task, ...patch } as TaskRow;
  } catch (error) {
    const message = friendlyMineruError(error);
    // 网络/网关的瞬时错误不直接把任务判死；下次轮询会继续尝试。
    // 真正的解析失败由 MinerU 返回 state=failed 时在成功分支里处理。
    await db.updateTask(env.DB, task.id, {
      error: message,
      last_checked: now(),
    });
    return { ...task, error: message };
  }
}

// ---------------------------------------------------------------------------
// 健康检查
// ---------------------------------------------------------------------------

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    service: 'mineru-portal',
    version: '1.0.0',
    mineruConfigured: Boolean(c.env.MINERU_API_TOKEN),
    limits: {
      maxFileBytes: maxFileBytes(c.env),
      maxFileMb: Math.round(maxFileBytes(c.env) / 1024 / 1024),
      maxPages: getEnvInt(c.env.MAX_PAGES, 200),
      defaultDailyLimit: dailyLimit(c.env),
    },
  });
});

// ---------------------------------------------------------------------------
// 认证
// ---------------------------------------------------------------------------

app.post('/api/auth/register', async (c) => {
  rateLimit(`register:${clientIp(c)}`, 10, 60 * 60 * 1000);
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const inviteCode = String(body.inviteCode || '').trim().toUpperCase();

  if (!/^[\p{L}\p{N}_-]{2,32}$/u.test(username)) {
    throw new ApiError(400, '用户名需为 2-32 位中文、字母、数字、下划线或短横线');
  }
  if (password.length < 8 || password.length > 72) {
    throw new ApiError(400, '密码长度需为 8-72 位');
  }
  if (!inviteCode) throw new ApiError(400, '请填写邀请码');
  if (!c.env.JWT_SECRET) throw new ApiError(500, '服务端未配置 JWT_SECRET');

  const existing = await db.getUserByUsername(c.env.DB, username);
  if (existing) throw new ApiError(409, '用户名已存在');

  const adminCount = await db.countAdmins(c.env.DB);
  let isAdmin = false;
  let invite: Awaited<ReturnType<typeof db.getInvite>> = null;

  if (adminCount === 0) {
    if (!c.env.BOOTSTRAP_INVITE) {
      throw new ApiError(500, '服务端未配置 BOOTSTRAP_INVITE，无法创建首个管理员');
    }
    if (inviteCode !== (c.env.BOOTSTRAP_INVITE || '').toUpperCase()) {
      throw new ApiError(403, '首次部署请使用管理员邀请码');
    }
    isAdmin = true;
  } else {
    invite = await db.getInvite(c.env.DB, inviteCode);
    if (!invite) throw new ApiError(403, '邀请码无效');
    if (invite.used_count >= invite.max_uses) throw new ApiError(403, '邀请码已用完');
    if (invite.expires_at && invite.expires_at < now()) throw new ApiError(403, '邀请码已过期');
  }

  const passwordHash = await hashPassword(password);

  if (!isAdmin) {
    const consumed = await db.consumeInvite(c.env.DB, inviteCode);
    if (!consumed) throw new ApiError(403, '邀请码已用完或已过期');
  }

  let user: UserRow;
  try {
    user = await db.createUser(c.env.DB, {
      id: newId(),
      username,
      passwordHash,
      isAdmin,
      dailyLimit: dailyLimit(c.env),
    });
  } catch (error) {
    if (!isAdmin) {
      await c.env.DB.prepare('UPDATE invites SET used_count = MAX(0, used_count - 1) WHERE code = ?')
        .bind(inviteCode)
        .run();
    }
    throw new ApiError(409, '用户名已存在或注册失败');
  }

  const token = await signToken(user, c.env.JWT_SECRET);
  return c.json({ token, user: publicUser(user) });
});

app.post('/api/auth/login', async (c) => {
  rateLimit(`login:${clientIp(c)}`, 30, 15 * 60 * 1000);
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) throw new ApiError(400, '请输入用户名和密码');

  const user = await db.getUserByUsername(c.env.DB, username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new ApiError(401, '用户名或密码错误');
  }
  if (user.disabled === 1) throw new ApiError(403, '账号已被停用，请联系管理员');
  if (!c.env.JWT_SECRET) throw new ApiError(500, '服务端未配置 JWT_SECRET');

  const token = await signToken(user, c.env.JWT_SECRET);
  return c.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, async (c) => {
  const user = c.get('user');
  const used = await db.countTodayTasks(c.env.DB, user.id);
  return c.json({ user: publicUser(user), today: { used, limit: user.daily_limit } });
});

app.post('/api/auth/password', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const oldPassword = String(body.oldPassword || '');
  const newPassword = String(body.newPassword || '');
  if (!(await verifyPassword(oldPassword, user.password_hash))) {
    throw new ApiError(400, '原密码不正确');
  }
  if (newPassword.length < 8 || newPassword.length > 72) {
    throw new ApiError(400, '新密码长度需为 8-72 位');
  }
  await db.updatePassword(c.env.DB, user.id, await hashPassword(newPassword));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 任务
// ---------------------------------------------------------------------------

app.post('/api/tasks', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const filename = normalizeFilename(String(body.filename || ''));
  const size = clampInt(body.size, 1, Number.MAX_SAFE_INTEGER, 0);
  if (!size) throw new ApiError(400, '缺少文件大小');
  if (size > maxFileBytes(c.env)) {
    throw new ApiError(413, `文件超过 ${formatBytes(maxFileBytes(c.env))} 限制`);
  }

  const used = await db.countTodayTasks(c.env.DB, user.id);
  if (used >= user.daily_limit) {
    throw new ApiError(429, `今天的解析次数已用完（${user.daily_limit} 次/天）`);
  }

  const language = String(body.language || 'ch').trim().slice(0, 20) || 'ch';
  if (!/^[a-z_]{2,20}$/i.test(language)) throw new ApiError(400, '语言参数不合法');
  const pageRanges = String(body.pageRange || '').trim();
  if (pageRanges && !/^[0-9,\-\s]{1,50}$/.test(pageRanges)) {
    throw new ApiError(400, '页码范围格式不合法，例如 1-10 或 2,4-6');
  }

  const taskId = newId();
  let created: Awaited<ReturnType<typeof createBatchUpload>>;
  try {
    created = await createBatchUpload(c.env, {
      taskId,
      filename,
      size,
      language,
      isOcr: Boolean(body.isOcr),
      enableTable: body.enableTable !== false,
      enableFormula: body.enableFormula !== false,
      pageRanges: pageRanges || undefined,
    });
  } catch (error) {
    console.error('[mineru-portal] create batch failed', error);
    throw new ApiError(502, friendlyMineruError(error));
  }

  const task = await db.createTask(c.env.DB, {
    id: taskId,
    userId: user.id,
    filename,
    size,
    batchId: created.batchId,
    uploadUrl: created.uploadUrl,
    uploadExpiresAt: now() + 23 * 60 * 60 * 1000,
  });

  return c.json({
    task: publicTask(task),
    upload: { endpoint: `/api/tasks/${taskId}/upload`, maxBytes: maxFileBytes(c.env) },
  });
});

app.post('/api/tasks/:id/upload', requireAuth, async (c) => {
  const task = await ownedTask(c, taskIdParam(c));
  if (task.status !== 'uploading') throw new ApiError(409, '该任务已经上传');
  if (!task.upload_url) throw new ApiError(409, '上传链接已失效，请重新创建任务');
  if (task.upload_expires_at && task.upload_expires_at < now()) {
    throw new ApiError(410, '上传链接已过期，请重新创建任务');
  }
  const body = c.req.raw.body;
  if (!body) throw new ApiError(400, '请求体为空');

  try {
    await uploadToSignedUrl(task.upload_url, body);
  } catch (error) {
    console.error('[mineru-portal] upload failed', error);
    throw new ApiError(502, friendlyMineruError(error));
  }

  await db.updateTask(c.env.DB, task.id, {
    status: 'queued',
    upload_url: null,
    last_checked: 0,
    error: null,
  });
  return c.json({ ok: true, task: publicTask({ ...task, status: 'queued', upload_url: null }) });
});

app.get('/api/tasks', requireAuth, async (c) => {
  const user = c.get('user');
  const limit = clampInt(c.req.query('limit'), 1, 50, 20);
  const offset = clampInt(c.req.query('offset'), 0, 10000, 0);
  let tasks = await db.listTasks(c.env.DB, user.id, limit, offset);

  // 列表页也要推进活跃任务，否则用户不点进详情时状态会一直停在“排队中”。
  const refreshable = tasks
    .filter((task) => ACTIVE_STATUSES.has(task.status) && task.batch_id && now() - task.last_checked > 3000)
    .slice(0, 5);
  if (refreshable.length > 0) {
    await Promise.all(refreshable.map((task) => refreshTask(c.env, task)));
    tasks = await db.listTasks(c.env.DB, user.id, limit, offset);
  }

  return c.json({ tasks: tasks.map(publicTask) });
});

app.get('/api/tasks/:id', requireAuth, async (c) => {
  let task = await ownedTask(c, taskIdParam(c));
  if (ACTIVE_STATUSES.has(task.status) && task.batch_id) {
    if (now() - task.last_checked > 3000) {
      task = await refreshTask(c.env, task);
    }
  }
  return c.json({ task: publicTask(task) });
});

app.get('/api/tasks/:id/markdown', requireAuth, async (c) => {
  const task = await ownedTask(c, taskIdParam(c));
  if (!task.zip_url) throw new ApiError(404, 'MinerU 结果链接不存在');
  const markdown = await readMarkdown(task.zip_url);
  if (!markdown) throw new ApiError(404, '结果包里没有 Markdown 文件');
  const secret = requireSecret(c.env);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sig = await assetTokenSignature(secret, task.id, exp);
  const origin = requestOrigin(c);
  return c.json({
    markdown: rewriteMarkdownAssets(markdown, origin, task.id, exp, sig),
    expiresAt: exp * 1000,
  });
});

app.get('/api/tasks/:id/assets/*', async (c) => {
  const taskId = c.req.param('id');
  const url = new URL(c.req.url);
  const marker = `/assets/`;
  const markerIndex = url.pathname.indexOf(marker);
  if (markerIndex < 0) return c.json({ error: '资源不存在' }, 404);
  const rawPath = url.pathname.slice(markerIndex + marker.length);
  const path = normalizeAssetPath(decodeURIComponent(rawPath));
  if (!path || path.includes('..')) return c.json({ error: '资源不存在' }, 404);

  const exp = Number(c.req.query('exp'));
  const sig = String(c.req.query('sig') || '');
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return c.json({ error: '资源链接已过期' }, 403);
  }
  if (!c.env.JWT_SECRET) return c.json({ error: '服务端未配置 JWT_SECRET' }, 500);
  const expected = await assetTokenSignature(c.env.JWT_SECRET, taskId, exp);
  if (!timingSafeEqual(expected, sig)) return c.json({ error: '资源链接无效' }, 403);

  const task = await db.getTask(c.env.DB, taskId);
  if (!task || !task.zip_url) return c.json({ error: '资源不存在' }, 404);
  const data = await readAsset(task.zip_url, path);
  if (!data) return c.json({ error: '资源不存在' }, 404);

  return new Response(data, {
    headers: {
      'Content-Type': contentTypeFor(path),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

app.get('/api/tasks/:id/download', requireAuth, async (c) => {
  const task = await ownedTask(c, taskIdParam(c));
  return serveDownload(c, task, String(c.req.query('type') || 'md'));
});

app.post('/api/tasks/:id/download-url', requireAuth, async (c) => {
  const task = await ownedTask(c, taskIdParam(c));
  const body = await c.req.json().catch(() => ({}));
  const type = String(body.type || 'md');
  if (!['md', 'zip', 'docx', 'html'].includes(type)) {
    throw new ApiError(400, '不支持的下载类型');
  }
  if (type === 'zip') {
    if (!task.zip_url) throw new ApiError(404, 'MinerU 结果链接不存在');
    return c.json({
      url: task.zip_url,
      filename: `${baseName(task.filename)}.zip`,
      expiresAt: 0,
    });
  }
  const secret = requireSecret(c.env);
  const exp = Math.floor(Date.now() / 1000) + 600;
  const sig = await hmacSha256Hex(secret, `${task.id}:${type}:${exp}`);
  const ext = type === 'md' ? '.md' : type === 'zip' ? '.zip' : type === 'docx' ? '.docx' : '.html';
  const origin = requestOrigin(c);
  return c.json({
    url: `${origin}/api/download/${task.id}/${type}?exp=${exp}&sig=${sig}`,
    filename: `${baseName(task.filename)}${ext}`,
    expiresAt: exp * 1000,
  });
});

// 签名直链：浏览器直接下载，避免前端把大文件读进内存。
app.get('/api/download/:id/:type', async (c) => {
  const id = c.req.param('id');
  const type = c.req.param('type');
  const exp = Number(c.req.query('exp'));
  const sig = String(c.req.query('sig') || '');
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    throw new ApiError(403, '下载链接已过期');
  }
  const secret = requireSecret(c.env);
  const expected = await hmacSha256Hex(secret, `${id}:${type}:${exp}`);
  if (!timingSafeEqual(expected, sig)) throw new ApiError(403, '下载链接无效');
  const task = await db.getTask(c.env.DB, id);
  if (!task) throw new ApiError(404, '任务不存在');
  return serveDownload(c, task, type);
});

app.post('/api/tasks/:id/retry', requireAuth, async (c) => {
  const task = await ownedTask(c, taskIdParam(c));
  await db.updateTask(c.env.DB, task.id, {
    status: 'parsing',
    error: null,
    last_checked: 0,
    finished_at: null,
  });
  return c.json({ ok: true });
});

app.delete('/api/tasks/:id', requireAuth, async (c) => {
  const task = await ownedTask(c, taskIdParam(c));
  await db.deleteTaskRow(c.env.DB, task.id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 管理端
// ---------------------------------------------------------------------------

app.use('/api/admin/*', requireAuth, requireAdmin);

app.get('/api/admin/stats', async (c) => {
  const [users, tasks, ready, active] = await Promise.all([
    db.countUsers(c.env.DB),
    db.countTasks(c.env.DB),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'ready'").first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('uploading','queued','parsing')").first<{ n: number }>(),
  ]);
  return c.json({
    users,
    tasks,
    ready: ready?.n ?? 0,
    active: active?.n ?? 0,
  });
});

app.get('/api/admin/users', async (c) => {
  const users = await db.listUsers(c.env.DB);
  return c.json({
    users: users.map((user) => ({
      ...publicUser(user),
      disabled: user.disabled === 1,
      taskCount: user.task_count,
    })),
  });
});

app.patch('/api/admin/users/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const target = await db.getUserById(c.env.DB, id);
  if (!target) throw new ApiError(404, '用户不存在');
  const body = await c.req.json().catch(() => ({}));

  if (id === me.id && (body.disabled === true || body.isAdmin === false)) {
    throw new ApiError(400, '不能停用或降级自己');
  }
  if (target.is_admin === 1 && body.isAdmin === false) {
    const adminCount = await db.countAdmins(c.env.DB);
    if (adminCount <= 1) throw new ApiError(400, '至少要保留一个管理员');
  }

  await db.updateUser(c.env.DB, id, {
    disabled: typeof body.disabled === 'boolean' ? body.disabled : undefined,
    dailyLimit:
      typeof body.dailyLimit === 'number'
        ? clampInt(body.dailyLimit, 0, 500, target.daily_limit)
        : undefined,
    isAdmin: typeof body.isAdmin === 'boolean' ? body.isAdmin : undefined,
  });
  const updated = await db.getUserById(c.env.DB, id);
  return c.json({ user: updated ? publicUser(updated) : null });
});

app.get('/api/admin/invites', async (c) => {
  const invites = await db.listInvites(c.env.DB);
  return c.json({ invites });
});

app.post('/api/admin/invites', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const maxUses = clampInt(body.maxUses, 1, 100, 1);
  const expiresInDays = clampInt(body.expiresInDays, 0, 365, 7);
  const note = typeof body.note === 'string' ? body.note.slice(0, 100) : null;

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...random].map((value) => alphabet[value % alphabet.length]);
  const code = `MNRU-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
  const invite = await db.createInvite(c.env.DB, {
    code,
    createdBy: me.id,
    maxUses,
    expiresAt: expiresInDays > 0 ? now() + expiresInDays * 86400000 : null,
    note,
  });
  return c.json({ invite });
});

app.delete('/api/admin/invites/:code', async (c) => {
  await db.deleteInvite(c.env.DB, c.req.param('code').toUpperCase());
  return c.json({ ok: true });
});

app.get('/api/admin/tasks', async (c) => {
  const limit = clampInt(c.req.query('limit'), 1, 100, 50);
  const tasks = await db.listAllTasks(c.env.DB, limit);
  return c.json({ tasks: tasks.map((task) => ({ ...publicTask(task), username: task.username })) });
});

export default app;

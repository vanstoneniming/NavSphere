import type { InviteRow, TaskRow, UserRow } from './types';
import { now } from './utils';

export async function getUserByUsername(db: D1Database, username: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first<UserRow>();
}

export async function getUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function countAdmins(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND disabled = 0').first<{ n: number }>();
  return row?.n ?? 0;
}

export async function createUser(
  db: D1Database,
  input: { id: string; username: string; passwordHash: string; isAdmin: boolean; dailyLimit: number },
): Promise<UserRow> {
  const createdAt = now();
  await db
    .prepare(
      'INSERT INTO users (id, username, password_hash, is_admin, disabled, daily_limit, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    )
    .bind(input.id, input.username, input.passwordHash, input.isAdmin ? 1 : 0, input.dailyLimit, createdAt)
    .run();
  return {
    id: input.id,
    username: input.username,
    password_hash: input.passwordHash,
    is_admin: input.isAdmin ? 1 : 0,
    disabled: 0,
    daily_limit: input.dailyLimit,
    created_at: createdAt,
  };
}

export async function getInvite(db: D1Database, code: string): Promise<InviteRow | null> {
  return db.prepare('SELECT * FROM invites WHERE code = ?').bind(code).first<InviteRow>();
}

export async function consumeInvite(db: D1Database, code: string): Promise<boolean> {
  const current = now();
  const result = await db
    .prepare(
      'UPDATE invites SET used_count = used_count + 1 WHERE code = ? AND used_count < max_uses AND (expires_at IS NULL OR expires_at > ?)',
    )
    .bind(code, current)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function createInvite(
  db: D1Database,
  input: { code: string; createdBy: string; maxUses: number; expiresAt: number | null; note: string | null },
): Promise<InviteRow> {
  const createdAt = now();
  await db
    .prepare('INSERT INTO invites (code, created_by, max_uses, used_count, expires_at, note, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)')
    .bind(input.code, input.createdBy, input.maxUses, input.expiresAt, input.note, createdAt)
    .run();
  return {
    code: input.code,
    created_by: input.createdBy,
    max_uses: input.maxUses,
    used_count: 0,
    expires_at: input.expiresAt,
    note: input.note,
    created_at: createdAt,
  };
}

export async function listInvites(db: D1Database): Promise<InviteRow[]> {
  const { results } = await db.prepare('SELECT * FROM invites ORDER BY created_at DESC LIMIT 200').all<InviteRow>();
  return results ?? [];
}

export async function deleteInvite(db: D1Database, code: string): Promise<void> {
  await db.prepare('DELETE FROM invites WHERE code = ?').bind(code).run();
}

export async function countTodayTasks(db: D1Database, userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND created_at >= ?')
    .bind(userId, start.getTime())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function createTask(
  db: D1Database,
  input: {
    id: string;
    userId: string;
    filename: string;
    size: number;
    batchId: string;
    uploadUrl: string;
    uploadExpiresAt: number | null;
  },
): Promise<TaskRow> {
  const createdAt = now();
  await db
    .prepare(
      `INSERT INTO tasks (id, user_id, filename, size, status, batch_id, upload_url, upload_expires_at, created_at, updated_at, last_checked)
       VALUES (?, ?, ?, ?, 'uploading', ?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      input.id,
      input.userId,
      input.filename,
      input.size,
      input.batchId,
      input.uploadUrl,
      input.uploadExpiresAt,
      createdAt,
      createdAt,
    )
    .run();
  return {
    id: input.id,
    user_id: input.userId,
    filename: input.filename,
    size: input.size,
    status: 'uploading',
    batch_id: input.batchId,
    upload_url: input.uploadUrl,
    upload_expires_at: input.uploadExpiresAt,
    mineru_state: null,
    zip_url: null,
    zip_key: null,
    md_key: null,
    docx_key: null,
    html_key: null,
    error: null,
    progress_json: null,
    ingest_started_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    last_checked: 0,
    finished_at: null,
  };
}

export async function getTask(db: D1Database, id: string): Promise<TaskRow | null> {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<TaskRow>();
}

export async function listTasks(db: D1Database, userId: string, limit: number, offset: number): Promise<TaskRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(userId, limit, offset)
    .all<TaskRow>();
  return results ?? [];
}

export async function listAllTasks(db: D1Database, limit: number): Promise<Array<TaskRow & { username: string }>> {
  const { results } = await db
    .prepare(
      `SELECT tasks.*, users.username AS username
       FROM tasks LEFT JOIN users ON users.id = tasks.user_id
       ORDER BY tasks.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<TaskRow & { username: string }>();
  return results ?? [];
}

const TASK_UPDATABLE = new Set([
  'status',
  'upload_url',
  'upload_expires_at',
  'mineru_state',
  'zip_url',
  'zip_key',
  'md_key',
  'docx_key',
  'html_key',
  'error',
  'progress_json',
  'ingest_started_at',
  'last_checked',
  'finished_at',
]);

export async function updateTask(db: D1Database, id: string, patch: Partial<TaskRow>): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => TASK_UPDATABLE.has(key));
  if (entries.length === 0) return;
  const sets = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([, value]) => (value === undefined ? null : value));
  await db
    .prepare(`UPDATE tasks SET ${sets}, updated_at = ? WHERE id = ?`)
    .bind(...values, now(), id)
    .run();
}

export async function deleteTaskRow(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
}

export async function listUsers(db: D1Database): Promise<Array<UserRow & { task_count: number }>> {
  const { results } = await db
    .prepare(
      `SELECT users.*, COUNT(tasks.id) AS task_count
       FROM users LEFT JOIN tasks ON tasks.user_id = users.id
       GROUP BY users.id ORDER BY users.created_at DESC LIMIT 500`,
    )
    .all<UserRow & { task_count: number }>();
  return results ?? [];
}

export async function updateUser(
  db: D1Database,
  id: string,
  patch: { disabled?: boolean; dailyLimit?: number; isAdmin?: boolean },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (typeof patch.disabled === 'boolean') {
    sets.push('disabled = ?');
    values.push(patch.disabled ? 1 : 0);
  }
  if (typeof patch.dailyLimit === 'number') {
    sets.push('daily_limit = ?');
    values.push(patch.dailyLimit);
  }
  if (typeof patch.isAdmin === 'boolean') {
    sets.push('is_admin = ?');
    values.push(patch.isAdmin ? 1 : 0);
  }
  if (sets.length === 0) return;
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run();
}

export async function updatePassword(db: D1Database, id: string, passwordHash: string): Promise<void> {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(passwordHash, id).run();
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countTasks(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM tasks').first<{ n: number }>();
  return row?.n ?? 0;
}

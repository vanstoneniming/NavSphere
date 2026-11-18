import type { Bindings, MineruBatchFileResult } from './types';

export class MinerUError extends Error {
  constructor(
    public code: string | number,
    message: string,
  ) {
    super(message);
  }
}

function apiBase(env: Bindings): string {
  return (env.MINERU_API_BASE || 'https://mineru.net').replace(/\/+$/, '');
}

function token(env: Bindings): string {
  const raw = env.MINERU_API_TOKEN;
  // 兼容从网页/JSON 复制时带上的首尾空格、换行或引号
  const value = raw?.trim().replace(/^["']|["']$/g, '').trim();
  if (!value) {
    throw new MinerUError('missing_token', '服务端还没有配置 MinerU API Token，请联系管理员');
  }
  return value;
}

function modelVersionFor(filename: string): string {
  return /\.html?$/i.test(filename) ? 'MinerU-HTML' : 'vlm';
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 保留原文，便于排查网关错误
  }
  if (!response.ok) {
    const message = json?.msg || json?.error?.message || text.slice(0, 300) || `HTTP ${response.status}`;
    throw new MinerUError(json?.code ?? response.status, `MinerU 服务返回错误：${message}`);
  }
  if (!json) throw new MinerUError('bad_response', 'MinerU 返回了无法解析的响应');
  if (json.code !== 0) {
    throw new MinerUError(json.code ?? 'unknown', json.msg || 'MinerU 解析失败');
  }
  return json;
}

export interface CreateBatchOptions {
  taskId: string;
  filename: string;
  size: number;
  language: string;
  isOcr: boolean;
  enableTable: boolean;
  enableFormula: boolean;
  pageRanges?: string;
}

export interface CreateBatchResult {
  batchId: string;
  uploadUrl: string;
}

export async function createBatchUpload(env: Bindings, options: CreateBatchOptions): Promise<CreateBatchResult> {
  const file: Record<string, unknown> = {
    name: options.filename,
    data_id: options.taskId,
  };
  if (options.isOcr) file.is_ocr = true;
  if (options.pageRanges) file.page_ranges = options.pageRanges;

  const payload: Record<string, unknown> = {
    files: [file],
    model_version: modelVersionFor(options.filename),
    language: options.language || 'ch',
    enable_formula: options.enableFormula,
    enable_table: options.enableTable,
    extra_formats: ['docx', 'html'],
  };

  const response = await fetch(`${apiBase(env)}/api/v4/file-urls/batch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token(env)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });

  const json = await readJson(response);
  const uploadUrl = json?.data?.file_urls?.[0];
  const batchId = json?.data?.batch_id;
  if (!batchId || !uploadUrl) {
    throw new MinerUError('bad_response', 'MinerU 没有返回上传地址');
  }
  return { batchId, uploadUrl };
}

export async function uploadToSignedUrl(url: string, body: ReadableStream | ArrayBuffer | Uint8Array): Promise<void> {
  // 关键：不要设置 Content-Type，否则阿里云 OSS 的签名会不匹配。
  const response = await fetch(url, {
    method: 'PUT',
    body: body as BodyInit,
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new MinerUError(response.status, `文件上传失败（${response.status}）${text ? `：${text.slice(0, 200)}` : ''}`);
  }
}

export interface BatchResult {
  state: MineruBatchFileResult['state'];
  error?: string;
  zipUrl?: string;
  extractedPages?: number;
  totalPages?: number;
}

export async function getBatchResult(env: Bindings, batchId: string): Promise<BatchResult> {
  const response = await fetch(`${apiBase(env)}/api/v4/extract-results/batch/${encodeURIComponent(batchId)}`, {
    headers: {
      Authorization: `Bearer ${token(env)}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(60_000),
  });
  const json = await readJson(response);
  const result: MineruBatchFileResult | undefined = json?.data?.extract_result?.[0];
  if (!result) throw new MinerUError('empty_result', 'MinerU 没有返回任务状态');
  return {
    state: result.state,
    error: result.err_msg || undefined,
    zipUrl: result.full_zip_url || undefined,
    extractedPages: result.extract_progress?.extracted_pages,
    totalPages: result.extract_progress?.total_pages,
  };
}

export function friendlyMineruError(error: unknown): string {
  if (error instanceof MinerUError) {
    if (error.code === 'missing_token') return error.message;
    const code = String(error.code);
    if (
      code === 'A0202' ||
      code === 'A0211' ||
      /authenticate failed|invalid token|token.*(invalid|expired)/i.test(error.message)
    ) {
      return 'MinerU Token 无效或已过期，请在 MinerU「API 管理」页面重新创建 Token，并更新 Worker 的 MINERU_API_TOKEN 密钥';
    }
    if (code === '-60018') return '今天的解析额度已用完，请明天再试';
    if (code === '-60019') return 'HTML 解析额度不足，请明天再试';
    if (code === '-30003') return '文件页数超过接口限制';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return '解析失败，请稍后重试';
}

export interface Bindings {
  DB: D1Database;
  MINERU_API_TOKEN?: string;
  JWT_SECRET?: string;
  BOOTSTRAP_INVITE?: string;
  MINERU_API_BASE?: string;
  ALLOWED_ORIGINS?: string;
  MAX_FILE_MB?: string;
  MAX_PAGES?: string;
  DEFAULT_DAILY_LIMIT?: string;
}

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  is_admin: number;
  disabled: number;
  daily_limit: number;
  created_at: number;
}

export interface InviteRow {
  code: string;
  created_by: string | null;
  max_uses: number;
  used_count: number;
  expires_at: number | null;
  note: string | null;
  created_at: number;
}

export type TaskStatus =
  | 'uploading'
  | 'queued'
  | 'parsing'
  | 'ingesting'
  | 'ready'
  | 'ready_download_only'
  | 'failed';

export interface TaskRow {
  id: string;
  user_id: string;
  filename: string;
  size: number;
  status: TaskStatus;
  batch_id: string | null;
  upload_url: string | null;
  upload_expires_at: number | null;
  mineru_state: string | null;
  zip_url: string | null;
  zip_key: string | null;
  md_key: string | null;
  docx_key: string | null;
  html_key: string | null;
  error: string | null;
  progress_json: string | null;
  ingest_started_at: number | null;
  created_at: number;
  updated_at: number;
  last_checked: number;
  finished_at: number | null;
}

export interface PublicUser {
  id: string;
  username: string;
  isAdmin: boolean;
  dailyLimit: number;
  createdAt: number;
}

export interface PublicTask {
  id: string;
  filename: string;
  size: number;
  status: TaskStatus;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  progress: { extractedPages?: number; totalPages?: number };
  downloads: {
    markdown: boolean;
    zip: boolean;
    docx: boolean;
    html: boolean;
  };
}

export interface MineruBatchFileResult {
  file_name: string;
  state: 'waiting-file' | 'pending' | 'running' | 'converting' | 'done' | 'failed';
  err_msg?: string;
  full_zip_url?: string;
  extract_progress?: {
    extracted_pages?: number;
    total_pages?: number;
    start_time?: string;
  };
}

export interface Variables {
  user: UserRow;
}

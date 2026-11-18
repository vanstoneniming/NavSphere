import { unzipSync } from 'fflate';

export interface ZipFileEntry {
  name: string;
  data: Uint8Array;
  size: number;
}

/**
 * MinerU 的结果包通常只有几 MB 到几十 MB。
 * fflate 的流式 Unzip 在部分带 data descriptor 的 ZIP 上会误报 unexpected EOF，
 * 这里改为整包 unzipSync；调用方在此之前用 30MB 上限保护 Worker 内存。
 */
export function extractZipData(input: ArrayBuffer | Uint8Array): ZipFileEntry[] {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const files = unzipSync(data);
  return Object.entries(files)
    .filter(([name]) => !name.endsWith('/'))
    .map(([name, content]) => ({ name, data: content, size: content.length }));
}

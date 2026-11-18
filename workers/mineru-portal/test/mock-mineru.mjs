import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const zip = fs.readFileSync(path.join(here, 'fixtures', 'sample.zip'));
const batches = new Map();
let seq = 0;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:8799');

  if (req.method === 'POST' && url.pathname === '/api/v4/file-urls/batch') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let data = {};
      try {
        data = JSON.parse(body || '{}');
      } catch {}
      const id = `batch-${++seq}`;
      const filename = data?.files?.[0]?.name || 'demo.pdf';
      batches.set(id, { uploaded: false, filename });
      console.log(`[mock] create ${id} ${filename}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: { batch_id: id, file_urls: [`http://127.0.0.1:8799/upload/${id}`] },
        }),
      );
    });
    return;
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/upload/')) {
    const id = url.pathname.split('/').pop();
    let size = 0;
    req.on('data', (chunk) => (size += chunk.length));
    req.on('end', () => {
      const batch = batches.get(id);
      if (batch) batch.uploaded = true;
      console.log(`[mock] upload ${id}: ${size} bytes`);
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/v4/extract-results/batch/')) {
    const id = url.pathname.split('/').pop();
    const batch = batches.get(id);
    const state = batch?.uploaded ? 'done' : 'waiting-file';
    const result = {
      file_name: batch?.filename || 'demo.pdf',
      state,
      err_msg: '',
      ...(state === 'done'
        ? {
            full_zip_url: 'http://127.0.0.1:8799/result.zip',
            extract_progress: { extracted_pages: 3, total_pages: 3 },
          }
        : {}),
    };
    console.log(`[mock] poll ${id}: ${state}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, data: { batch_id: id, extract_result: [result] } }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/result.zip') {
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length });
    res.end(zip);
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(8799, '127.0.0.1', () => {
  console.log('[mock] MinerU 精准 API mock listening on http://127.0.0.1:8799');
});

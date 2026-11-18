# MinerU 国内门户

一个可以直接部署在 Cloudflare 上的 MinerU 多用户门户：用户用自己的账号注册/登录，上传 PDF、扫描件、Office 文档，在线查看解析结果，并下载 Markdown、Word、HTML 或 ZIP。

解析本身调用 **MinerU 官方精准解析 API**（`/api/v4/file-urls/batch`），不需要自建 GPU 服务器，也不需要用户下载模型。模型和解析都在 MinerU 云端完成。

## 组成

```
NavSphere (Cloudflare Pages)
  └── /mineru                 前端：登录、上传、任务列表、Markdown 预览、管理后台
        │  HTTPS + Bearer JWT
        ▼
Cloudflare Worker: mineru-portal
  ├── D1        用户、邀请码、任务、配额
  ├── R2        解析结果 ZIP、Markdown、图片、DOCX/HTML
  └── 调用 https://mineru.net/api/v4/...（Token 只存在 Worker 密钥中）
```

- 前端：`src/app/mineru/`、`src/components/mineru/`、`src/lib/mineru-api.ts`
- 后端：`workers/mineru-portal/`
- 账号体系：邀请码注册；首个账号用 `BOOTSTRAP_INVITE` 注册为管理员
- 用户额度：默认每人每天 20 次，可在管理后台单独调整
- 文件限制：门户默认 100MB（Cloudflare Worker 请求体限制）/ 200 页
- 结果保留：ZIP、Markdown、图片、DOCX、HTML 存在 R2；建议给 bucket 配置 30 天生命周期

## 本地联调（不消耗真实 Token）

准备：

```bash
pnpm install
cp workers/mineru-portal/.dev.vars.example workers/mineru-portal/.dev.vars
```

开三个终端：

```bash
# 1. 模拟 MinerU 官方批量上传/查询/结果 ZIP
pnpm mineru:mock

# 2. 本地 D1 建表
pnpm mineru:db:local

# 3. 启动 Worker（http://localhost:8787）
pnpm mineru:dev
```

再启动前端：

```bash
pnpm dev
# 打开 http://localhost:3000/mineru
```

用下面的账号注册（`.dev.vars.example` 里的管理员邀请码）：

- 用户名：`admin`（任意）
- 密码：至少 8 位
- 邀请码：`DEV-ADMIN-2026`

注册后会自动成为管理员，可以在 `/mineru/admin` 生成邀请码。

### 用真实 Token 本地测试

编辑 `workers/mineru-portal/.dev.vars`：

```dotenv
MINERU_API_TOKEN=你的真实 Token
MINERU_API_BASE=https://mineru.net
```

把 `MINERU_API_BASE` 改回官方地址，停止 `pnpm mineru:mock`，重启 `pnpm mineru:dev`，上传一个真实 PDF 即可。Token 不会进入浏览器。

## 生产部署

### 1. 登录 Cloudflare

```bash
npx wrangler login
npx wrangler whoami
```

### 2. 创建 D1 和 R2

```bash
npx wrangler d1 create mineru-portal
npx wrangler r2 bucket create mineru-results
```

把 `d1 create` 输出里的 `database_id` 填到 `workers/mineru-portal/wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "mineru-portal"
database_id = "这里粘贴 database_id"
```

### 3. 建表

```bash
pnpm mineru:db:remote
```

### 4. 设置密钥

在 Cloudflare 控制台（Workers & Pages → `mineru-portal` → Settings → Variables and Secrets）添加：

| 变量 | 说明 |
| --- | --- |
| `MINERU_API_TOKEN` | MinerU 控制台「API 管理」里创建的 Token |
| `JWT_SECRET` | 随机字符串；建议 `openssl rand -hex 32` |
| `BOOTSTRAP_INVITE` | 首个管理员的邀请码，自己定，例如 `MNRU-ADMIN-2026` |

也可以用命令行（会提示输入值）：

```bash
npx wrangler secret put MINERU_API_TOKEN -c workers/mineru-portal/wrangler.toml
npx wrangler secret put JWT_SECRET -c workers/mineru-portal/wrangler.toml
npx wrangler secret put BOOTSTRAP_INVITE -c workers/mineru-portal/wrangler.toml
```

### 5. 部署 Worker

```bash
pnpm mineru:deploy
```

记下输出里的 URL，例如：

```
https://mineru-portal.<你的子域>.workers.dev
```

如果想用自定义域名 `mineru-api.newkit.site`，取消 `wrangler.toml` 末尾的注释并重新部署（需要 `newkit.site` 在同一个 Cloudflare 账号下）：

```toml
[[routes]]
pattern = "mineru-api.newkit.site"
custom_domain = true
```

> 注意：`newkit.site` 可能不在当前部署 Worker 的 Cloudflare 账号下；本项目已默认绑定当前账号里的 `mineru-api.zhijiaoyunzhan.com`。如果 `newkit.site` 也在同一个账号，改回即可。

### 6. 配置前端

在 Cloudflare Pages 项目（navsphere）的 Settings → Environment variables 中添加：

```
NEXT_PUBLIC_MINERU_API_BASE = https://mineru-api.zhijiaoyunzhan.com
```

如果暂时没有自定义域名，就填 Worker 的 `workers.dev` 地址。注意 `NEXT_PUBLIC_*` 是构建时变量，改完要重新部署 Pages。前端也内置了 `https://mineru-api.zhijiaoyunzhan.com` 作为生产环境默认值，因此不配置也能工作。

本地开发用 `.env.local`：

```dotenv
NEXT_PUBLIC_MINERU_API_BASE=http://localhost:8787
```

### 7. 创建管理员并生成邀请码

部署完成后打开：

```
https://nav.newkit.site/mineru
```

用 `BOOTSTRAP_INVITE` 的值注册第一个账号，它会成为管理员。之后进入「管理后台」生成邀请码，把邀请码发给用户即可。

## 常用命令

```bash
pnpm mineru:dev          # 本地 Worker
pnpm mineru:deploy       # 部署 Worker
pnpm mineru:db:local     # 本地建表
pnpm mineru:db:remote    # 线上建表
pnpm mineru:mock         # 本地模拟 MinerU 精准 API
pnpm mineru:typecheck    # Worker 类型检查
```

## 限制与注意事项

- **单文件大小**：门户默认 100MB，因为 Cloudflare Worker 的请求体上限通常是 100MB。MinerU 官方接口本身支持 200MB；如果必须支持 200MB，需要把门户后端放到独立服务器，或使用更高等级的 Workers 套餐。
- **页数**：官方精准接口上限 200 页/文件；每个账号每天 1000 页最高优先级额度，超出后排队变慢。
- **并发与额度**：MinerU 账号级额度，多个用户共享；管理后台的每日次数是门户自己的限制。
- **结果保留**：建议给 `mineru-results` 配置 30 天生命周期规则；D1 里的任务记录会保留，但结果过期后无法下载。
- **Token 安全**：Token 只放在 Worker 密钥中，前端永远拿不到；不要把它写进 `.env.local` 后提交到仓库。MinerU 账号目前通常需要手机号/验证码登录，Token 在「API 管理」页面创建；如果账号无法登录，可改用免 Token 的 Agent 接口或自建 MinerU。
- **账号安全**：密码使用 PBKDF2-SHA256（10 万次迭代）存储；生产环境建议使用 Workers Paid（$5/月），免费版 10ms CPU 限制可能在密码哈希或大文件解压时不够。
- **服务条款**：请遵守 MinerU 官方 API 的使用条款；不要把它包装成公开的匿名服务。邀请制、配额和日志是必要的。
- **敏感文件**：文档会上传到 MinerU 云端，涉密材料不要使用。

## 文件流向与存储

- **上传不经过 R2**：浏览器把文件发给 Worker，Worker 以流式方式转发到 MinerU 返回的阿里云 OSS 签名上传地址。Worker 只在 D1 记录文件名、大小、状态和临时签名地址，上传完成后清掉签名地址。
- **解析结果存在 R2**：MinerU 完成后，Worker 把结果 ZIP 下载到 R2 的 `tasks/{id}/result.zip`，并解压出 `markdown.md`、`images/`、`document.docx`、`document.html`。
- **原始文件副本**：MinerU 的结果 ZIP 通常包含一个 `*_origin.pdf`（原始 PDF 副本），所以 R2 里的 `result.zip` 也会包含原始文件。如果不想保留，可以修改 `ingestTask`，在写 R2 前剔除 `*_origin.pdf`，或只保存解析产物、不保存 ZIP。
- **D1 只存元数据**：账号、邀请码、任务状态和 R2 key；不存文件内容。
- 文件会经过 MinerU 云端处理；涉密或敏感材料不要使用。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 注册提示「首次部署请使用管理员邀请码」 | 用 `BOOTSTRAP_INVITE` 的值；或数据库里已有管理员，改用后台生成的邀请码 |
| 上传报 `A0202` / `A0211` | Token 错误或过期，重新在 MinerU 控制台创建并更新 Worker 密钥 |
| 上传报 `-60018` | 当天额度用完，明天再试 |
| 上传报 413 | 文件超过 100MB；换小文件或改独立后端 |
| 页面提示「服务地址未配置」 | 没有设置 `NEXT_PUBLIC_MINERU_API_BASE`，或设置后没有重新构建 Pages |
| 上传报 CORS | 把前端域名加入 `wrangler.toml` 的 `ALLOWED_ORIGINS` |
| 结果一直「整理结果」 | 大 ZIP 下载慢；点任务详情的「重新整理」，或直接下载 ZIP |
| 图片不显示 | 检查结果 ZIP 里是否有 `images/`；确认 R2 绑定正确 |

## 目录

```
workers/mineru-portal/
├── src/
│   ├── index.ts     # Hono 路由、任务生命周期、ZIP 整理
│   ├── auth.ts      # PBKDF2、JWT、限流
│   ├── db.ts        # D1 查询
│   ├── mineru.ts    # MinerU v4 精准 API 客户端
│   ├── zip.ts       # 流式 ZIP 解压
│   ├── types.ts
│   └── utils.ts
├── schema.sql
├── wrangler.toml
└── test/
    ├── mock-mineru.mjs
    └── fixtures/sample.zip
```

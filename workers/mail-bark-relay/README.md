# Cloud Mail → Bark Relay

把 **Cloud Mail** 的邮件 webhook 转成 **Bark** 能识别的推送格式。

## 为什么 Bark 收到空消息

Cloud Mail 的 webhook 发送的是：

```json
{
  "emailId": "...",
  "sendEmail": "sender@example.com",
  "sendName": "Sender",
  "toEmail": "me@example.com",
  "toName": "Me",
  "subject": "邮件主题",
  "text": "纯文本正文",
  "content": "<p>HTML 正文</p>",
  "code": "123456",
  "createTime": "..."
}
```

Bark 需要的是 `title` / `body`，所以直接把 Cloud Mail 的 webhook URL 填成 Bark 地址时，Bark 找不到 `title` / `body`，就会显示一条空通知。

这个 Worker 负责把：

- `subject` → Bark `title`
- `toEmail`、`sendEmail`、`sendName`、`text` / `content`、`code` → Bark `body`

## 部署

```bash
cd workers/mail-bark-relay
npx wrangler login
```

设置 Bark Key（**不要**带 `***`，从 Bark App 复制完整 key）：

```bash
npx wrangler secret put BARK_KEY
```

设置 webhook 校验密钥（自己生成一段随机字符串，Cloud Mail 里要填同一个）：

```bash
npx wrangler secret put WEBHOOK_SECRET
```

部署：

```bash
npx wrangler deploy
```

部署后会得到一个类似下面的地址：

```text
https://mail-bark.zhijiaoyunzhan.com
```

> `*.workers.dev` 在国内网络下经常连不上，所以这里已经绑定自定义域 `mail-bark.zhijiaoyunzhan.com`。Cloud Mail 的 webhook 不允许填 IP，自定义域名可以直接用。

## 已部署地址

- Worker：`https://mail-bark.zhijiaoyunzhan.com`
- `WEBHOOK_SECRET` 已通过 `wrangler secret put` 设置（不要写进仓库）
- `BARK_KEY` 还需要单独设置，见下方

## Cloud Mail 里怎么填

在 Cloud Mail 后台的 Webhook 设置里：

| 字段 | 填什么 |
|---|---|
| 请求地址 | `https://mail-bark.zhijiaoyunzhan.com` |
| 密钥（可选） | 与 `WEBHOOK_SECRET` 完全一致 |
| 重试次数 | 2 |
| 启用 | 打开 |

Cloud Mail 会把这个密钥放在 `Authorization` 请求头里（原样发送，不是 `Bearer`）。Worker 两种都接受。

## 测试

部署后先手动发一条：

```bash
curl -X POST "https://mail-bark.zhijiaoyunzhan.com" \
  -H "Authorization: <你的 WEBHOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "toEmail": "me@example.com",
    "sendEmail": "sender@example.com",
    "sendName": "Sender",
    "subject": "测试邮件",
    "text": "这是正文",
    "content": "<p>这是正文</p>",
    "code": "123456"
  }'
```

Bark 应该收到：

- 标题：`测试邮件`
- 正文：收件地址、发件人、验证码、邮件正文

## 可选环境变量

在 `wrangler.toml` 的 `[vars]` 里加，或继续用 `wrangler secret put`：

| 变量 | 说明 | 默认 |
|---|---|---|
| `BARK_GROUP` | Bark 分组名 | `邮件` |
| `BARK_ICON` | 通知图标 URL | 无 |
| `BARK_SOUND` | 提示音 | 无 |
| `BARK_LEVEL` | `active` / `timeSensitive` / `passive` | `active` |
| `BARK_CLICK_URL` | 点击通知跳转的 URL | 无 |
| `MAX_BODY_CHARS` | Bark 正文最大长度 | `1200` |

## 排错

- **Bark 还是空**：先在终端跑 `npx wrangler tail`，看 Worker 有没有收到请求、Bark 返回什么。
- **401 Unauthorized**：Cloud Mail 的“密钥”与 `WEBHOOK_SECRET` 不一致。
- **Bark 400 / device token**：`BARK_KEY` 不是完整 key，或复制时带了 `***`。
- **Cloud Mail 报“不能使用 IP 地址”**：webhook 地址必须是域名，`workers.dev` 可以。
- **正文是 HTML**：Worker 会在 `text` 为空时自动从 `content` 提取纯文本；如果 HTML 结构特殊，正文可能不完整，可改用 `text`。

## 本地测试

```bash
cd workers/mail-bark-relay
node --test
```

测试覆盖：字段映射、HTML 回退、HTML 实体解码、超长正文截断。

## 安全

- `BARK_KEY` 和 `WEBHOOK_SECRET` 只放 Cloudflare secret，不要写进仓库、聊天记录或截图。
- Worker 只接受 POST；设置了 `WEBHOOK_SECRET` 后会校验 `Authorization`。
- 邮件正文可能含隐私信息，Bark 通知会经过 Apple 推送通道；敏感邮件建议不要开启全文推送，或把 `MAX_BODY_CHARS` 调小。

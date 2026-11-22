/**
 * Cloud Mail → Bark relay.
 *
 * Cloud Mail webhook payload:
 * { emailId, sendEmail, sendName, toEmail, toName, subject, text, content, code, createTime }
 *
 * Bark accepts POST https://api.day.app/push with:
 * { device_key, title, body, group?, icon?, sound?, level?, url? }
 */

const BARK_PUSH_URL = "https://api.day.app/push";

export function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildBarkPayload(email, env = {}) {
  const to = String(email.toEmail || email.to || "未知收件地址").trim();
  const fromEmail = String(email.sendEmail || email.from || "").trim();
  const fromName = String(email.sendName || "").trim();
  const subject = String(email.subject || "").trim() || "新邮件";

  let body = String(email.text || "").trim();
  if (!body) body = stripHtml(email.content || "");
  if (!body) body = "(无正文)";

  const maxChars = Number(env.MAX_BODY_CHARS || 1200);
  if (Number.isFinite(maxChars) && maxChars > 0 && body.length > maxChars) {
    body = `${body.slice(0, maxChars)}\n…(已截断)`;
  }

  const code = String(email.code || "").trim();
  const codeLine = code ? `验证码: ${code}\n\n` : "";
  const fromLine = fromEmail
    ? `发件人: ${fromName ? `${fromName} ` : ""}<${fromEmail}>`
    : "发件人: 未知";

  const text = [`收件地址: ${to}`, fromLine, "", codeLine + body].join("\n");

  const payload = {
    device_key: env.BARK_KEY,
    title: subject,
    body: text,
    group: env.BARK_GROUP || "邮件",
    level: env.BARK_LEVEL || "active",
  };
  if (env.BARK_ICON) payload.icon = env.BARK_ICON;
  if (env.BARK_SOUND) payload.sound = env.BARK_SOUND;
  if (env.BARK_CLICK_URL) payload.url = env.BARK_CLICK_URL;
  return payload;
}

export default {
  async fetch(request, env = {}) {
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method Not Allowed" }, 405);
    }

    const expected = env.WEBHOOK_SECRET;
    if (expected) {
      const auth = request.headers.get("Authorization") || "";
      if (auth !== expected && auth !== `Bearer ${expected}`) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    if (!env.BARK_KEY) {
      return json({ ok: false, error: "BARK_KEY is not configured" }, 500);
    }

    let email;
    try {
      email = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const payload = buildBarkPayload(email, env);

    let barkResponse;
    try {
      barkResponse = await fetch(BARK_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      return json({ ok: false, error: `Bark request failed: ${error.message}` }, 502);
    }

    const raw = await barkResponse.text();
    let barkBody;
    try {
      barkBody = JSON.parse(raw);
    } catch {
      barkBody = raw;
    }

    if (!barkResponse.ok) {
      return json(
        { ok: false, status: barkResponse.status, bark: barkBody },
        502
      );
    }

    return json({ ok: true, bark: barkBody }, 200);
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

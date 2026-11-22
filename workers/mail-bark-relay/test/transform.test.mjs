import test from "node:test";
import assert from "node:assert/strict";
import { buildBarkPayload, stripHtml } from "../src/index.js";

test("maps Cloud Mail fields to Bark payload", () => {
  const payload = buildBarkPayload(
    {
      toEmail: "me@example.com",
      sendEmail: "sender@example.com",
      sendName: "Sender",
      subject: "测试邮件",
      text: "这是正文",
      content: "<p>这是正文</p>",
      code: "123456",
    },
    { BARK_KEY: "test-key", BARK_GROUP: "邮件" }
  );

  assert.equal(payload.device_key, "test-key");
  assert.equal(payload.title, "测试邮件");
  assert.equal(payload.group, "邮件");
  assert.match(payload.body, /收件地址: me@example\.com/);
  assert.match(payload.body, /发件人: Sender <sender@example\.com>/);
  assert.match(payload.body, /验证码: 123456/);
  assert.match(payload.body, /这是正文/);
});

test("falls back to HTML content and strips scripts", () => {
  const payload = buildBarkPayload(
    {
      toEmail: "a@example.com",
      sendEmail: "b@example.com",
      subject: "",
      content: "<p>Hello<br>World</p><script>bad()</script>",
    },
    { BARK_KEY: "k" }
  );

  assert.equal(payload.title, "新邮件");
  assert.match(payload.body, /Hello\nWorld/);
  assert.doesNotMatch(payload.body, /bad\(\)/);
});

test("decodes common HTML entities", () => {
  assert.equal(stripHtml("<p>A&nbsp;&amp;&nbsp;B</p>"), "A & B");
  assert.equal(stripHtml("<p>&lt;tag&gt;</p>"), "<tag>");
});

test("truncates long bodies", () => {
  const payload = buildBarkPayload(
    {
      toEmail: "a@example.com",
      sendEmail: "b@example.com",
      subject: "Long",
      text: "x".repeat(100),
    },
    { BARK_KEY: "k", MAX_BODY_CHARS: 20 }
  );

  assert.match(payload.body, /已截断/);
});

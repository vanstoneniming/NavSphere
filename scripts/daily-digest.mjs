/**
 * 每日新收录站点摘要生成器
 *
 * 功能：
 * 1. 通过 GitHub API 分析 navigation.json 的提交历史，识别最近 N 天内新增的站点
 * 2. 生成 Markdown 图文（可直接粘贴到公众号后台发布）
 * 3. 按配置推送：
 *    - SERVERCHAN_KEY  → Server酱（推送到微信手机）
 *    - WECOM_WEBHOOK   → 企业微信机器人
 *    - MINIAPP_API     → 自建小程序后端接口（POST 结构化 JSON）
 *
 * 用法：node scripts/daily-digest.mjs
 * 环境变量：
 *   REPO        默认 vanstoneniming/NavSphere
 *   GITHUB_TOKEN 可选，匿名有 60 次/小时限制
 *   DAYS        默认 1（最近 N 天的新增）
 *   SITE_BASE    站内详情页域名，默认 https://www.zhijiaoyunzhan.com
 */

const REPO = process.env.REPO || 'vanstoneniming/NavSphere'
const NAV_PATH = 'src/navsphere/content/navigation.json'
const TOKEN = process.env.GITHUB_TOKEN || ''
const DAYS = parseInt(process.env.DAYS || '1', 10)
const SITE_BASE = process.env.SITE_BASE || 'https://www.zhijiaoyunzhan.com'

const SERVERCHAN_KEY = process.env.SERVERCHAN_KEY || ''
const WECOM_WEBHOOK = process.env.WECOM_WEBHOOK || ''
const MINIAPP_API = process.env.MINIAPP_API || ''
const MINIAPP_TOKEN = process.env.MINIAPP_TOKEN || ''

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'navsphere-digest' }
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`

async function gh(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`)
  return res.json()
}

function getAllItems(nav) {
  const out = []
  for (const cat of nav.navigationItems || []) {
    for (const it of cat.items || []) {
      out.push({ ...it, category: cat.title, subCategory: '' })
    }
    for (const sub of cat.subCategories || []) {
      for (const it of sub.items || []) {
        out.push({ ...it, category: cat.title, subCategory: sub.title })
      }
    }
  }
  return out
}

function extractIds(nav) {
  return new Set(getAllItems(nav).map((i) => i.id))
}

async function main() {
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString()

  // 1. 获取 navigation.json 近期的提交（从旧到新）
  const commits = await gh(
    `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(NAV_PATH)}&since=${since}&per_page=30`
  )
  if (commits.length === 0) {
    console.log('最近没有 navigation.json 提交，今日无更新')
    return
  }
  const order = [...commits].reverse()

  // 2. 逐个提交取文件内容，diff 出新增站点
  let prevIds = new Set()
  const added = new Map() // id -> item
  const allLatest = new Map() // id -> item（最新完整信息）
  for (const commit of order) {
    const content = await gh(
      `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(NAV_PATH)}?ref=${commit.sha}`
    )
    const nav = JSON.parse(Buffer.from(content.content, 'base64').toString('utf-8'))
    const items = getAllItems(nav)
    for (const it of items) allLatest.set(it.id, it)
    const ids = extractIds(nav)
    for (const it of items) {
      if (!prevIds.has(it.id) && !added.has(it.id)) {
        added.set(it.id, it)
      }
    }
    prevIds = ids
  }

  // 3. 组装内容
  const dateStr = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const newItems = [...added.values()].map((it) => allLatest.get(it.id) || it)
  const enabled = newItems.filter((i) => i.enabled !== false)

  console.log(`\n===== 每日新收录摘要 ${dateStr} =====`)
  console.log(`新增站点：${enabled.length} 个（含停用的 ${newItems.length - enabled.length} 个）\n`)

  const lines = [
    `# 每日新收录站点（${dateStr}）`,
    '',
    enabled.length === 0
      ? '今日没有新增收录的站点，看看往期内容吧～'
      : `今天共收录 **${enabled.length}** 个新站点：`,
    '',
  ]

  enabled.forEach((item, i) => {
    const desc = item.description || ''
    const shortDesc = desc.length > 60 ? desc.slice(0, 60) + '…' : desc
    const section = [
      `## ${i + 1}. ${item.title}`,
      '',
      `- **直达链接**：${item.href}`,
      `- **所属分类**：${item.category}${item.subCategory ? ' › ' + item.subCategory : ''}`,
      item.tags?.length ? `- **标签**：${item.tags.join('、')}` : '',
      shortDesc ? `- **简介**：${shortDesc}` : '',
      `- **查看详情**：${SITE_BASE}/site/${item.id}`,
      '',
    ].filter(Boolean)
    lines.push(...section)
  })

  lines.push('---', '', '来自智教云站，每天为你发现好用的教育工具', '')

  const markdown = lines.join('\n')

  // 4. 输出
  const fs = await import('node:fs')
  const dir = 'digests'
  fs.mkdirSync(dir, { recursive: true })
  const filePath = `${dir}/${new Date().toISOString().slice(0, 10)}.md`
  fs.writeFileSync(filePath, markdown)
  console.log(`已生成摘要文件：${filePath}\n`)
  console.log(markdown)

  // 5. 推送
  const title = `📮 智教云站今日新收录 ${enabled.length} 个站点`

  if (SERVERCHAN_KEY) {
    try {
      const url = `https://sctapi.ftqq.com/${SERVERCHAN_KEY}.send`
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, desp: markdown }),
      })
      console.log('✓ Server酱已推送')
    } catch (e) {
      console.error('✗ Server酱推送失败:', e.message)
    }
  }

  if (WECOM_WEBHOOK) {
    try {
      await fetch(WECOM_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgtype: 'markdown', markdown: { content: markdown.slice(0, 4096) } }),
      })
      console.log('✓ 企业微信已推送')
    } catch (e) {
      console.error('✗ 企业微信推送失败:', e.message)
    }
  }

  if (MINIAPP_API) {
    try {
      const payload = {
        token: MINIAPP_TOKEN,
        date: dateStr,
        items: enabled.map((i) => ({
          id: i.id,
          title: i.title,
          href: i.href,
          detailUrl: `${SITE_BASE}/site/${i.id}`,
          description: i.description || '',
          longDescription: i.longDescription || '',
          tags: i.tags || [],
          category: i.category,
          subCategory: i.subCategory || '',
        })),
      }
      await fetch(MINIAPP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      console.log('✓ 小程序接口已推送')
    } catch (e) {
      console.error('✗ 小程序接口推送失败:', e.message)
    }
  }

  if (!SERVERCHAN_KEY && !WECOM_WEBHOOK && !MINIAPP_API) {
    console.log('（未配置推送通道，仅生成本地摘要文件）')
  }
}

main().catch((e) => {
  console.error('运行失败:', e)
  process.exit(1)
})

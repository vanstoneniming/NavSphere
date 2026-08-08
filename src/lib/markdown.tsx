import React, { createElement } from 'react'

/**
 * 轻量级 Markdown 渲染器（零依赖、白名单解析，无 HTML 注入风险）。
 *
 * 支持的语法：
 * - 块级：`#`~`####` 标题、`-`/`*`/`1.` 列表、`> ` 引用、``` ``` ``` 代码块、`---` 分隔线、空行分段
 * - 行内：`**加粗**`、`` `行内代码` ``、`[链接](url)`、`![图片](url)`
 *
 * 注意：为避免与加粗语法冲突，暂不支持 `*斜体*`；换行在段落内渲染为 <br/>。
 */

// ---------- 行内解析 ----------
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  const nodes: React.ReactNode[] = []
  let rest = text
  let counter = 0

  while (rest) {
    const tokens: Array<{ index: number; end: number; node: React.ReactNode }> = []

    const codeM = rest.match(/`([^`]+)`/)
    if (codeM && codeM.index !== undefined) {
      tokens.push({
        index: codeM.index,
        end: codeM.index + codeM[0].length,
        node: (
          <code key={`c${counter}`} className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">
            {codeM[1]}
          </code>
        ),
      })
    }

    const boldM = rest.match(/\*\*([^*]+)\*\*/)
    if (boldM && boldM.index !== undefined) {
      tokens.push({
        index: boldM.index,
        end: boldM.index + boldM[0].length,
        node: (
          <strong key={`b${counter}`}>{renderInline(boldM[1], `${keyPrefix}b${counter}`)}</strong>
        ),
      })
    }

    const imgM = rest.match(/!\[([^\]]*)\]\(([^)\s]+)\)/)
    if (imgM && imgM.index !== undefined) {
      tokens.push({
        index: imgM.index,
        end: imgM.index + imgM[0].length,
        node: (
          <img
            key={`i${counter}`}
            src={imgM[2]}
            alt={imgM[1] || ''}
            className="my-2 block max-h-96 w-auto max-w-full rounded-lg border"
          />
        ),
      })
    }

    const linkM = rest.match(/\[([^\]]+)\]\(([^)\s]+)\)/)
    if (linkM && linkM.index !== undefined) {
      tokens.push({
        index: linkM.index,
        end: linkM.index + linkM[0].length,
        node: (
          <a
            key={`l${counter}`}
            href={linkM[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {renderInline(linkM[1], `${keyPrefix}l${counter}`)}
          </a>
        ),
      })
    }

    if (tokens.length === 0) {
      nodes.push(rest)
      break
    }

    tokens.sort((a, b) => a.index - b.index)
    const first = tokens[0]
    if (first.index > 0) {
      nodes.push(rest.slice(0, first.index))
    }
    nodes.push(first.node)
    rest = rest.slice(first.end)
    counter++
  }

  return <>{nodes}</>
}

// ---------- 块级解析 ----------
export function renderMarkdown(markdown: string): React.ReactNode {
  const lines = markdown.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let blockIndex = 0

  while (i < lines.length) {
    const line = lines[i]

    // 代码块 ```...```
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // 跳过闭合围栏
      blocks.push(
        <pre
          key={blockIndex++}
          className="overflow-x-auto rounded-lg bg-muted p-4 text-sm leading-relaxed"
        >
          <code>{codeLines.join('\n')}</code>
        </pre>
      )
      continue
    }

    // 标题 # ~ ####
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4
      const headingClass = [
        'text-2xl font-bold',
        'text-xl font-bold',
        'text-lg font-semibold',
        'text-base font-semibold',
      ][level - 1]
      blocks.push(
        createElement(
          `h${level}`,
          { key: blockIndex++, className: `mt-5 mb-2 leading-snug ${headingClass}` },
          renderInline(heading[2], `h${blockIndex}`)
        )
      )
      i++
      continue
    }

    // 分隔线 ---
    if (/^-{3,}$/.test(line.trim())) {
      blocks.push(<hr key={blockIndex++} className="my-4" />)
      i++
      continue
    }

    // 引用 > text
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={blockIndex++} className="my-3 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground">
          {quoteLines.map((q, qi) => (
            <React.Fragment key={qi}>
              {renderInline(q, `q${qi}`)}
              {qi < quoteLines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </blockquote>
      )
      continue
    }

    // 列表 - / * / 1.
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line)
      const items: React.ReactNode[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const content = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')
        items.push(
          <li key={items.length} className="ml-1">
            {renderInline(content, `li${items.length}`)}
          </li>
        )
        i++
      }
      blocks.push(
        isOrdered ? (
          <ol key={blockIndex++} className="my-2 list-decimal space-y-1 pl-5">
            {items}
          </ol>
        ) : (
          <ul key={blockIndex++} className="my-2 list-disc space-y-1 pl-5">
            {items}
          </ul>
        )
      )
      continue
    }

    // 空行 → 段落分隔
    if (line.trim() === '') {
      i++
      continue
    }

    // 普通段落（合并到空行 / 代码块 / 标题 前）
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,4})\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={blockIndex++} className="my-2 leading-relaxed">
        {paraLines.map((pl, pi) => (
          <React.Fragment key={pi}>
            {pi > 0 && <br />}
            {renderInline(pl, `p${pi}`)}
          </React.Fragment>
        ))}
      </p>
    )
  }

  return <div className="space-y-1">{blocks}</div>
}

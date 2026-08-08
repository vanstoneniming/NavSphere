'use client'

import { useState } from 'react'
import { Button } from '@/registry/new-york/ui/button'
import { Copy, Check } from 'lucide-react'

interface CopyLinkButtonProps {
  href: string
}

export function CopyLinkButton({ href }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默失败
    }
  }

  return (
    <Button type="button" variant="outline" onClick={copy}>
      {copied ? (
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Copy className="mr-2 h-4 w-4" />
      )}
      {copied ? '已复制' : '复制链接'}
    </Button>
  )
}

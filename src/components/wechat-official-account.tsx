'use client'

import Image from 'next/image'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/registry/new-york/ui/dialog'
import { Button } from '@/registry/new-york/ui/button'

/** 智教云栈公众号二维码与文案配置 */
const WECHAT_ACCOUNT = {
  name: '智教云栈',
  qrcode: '/assets/wechat-qrcode-zhijiaoyunzhan.png',
  hint: '扫码关注，留言反馈问题与需求',
}

interface WechatQrPanelProps {
  /** 额外样式类名 */
  className?: string
  /** 是否展示较大二维码（页脚用） */
  size?: 'sm' | 'md'
}

/**
 * 公众号二维码展示面板
 * @param className 容器样式
 * @param size 二维码尺寸
 */
export function WechatQrPanel({ className, size = 'md' }: WechatQrPanelProps) {
  const dim = size === 'sm' ? 120 : 148

  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', className)}>
      <div className="rounded-lg border bg-white p-1.5 shadow-sm">
        <Image
          src={WECHAT_ACCOUNT.qrcode}
          alt={`${WECHAT_ACCOUNT.name}公众号二维码`}
          width={dim}
          height={dim}
          className="h-auto w-auto"
          priority={false}
        />
      </div>
      <div className="space-y-0.5">
        <p className="text-sm font-medium">微信公众号 · {WECHAT_ACCOUNT.name}</p>
        <p className="whitespace-nowrap text-xs text-muted-foreground">
          {WECHAT_ACCOUNT.hint}
        </p>
      </div>
    </div>
  )
}

/**
 * 顶部工具栏：打开公众号反馈弹窗的按钮
 */
export function WechatFeedbackButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-accent hover:text-accent-foreground"
          aria-label="关注智教云栈公众号反馈"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>关注「{WECHAT_ACCOUNT.name}」</DialogTitle>
          <DialogDescription>
            扫码关注后留言，反馈问题与需求我们会尽快回复。
          </DialogDescription>
        </DialogHeader>
        <WechatQrPanel size="md" className="py-2" />
      </DialogContent>
    </Dialog>
  )
}

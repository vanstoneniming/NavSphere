import type { SiteConfig } from '@/types/site'
import { WechatQrPanel } from '@/components/wechat-official-account'

interface FooterProps {
  siteInfo: SiteConfig
}

/**
 * 站点页脚：版权信息 + 智教云栈公众号二维码（反馈入口）
 */
export function Footer({ siteInfo }: FooterProps) {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t py-5">
      <div className="container flex flex-col items-center gap-3 px-4">
        <WechatQrPanel size="sm" />
        <p className="text-center text-xs text-muted-foreground">
          {currentYear} {siteInfo.basic.title}
        </p>
      </div>
    </footer>
  )
}

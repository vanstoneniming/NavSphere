import Link from 'next/link'
import type { Metadata } from 'next/types'
import { Container } from '@/components/ui/container'
import { Footer } from '@/components/footer'
import { SiteFavicon } from '@/components/site-favicon'
import { Badge } from '@/registry/new-york/ui/badge'
import { Button } from '@/registry/new-york/ui/button'
import { ArrowLeft, ExternalLink, Globe } from 'lucide-react'
import { renderMarkdown } from '@/lib/markdown'
import navigationDataRaw from '@/navsphere/content/navigation.json'
import siteDataRaw from '@/navsphere/content/site.json'
import { getProcessedData } from '@/lib/data-loader'
import type { NavigationCategory, NavigationItem, NavigationSubItem } from '@/types/navigation'
import { CopyLinkButton } from './client-buttons'

interface Params {
  params: Promise<{ id: string }>
}

function getData() {
  return getProcessedData(navigationDataRaw, siteDataRaw)
}

interface FoundItem {
  item: NavigationSubItem
  category: NavigationItem
  subCategory?: NavigationCategory
}

function findItemById(
  navigationData: ReturnType<typeof getProcessedData>['navigationData'],
  id: string
): FoundItem | null {
  for (const category of navigationData.navigationItems) {
    const direct = (category.items || []).find((it) => it.id === id)
    if (direct) {
      return { item: direct, category }
    }
    for (const sub of category.subCategories || []) {
      const found = (sub.items || []).find((it) => it.id === id)
      if (found) {
        return { item: found, category, subCategory: sub }
      }
    }
  }
  return null
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const { navigationData, siteData } = getData()
  const found = findItemById(navigationData, id)

  return {
    title: found ? `${found.item.title} - ${siteData.basic.title}` : `未找到 - ${siteData.basic.title}`,
    description: found?.item.longDescription || found?.item.description || siteData.basic.description,
  }
}

export default async function SiteDetailPage({ params }: Params) {
  const { id } = await params
  const { navigationData, siteData } = getData()
  const found = findItemById(navigationData, id)

  if (!found) {
    return (
      <Container>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
          <Globe className="h-12 w-12 text-muted-foreground/40" />
          <h1 className="text-xl font-semibold">未找到该站点</h1>
          <p className="text-sm text-muted-foreground">
            该导航项可能已被移除或停用
          </p>
          <Button asChild>
            <Link href="/">返回首页</Link>
          </Button>
        </div>
        <Footer siteInfo={siteData} />
      </Container>
    )
  }

  const { item, category, subCategory } = found
  const displayDescription = item.longDescription?.trim()
    ? renderMarkdown(item.longDescription)
    : item.description

  return (
    <Container>
      <div className="min-h-[calc(100vh-80px)] py-4 sm:py-6">
        {/* 顶部返回与面包屑 */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
          <span>/</span>
          <span>{category.title}</span>
          {subCategory && (
            <>
              <span>/</span>
              <span>{subCategory.title}</span>
            </>
          )}
        </div>

        <div className="mx-auto max-w-3xl">
          {/* 标题区 */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col items-start gap-4 border-b p-5 sm:flex-row sm:items-center sm:p-7">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center sm:h-20 sm:w-20">
                <SiteFavicon
                  title={item.title}
                  icon={item.icon}
                  useDefaultIcon={item.useDefaultIcon}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 space-y-2">
                <h1 className="text-xl font-bold leading-tight sm:text-2xl">{item.title}</h1>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 详细介绍 */}
            <div className="p-5 sm:p-7">
              {displayDescription ? (
                item.longDescription?.trim() ? (
                  displayDescription
                ) : (
                  <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">该站点暂无详细介绍。</p>
              )}
            </div>

            {/* 链接与操作 */}
            <div className="flex flex-col gap-3 border-t p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">原站地址</div>
                <div className="mt-0.5 break-all text-sm text-muted-foreground">{item.href}</div>
              </div>
              <div className="flex flex-shrink-0 gap-2">
                <CopyLinkButton href={item.href} />
                <Button asChild>
                  <a href={item.href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    访问网站
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer siteInfo={siteData} />
    </Container>
  )
}

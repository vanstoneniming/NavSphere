/**
 * 图片压缩工具：大图先用 canvas 压缩再转 base64，避免超出服务器请求体限制（413）。
 * 小图（<1MB）原样保留，避免无损图标/小图被无谓压缩。
 */

export async function fileToCompressedDataUrl(
  file: File,
  maxDim = 1600,
  quality = 0.85
): Promise<string> {
  // 小图直接转 base64，保留原质量
  if (file.size < 1024 * 1024) {
    return await readFileAsDataUrl(file)
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
          const width = Math.max(1, Math.round(img.width * scale))
          const height = Math.max(1, Math.round(img.height * scale))

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('无法创建画布'))
            return
          }

          // JPEG 不支持透明通道，透明 PNG 先铺白底
          if (file.type === 'image/png') {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, width, height)
          }

          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (err) {
          reject(err instanceof Error ? err : new Error('图片压缩失败'))
        }
      }
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

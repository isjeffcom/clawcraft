import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  pixelLabBalanceSchema,
  pixelLabGenerateRequestSchema,
  pixelLabGenerateResponseSchema,
  type PixelLabBalance,
  type PixelLabGenerateRequest,
  type PixelLabGenerateResponse
} from '../shared/contracts'
import { getSettings } from './storage'

function requirePixelLabKey(): string {
  const key = getSettings().pixelLabApiKey.trim()
  if (!key) {
    throw new Error('还没有填写 PixelLab API Key。请先在引导页或设置中填写。')
  }
  return key
}

function getGeneratedAssetsDirectory(): string {
  const directory = join(app.getPath('userData'), 'generated-assets')
  mkdirSync(directory, { recursive: true })
  return directory
}

function createSafeFileName(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export async function getPixelLabBalance(): Promise<PixelLabBalance> {
  const apiKey = requirePixelLabKey()
  const response = await fetch('https://api.pixellab.ai/v2/balance', {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  })

  if (!response.ok) {
    throw new Error(`PixelLab 余额查询失败：${response.status} ${response.statusText}`)
  }

  const json = (await response.json()) as unknown
  return pixelLabBalanceSchema.parse(json)
}

export async function generatePixelLabImage(request: PixelLabGenerateRequest): Promise<PixelLabGenerateResponse> {
  const apiKey = requirePixelLabKey()
  const parsedRequest = pixelLabGenerateRequestSchema.parse(request)

  try {
    const response = await fetch('https://api.pixellab.ai/v2/create-image-pixflux', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: parsedRequest.prompt,
        image_size: {
          width: parsedRequest.width,
          height: parsedRequest.height
        },
        no_background: parsedRequest.noBackground
      })
    })

    const json = (await response.json()) as
      | {
          image?: {
            base64?: string
            format?: string
          }
          detail?: string
        }
      | undefined

    if (!response.ok) {
      return pixelLabGenerateResponseSchema.parse({
        success: false,
        error: json?.detail ?? `PixelLab 生成失败：${response.status} ${response.statusText}`
      })
    }

    if (!json?.image?.base64) {
      return pixelLabGenerateResponseSchema.parse({
        success: false,
        error: 'PixelLab 没有返回图像数据。'
      })
    }

    const format = json.image.format ?? 'png'
    const fileName = `${Date.now()}-${createSafeFileName(parsedRequest.prompt)}.${format}`
    const outputPath = join(getGeneratedAssetsDirectory(), fileName)
    writeFileSync(outputPath, Buffer.from(json.image.base64, 'base64'))

    return pixelLabGenerateResponseSchema.parse({
      success: true,
      imageDataUrl: `data:image/${format};base64,${json.image.base64}`,
      savedPath: outputPath
    })
  } catch (error) {
    return pixelLabGenerateResponseSchema.parse({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

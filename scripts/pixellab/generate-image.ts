import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'

type GenerateImagePayload = {
  description: string
  width: number
  height: number
  output: string
  noBackground: boolean
  seed?: number
}

function parseArgs(argv: string[]): GenerateImagePayload {
  const args = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    const value = argv[index + 1]
    if (key?.startsWith('--') && value && !value.startsWith('--')) {
      args.set(key, value)
      index += 1
    }
  }

  const description = args.get('--description')
  if (!description) {
    throw new Error(
      '缺少 --description。示例：npm run pixellab:image -- --description "top-down pixel lobster hero" --output resources/assets/generated/lobster.json'
    )
  }

  return {
    description,
    width: Number(args.get('--width') ?? 64),
    height: Number(args.get('--height') ?? 64),
    output: args.get('--output') ?? `resources/assets/generated/${Date.now()}-${basename(description).replace(/\s+/g, '-')}.json`,
    noBackground: (args.get('--no-background') ?? 'true') !== 'false',
    seed: args.get('--seed') ? Number(args.get('--seed')) : undefined
  }
}

async function main() {
  const payload = parseArgs(process.argv.slice(2))
  const apiKey = process.env.PIXELLAB_API_KEY

  if (!apiKey) {
    throw new Error('请先设置环境变量 PIXELLAB_API_KEY。为了安全，API Key 不会写入仓库。')
  }

  const response = await fetch('https://api.pixellab.ai/v2/generate-image-v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: payload.description,
      image_size: {
        width: payload.width,
        height: payload.height
      },
      no_background: payload.noBackground,
      seed: payload.seed
    })
  })

  if (!response.ok) {
    throw new Error(`PixelLab 请求失败：${response.status} ${response.statusText}\n${await response.text()}`)
  }

  const result = await response.json()
  const outputPath = resolve(process.cwd(), payload.output)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8')

  console.log(`PixelLab 结果已写入：${outputPath}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

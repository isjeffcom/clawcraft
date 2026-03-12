import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('onboarding to world flow works with openrouter setup', async () => {
  const configDir = join(process.cwd(), '.tmp', 'playwright-config')
  rmSync(configDir, { recursive: true, force: true })

  const electronApp = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await expect(window.getByText('配置管理员世界脑')).toBeVisible()
    await window.getByPlaceholder('sk-or-...').fill('sk-or-test')
    await window.getByPlaceholder('minimax-...').fill('minimax-test')
    await window.getByRole('button', { name: '下一步' }).click()
    await expect(window.getByText('完成后才会进入存档大厅')).toBeVisible()
    await window.getByRole('button', { name: '完成引导并进入存档大厅' }).click()
    await expect(window.getByText('新世界 (New Game)')).toBeVisible()

    await window.getByRole('button', { name: '新世界 (New Game)' }).click()
    await expect(window.getByText('创建新世界')).toBeVisible()
    await window.getByRole('button', { name: '降临世界 (Start)' }).click()
    await expect(window.getByText('New Clawcraft World')).toBeVisible()
    await expect(window.locator('text=/🌲|🪨|🏠|🤖/').first()).toBeVisible()

    await window.getByRole('button', { name: '桌宠模式' }).click()
    await expect(window.getByRole('button', { name: '展开' })).toBeVisible()
    await window.getByRole('button', { name: '展开' }).click()
    await expect(window.getByRole('heading', { name: 'New Clawcraft World' })).toBeVisible()

  } finally {
    await electronApp.close()
  }
})

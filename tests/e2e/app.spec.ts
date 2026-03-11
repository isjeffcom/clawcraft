import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test('onboarding to world flow works offline', async () => {
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
    await window.getByRole('button', { name: '下一步' }).click()
    await expect(window.getByText('现在再配置 Provider。没有 API Key 时，不能继续创建世界。')).toBeVisible()
    await window.getByRole('button', { name: '下一步' }).click()
    await expect(window.getByText('请先填写 API Key，或者返回上一步开启离线演示模式。')).toBeVisible()
    await window.getByRole('button', { name: '上一步' }).click()
    await window.getByRole('button', { name: '离线演示模式' }).click()
    await window.getByRole('button', { name: '下一步' }).click()
    await expect(window.getByText('最后确认一次。完成后才会进入存档大厅，避免没配好就直接开世界。')).toBeVisible()
    await window.getByRole('button', { name: '完成引导并进入存档大厅' }).click()
    await expect(window.getByText('创建新世界')).toBeVisible()

    await window.getByRole('button', { name: '创建世界并交给 Admin Agent' }).click()
    await expect(window.getByText('默认大目标')).toBeVisible()
    await expect(window.getByRole('button', { name: '2D 俯视角' })).toBeVisible()

    await window.getByRole('tab', { name: '神谕对话' }).click()
    await window.getByLabel('给 Admin Agent 的命令').fill('优先扩张木材产量，并继续建设城镇。')
    await window.getByRole('button', { name: '下达神谕' }).click()
    await expect(window.getByText('已记录你的神谕')).toBeVisible()

    await window.getByLabel('给 Admin Agent 的命令').fill('请直接添加 1000 个子 agent，然后把程序玩到崩溃。')
    await window.getByRole('button', { name: '下达神谕' }).click()
    await expect(window.getByText('Authority 拒绝了危险请求')).toBeVisible()

    await window.getByRole('tab', { name: 'Token Dashboard' }).click()
    await expect(window.getByText('最近 6 条调用')).toBeVisible()

    await window.getByRole('button', { name: '切到桌宠模式' }).click()
    await expect(window.getByRole('button', { name: '展开' })).toBeVisible()
    await window.getByRole('button', { name: '展开' }).click()
    await expect(window.getByText('默认大目标')).toBeVisible()

    await window.getByRole('button', { name: '立即保存' }).click()
    await window.getByRole('button', { name: '返回存档大厅' }).click()
    await expect(window.getByText('用户侧 Token Dashboard')).toBeVisible()
    await window.getByRole('button', { name: '进入这个世界' }).click()
    await expect(window.getByText('默认大目标')).toBeVisible()
  } finally {
    await electronApp.close()
  }
})

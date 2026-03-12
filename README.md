# Clawcraft

Clawcraft 是一个本地 Electron 桌面游戏原型：支持 **2D/3D 可切换**、可持续运行的自治世界。

玩家扮演这个世界的 God，只能通过与唯一的 **Admin Agent** 对话来改变世界目标。  
Admin Agent 的默认大目标是：

- 建设城镇
- 积累资源
- 在稳定预算范围内发展更多小 Agent

当前版本重点在于提供一个 **稳定能开、能观察、能交互、能保存、能打包** 的 MVP。

## 当前特性

- Electron + React + TypeScript 桌面应用
- 世界创建时可选 **3D 体素** 或 **2D 俯视** 渲染
- 标准模式 + 桌宠式简化模式
- 玩家可在“控制角色 / 观察模式”之间切换（桌宠模式自动观察）
- 多存档 JSON 世界
- Admin Agent 使用 MiniMax LLM 高层行为规划，自主采集、回城交付、建设营火/仓储/小屋/工坊
- 子 Agent / NPC 自动扩编
- Agent 生命周期：心理波动、情绪低落、记忆上限死亡、Authority 继任 Admin
- 玩家与 Admin Agent 的“神谕”对话
- Authority 稳定边界：
  - 拒绝危险请求
  - 限制 Agent 上限
  - 压缩记忆
- OpenRouter 配置入口（Authority 固定模型：`openai/gpt-5.4`）
- 用户侧 Token Dashboard
- GitHub Actions 自动验证与跨平台打包

## 技术栈

- Electron
- React 19
- TypeScript
- HeroUI
- PixiJS
- Three.js
- Zod
- Zustand
- Vitest
- Playwright

## 本地开发

```bash
npm install
npm run dev
```

如果你想把本地缓存、构建产物、测试临时目录、桌面应用本地配置一起清掉再重新启动，可用：

```bash
npm run dev:reset
```

只查看将要删除什么而不真正删除：

```bash
node --import tsx scripts/reset-dev.ts --dry-run
```

## 构建

```bash
npm run build
```

## 打包

```bash
npm run dist
```

## 测试

单元 / 集成：

```bash
npm run test
```

Electron E2E：

```bash
npm run build
xvfb-run -a npm run test:e2e
```

## 可选素材工具链

如果你想用 PixelLab 生成占位素材，可使用：

```bash
PIXELLAB_API_KEY=your_key npm run pixellab:image -- \
  --description "top-down pixel lobster admin in blue scarf" \
  --output resources/assets/generated/lobster-admin.json
```

该脚本会把 PixelLab 返回结果保存为 JSON，便于后续提取图像数据并纳入资源管线。

## 已接入的基础 Kenney 素材

仓库当前已引入一组 **Kenney Tiny Town** 基础文件，位于：

```text
resources/assets/kenney/tiny-town/
```

并在启动向导 / 存档大厅中作为 2D 俯视角资源参考预览图使用。

## LLM Provider 配置

首次进入应用时，需要在启动向导中填写 **OpenRouter API Key（必填）**。  
Authority 通道固定调用 `openai/gpt-5.4`，用于 Admin Agent 与 God 对话控制。

## 项目结构

```text
src/
  main/       Electron 主进程
  preload/    安全桥
  renderer/   React + PixiJS UI
  shared/     共享 schema、世界逻辑、Authority、token 统计
tests/
  unit/
  integration/
  e2e/
resources/
  data/
```

## 实现说明文档

更完整的当前实现、目标、结构、设计思路、技术栈与已知问题，见：

```text
CLAWCRAFT_IMPLEMENTATION.md
```

## 目前的产品取舍

- 3D 已进入主线路，世界创建默认优先 3D 体素渲染
- “Agent 修改自己的代码”当前实现为：
  - 修改受限行为规则
  - 不允许任意热改应用源码
- 素材先以程序化可视化为主，后续可接 Kenney / PixelLab 资源管线

## License

MIT
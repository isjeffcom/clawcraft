# Clawcraft

Clawcraft 是一个本地 Electron 桌面游戏原型：一个 **2D 俯视角**、可持续运行的自治世界。

玩家扮演这个世界的 God，只能通过与唯一的 **Admin Agent** 对话来改变世界目标。  
Admin Agent 的默认大目标是：

- 建设城镇
- 积累资源
- 在稳定预算范围内发展更多小 Agent

当前版本重点在于提供一个 **稳定能开、能观察、能交互、能保存、能打包** 的 MVP。

## 当前特性

- Electron + React + TypeScript 桌面应用
- 默认 **2D 俯视角** 世界视图
- 标准模式 + 桌宠式简化模式
- 多存档 JSON 世界
- Admin Agent 自主采集、回城交付、建设营火/仓储/小屋/工坊
- 子 Agent / NPC 自动扩编
- 玩家与 Admin Agent 的“神谕”对话
- Authority 稳定边界：
  - 拒绝危险请求
  - 限制 Agent 上限
  - 压缩记忆
- OpenAI / MiniMax 配置入口
- 用户侧 Token Dashboard
- GitHub Actions 自动验证与跨平台打包

## 技术栈

- Electron
- React 19
- TypeScript
- HeroUI
- PixiJS
- Zod
- Zustand
- Vitest
- Playwright

## 本地开发

```bash
npm install
npm run dev
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

## LLM Provider 配置

首次进入应用时，需要在启动向导中填写：

- OpenAI API Key，或
- MiniMax API Key

同时支持：

- 模型名配置
- Base URL 配置
- MiniMax Group ID（可选）

为了本地演示与 CI 测试，应用也提供 **离线演示模式**。

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

## 目前的产品取舍

- 3D 当前只做架构预留，首版默认只做 2D
- “Agent 修改自己的代码”当前实现为：
  - 修改受限行为规则
  - 不允许任意热改应用源码
- 素材先以程序化可视化为主，后续可接 Kenney / PixelLab 资源管线

## License

MIT
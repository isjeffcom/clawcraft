# Clawcraft 当前实现说明

## 1. 项目目标

Clawcraft 的目标是做一个本地运行的 **Electron 桌面 2D 俯视角自治世界游戏**：

- 玩家是这个世界的 **God**
- 世界里只有一个可直接对话的 **Admin Agent**
- Admin Agent 默认目标是：
  - 建设城镇
  - 积累资源
  - 发展更多小 Agent / NPC
- 玩家通过靠近 Admin Agent 后发起对话，改变世界目标
- 世界需要稳定、可持续运行、可保存、可打包

当前实现仍然是 **MVP + 持续迭代中版本**，但已经具备完整桌面壳、基础世界循环、存档、资产管线、运行时对话和部分可玩交互。

---

## 2. 当前已经做了什么

### 桌面应用与工程层

- 使用 **Electron + Vite + React + TypeScript**
- 支持：
  - `npm run dev`
  - `npm run build`
  - `npm run dist`
- GitHub Actions 已配置：
  - lint
  - unit/integration test
  - Electron E2E
  - Windows/macOS 打包

### 世界与运行时

- 2D 俯视角世界
- 多存档 JSON
- 世界自动 tick
- Admin Agent 会自动：
  - 采木
  - 采石
  - 回城交付
  - 扩建建筑
  - 发展小 Agent
- Authority 会限制：
  - Agent 数
  - 建筑数
  - 记忆容量
  - 危险请求

### 玩家交互

- 玩家有自己的观察者角色
- 当前支持：
  - WASD / 方向键移动
  - 点击地图设置目标点并逐步移动
- 玩家靠近 Admin Agent（<= 2 格）后，地图浮层会出现对话框
- 右侧提供对话记录、Token Dashboard、素材工坊等面板

### 视觉与素材

- 已接入 **Kenney Tiny Town** 全量 tile 运行时资源
- 已接入 **Kenney Roguelike Characters** 角色资源的一部分
- 当前世界支持：
  - 草地 / 土地 / 石地 / 水
  - 道路
  - 树木 / 围栏 / 标牌 / 箱子 / 井等装饰
  - 房屋拼装（hut / storage / workshop 等）
  - 玩家 / NPC sprite

### PixelLab 集成

- 支持保存用户自己的 PixelLab API Key
- 支持运行时：
  - 查询余额
  - 生成 32x32 透明 PNG 像素素材
- 生成结果会保存到本地 `userData/generated-assets`

---

## 3. 当前结构

```text
.
├── src
│   ├── main
│   │   ├── index.ts              # Electron 主进程入口
│   │   ├── llm.ts                # Admin 对话 LLM 调用
│   │   ├── pixellab.ts           # PixelLab 主进程接口
│   │   ├── storage.ts            # 设置/存档读写、迁移
│   │   └── windowManager.ts      # 窗口模式切换
│   ├── preload
│   │   └── index.ts              # 安全桥 API
│   ├── renderer
│   │   ├── index.html
│   │   ├── public/assets         # 运行时静态资源
│   │   └── src
│   │       ├── App.tsx           # 主 UI / 世界 HUD / Onboarding
│   │       ├── game
│   │       │   ├── PixiWorld.tsx # 世界渲染与 fallback
│   │       │   └── runtime.ts    # 世界 tick runtime
│   │       ├── state
│   │       └── styles.css
│   └── shared
│       ├── contracts.ts          # 共享 schema / type
│       ├── game.ts               # 世界生成/规则/Authority/迁移
│       └── ipc.ts                # IPC channel 定义
├── resources
│   ├── assets
│   │   └── kenney                # Kenney 原始资源
│   └── data
├── scripts
│   ├── pixellab
│   │   └── generate-image.ts     # 开发期 PixelLab 脚本
│   └── reset-dev.ts              # 重置缓存与本地 app 数据
└── tests
    ├── unit
    ├── integration
    └── e2e
```

---

## 4. 设计思路

### 4.1 世界逻辑与渲染分离

世界逻辑放在 `src/shared/game.ts`：

- 世界生成
- Agent 行为推进
- Authority 校验
- 存档迁移
- Token 统计

渲染层放在 `PixiWorld.tsx`：

- 标准渲染路径：Pixi / 纹理 / sprite
- 兜底路径：DOM sprite fallback

这样后续要替换 3D renderer，不需要重写世界逻辑。

### 4.2 Admin Agent + 确定性系统

当前不是每帧调用 LLM，而是：

- 低层行为由确定性系统推进
  - 移动
  - 采集
  - 交付
  - 建造
- 高层目标 / 玩家对话由 LLM 或 fallback 逻辑处理

这样可以避免：

- token 爆炸
- 运行不稳定
- 一点小事就请求模型

### 4.3 玩家交互模型

当前玩家不是“控制 NPC”，而是：

- 作为观察者进入世界
- 自己可移动
- 靠近 Admin Agent 后发起对话

这比“面板里直接发命令”更接近游戏体验。

### 4.4 受限脚本演化

当前并没有允许 Agent 任意热改源码，而是：

- Agent / Building / Resource 都挂 `scriptId`
- `scriptProfiles` + `scriptEvents` 记录脚本状态
- Admin Agent 可以在 Authority 审核后调优受限参数

这是为了实现“可自进化”但不把程序直接玩炸。

---

## 5. 当前已经用到的技术

### 前端 / 桌面

- Electron
- React 19
- TypeScript
- HeroUI
- Tailwind CSS
- Zustand

### 渲染 / 游戏

- PixiJS
- 自定义 runtime tick
- DOM fallback sprite renderer

### 数据 / 校验

- Zod
- JSON save files

### AI / Provider

- OpenAI SDK
- MiniMax OpenAI-compatible 接入
- PixelLab API

### 测试 / 工程化

- Vitest
- Playwright（Electron）
- electron-builder
- GitHub Actions

---

## 6. 当前仍然存在的问题

这部分很重要，当前版本还没有完全达到目标图（特别是 Kenney Tiny Town 示例图）的完成度。

### 视觉层

- 标准 Pixi 精灵渲染链路虽然在推进，但 **仍未完全稳定接管所有运行环境**
- 目前很多时候主要依赖 **DOM sprite fallback**
- 画面虽然比最早的蓝绿方块强很多，但离真正的 Tiny Town 完整场景仍有差距

### 角色层

- 玩家/NPC 目前只有非常轻量的 bob 动效
- 还没有真正的 walk 帧动画 / 朝向动画
- 点击移动目前是逐 tile 前进，不是真正寻路

### UI / HUD 层

- 已经往“游戏浮层”方向走，但整体仍然偏“桌面应用 HUD”
- 信息密度、文案命名、平台差异（Mac / Windows title bar）还需要继续打磨

### 交互层

- 对话已经改成靠近 Admin 才能触发
- 但气泡式交互、真正对话范围提示、玩家/管理员站位表现仍可继续增强

---

## 7. 目前最合理的下一步

如果继续做，我建议按这个顺序：

1. **彻底稳定 Pixi 正式渲染链路**
   - 不再依赖 fallback 作为主要路径

2. **把 Tiny Town 初始小镇做成更完整的 authored scene**
   - 更像你给的参考图

3. **角色动画系统**
   - walk 帧
   - 朝向
   - 动作状态切换

4. **玩家点击寻路**
   - 不只是简单逐格
   - 要能绕路、避障

5. **HUD 继续游戏化**
   - 更少面板味
   - 更多游戏浮层感

---

## 8. 当前常用命令

开发：

```bash
npm run dev
```

重置缓存并启动：

```bash
npm run dev:reset
```

只清理缓存：

```bash
npm run reset:cache
```

构建：

```bash
npm run build
```

打包：

```bash
npm run dist
```

测试：

```bash
npm run test
xvfb-run -a npm run test:e2e
```

---

## 9. 总结

当前版本已经不是空壳，已经具备：

- 桌面端运行
- 多存档
- Admin 自治世界循环
- 玩家进入世界移动观察
- 靠近对话
- Kenney + PixelLab 资产管线
- 打包与测试体系

但如果拿你给的 Tiny Town 参考图当标准，当前版本还处于：

> **“系统骨架基本成型，视觉与游戏化表现还在持续打磨中”**

这个文档就是目前阶段的真实状态记录。

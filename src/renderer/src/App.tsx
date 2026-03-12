import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
  Textarea
} from '@heroui/react'
import type {
  AgentSpecies,
  AppSettings,
  DecisionEngine,
  FocusGoal,
  PlayerControlMode,
  RenderMode,
  SaveDraft,
  SaveMeta,
  WorldSave
} from '@shared/contracts'
import {
  addTokenUsage,
  appendChat,
  applyFocus,
  createEstimatedUsage,
  evaluateAuthority,
  findPath,
  getWorldSummary,
  isWalkableTile,
  parseFocusFromMessage,
  summarizeTokenUsage
} from '@shared/game'
import { WorldRenderer } from './game/WorldRenderer'
import { GameRuntime } from './game/runtime'
import { useAppStore } from './state/useAppStore'

const speciesLabels: Record<AgentSpecies, string> = {
  lobster: '龙虾',
  cat: '猫',
  dog: '狗',
  sheep: '羊'
}

const focusLabels: Record<FocusGoal, string> = {
  balanced: '平衡发展',
  expand: '优先扩张',
  wood: '优先木材',
  stone: '优先石材',
  tidy: '优先整备'
}

function tileDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function samePosition(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02
}

function normalizeVector(vector: { x: number; y: number }) {
  const length = Math.hypot(vector.x, vector.y)
  if (length < 0.0001) return { x: 0, y: 0 }
  return { x: vector.x / length, y: vector.y / length }
}

function facingFromVector(vector: { x: number; y: number }): 'north' | 'south' | 'east' | 'west' {
  if (Math.abs(vector.x) >= Math.abs(vector.y)) {
    if (vector.x < 0) return 'west'
    if (vector.x > 0) return 'east'
  }
  if (vector.y < 0) return 'north'
  return 'south'
}

export function App() {
  const { phase, bootstrap, saves, currentSave, compactMode, setBootstrap, setPhase, setSaves, setCurrentSave, setCompactMode } =
    useAppStore()

  useEffect(() => {
    void window.clawcraft.getBootstrap().then(setBootstrap)
  }, [setBootstrap])

  async function refreshSaves() {
    const nextSaves = await window.clawcraft.listSaves()
    setSaves(nextSaves)
  }

  async function toggleCompactMode() {
    const mode = await window.clawcraft.toggleWindowMode(compactMode ? 'standard' : 'compact')
    setCompactMode(mode === 'compact')
  }

  if (phase === 'loading' || !bootstrap) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="panel rounded-3xl px-8 py-10">
          <Spinner label="正在唤醒 Clawcraft 世界..." color="primary" />
        </div>
      </div>
    )
  }

  return (
    <div className={`flex h-screen flex-col ${compactMode && phase === 'world' ? 'bg-transparent' : 'bg-slate-950'}`}>
      {phase !== 'world' || !compactMode ? (
        <WindowTitleBar
          compactMode={compactMode}
          showCompactToggle={phase === 'world' || compactMode}
          onToggleCompact={() => void toggleCompactMode()}
        />
      ) : null}
      {phase === 'onboarding' ? (
        <OnboardingScreen
          initialSettings={bootstrap.settings}
          onSaved={async (settings) => {
            const saved = await window.clawcraft.saveSettings(settings)
            setBootstrap({
              ...bootstrap,
              settings: saved
            })
            setPhase('saves')
          }}
        />
      ) : null}

      {phase === 'saves' ? (
        <SaveLobby
          saves={saves}
          onCreate={async (draft) => {
            const save = await window.clawcraft.createSave(draft)
            setCurrentSave(save)
            await refreshSaves()
            setPhase('world')
          }}
          onOpen={async (id) => {
            const save = await window.clawcraft.loadSave(id)
            setCurrentSave(save)
            setPhase('world')
          }}
          onDelete={async (id) => {
            await window.clawcraft.deleteSave(id)
            await refreshSaves()
          }}
        />
      ) : null}

      {phase === 'world' && currentSave ? (
        <WorldWorkspace
          initialSave={currentSave}
          compactMode={compactMode}
          onBack={async () => {
            await refreshSaves()
            setPhase('saves')
          }}
          onCompactChange={async (nextCompactMode) => {
            const mode = await window.clawcraft.toggleWindowMode(nextCompactMode ? 'compact' : 'standard')
            setCompactMode(mode === 'compact')
          }}
        />
      ) : null}
    </div>
  )
}

function WindowTitleBar({
  compactMode,
  showCompactToggle,
  onToggleCompact
}: {
  compactMode: boolean
  showCompactToggle: boolean
  onToggleCompact: () => void
}) {
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)
  return (
    <div className="drag-region flex h-10 items-center justify-between border-b border-white/10 px-4 text-sm text-slate-200">
      <div className={`flex items-center gap-2 ${isMac ? 'pl-[72px]' : ''}`}>
        <span className="text-sm font-bold tracking-widest text-cyan-300">CLAWCRAFT</span>
      </div>
      <div className="no-drag flex items-center gap-2">
        {compactMode ? (
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 text-[11px] font-bold text-cyan-300 transition hover:bg-cyan-500/20"
            onClick={onToggleCompact}
            aria-label="退出桌宠模式"
          >
            ⬜ 退出桌宠模式
          </button>
        ) : showCompactToggle ? (
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-[11px] text-slate-300 transition hover:bg-white/10"
            onClick={onToggleCompact}
            aria-label="进入桌宠模式"
          >
            ◲ 桌宠模式
          </button>
        ) : null}
        {!isMac ? (
          <>
            <Button size="sm" variant="flat" onPress={() => void window.clawcraft.minimizeWindow()}>─</Button>
            <Button size="sm" variant="flat" onPress={() => void window.clawcraft.toggleWindowMaximize()}>□</Button>
            <Button size="sm" color="danger" variant="flat" onPress={() => void window.clawcraft.closeWindow()}>✕</Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function OnboardingScreen({
  initialSettings,
  onSaved
}: {
  initialSettings: AppSettings
  onSaved: (settings: AppSettings) => Promise<void>
}) {
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const providerReady = settings.apiKey.trim().length > 0 && settings.minimaxApiKey.trim().length > 0

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-auto bg-slate-950 p-6">
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: 'url(assets/kenney/tiny-town-preview.png)', filter: 'blur(4px)' }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent" />
      
      <div className="relative z-10 w-full max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-widest text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">CLAWCRAFT</h1>
          <p className="mt-2 text-sm tracking-widest text-cyan-300 drop-shadow-md">WORLD INITIALIZATION</p>
        </div>
        <Card className="panel w-full rounded-[2rem] border-white/20 bg-slate-900/80 backdrop-blur-xl">
          <CardHeader className="flex flex-col items-start gap-2 p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">World bootstrap</p>
            <h1 className="text-3xl font-semibold text-white">配置管理员世界脑</h1>
            <p className="max-w-2xl text-sm text-slate-300">
              进入游戏前，需要先配置 OpenRouter API Key。Authority 将固定调用
              <span className="mx-1 text-cyan-300">openai/gpt-5.4</span>
              作为控制模型；Agent 行为将走 MiniMax LLM。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip color="primary" variant="flat">
                填写两个 Key 后进入世界
              </Chip>
            </div>
          </CardHeader>
        <CardBody className="grid gap-6 p-8 pt-0 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4">
            <div className="grid gap-4">
              <p className="text-sm text-slate-300">只需要填写两个 Key：OpenRouter（Authority）和 MiniMax（Agent 行为）。</p>
              <FieldInput
                label="OpenRouter API Key（必填）"
                placeholder="sk-or-..."
                type="password"
                value={settings.apiKey}
                onChange={(apiKey) => {
                  setError('')
                  setSettings((current) => ({ ...current, apiKey }))
                }}
              />
              <FieldInput
                label="MiniMax API Key（必填）"
                placeholder="minimax-..."
                type="password"
                value={settings.minimaxApiKey}
                onChange={(minimaxApiKey) => {
                  setError('')
                  setSettings((current) => ({ ...current, minimaxApiKey }))
                }}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Metric label="Authority 模型（固定）" value="openai/gpt-5.4" />
                <Metric label="Agent 行为模型（固定）" value="MiniMax-M2.5" />
                <Metric label="OpenRouter URL（固定）" value="https://openrouter.ai/api/v1" />
                <Metric label="MiniMax URL（固定）" value="https://api.minimax.io/v1" />
              </div>
              <FieldInput
                label="PixelLab API Key（可选）"
                type="password"
                value={settings.pixelLabApiKey}
                onChange={(pixelLabApiKey) => setSettings((current) => ({ ...current, pixelLabApiKey }))}
              />
              {error ? <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger-300">{error}</div> : null}
              {!providerReady ? (
                <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger-300">
                  还不能继续：请先填写 OpenRouter API Key 与 MiniMax API Key。
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button
                  className="w-full max-w-xs"
                  color="primary"
                  isDisabled={!providerReady}
                  isLoading={saving}
                  onPress={async () => {
                    if (!providerReady) {
                      setError('OpenRouter API Key 与 MiniMax API Key 都是必填项。')
                      return
                    }
                    setSaving(true)
                    try {
                      await onSaved(settings)
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  保存并进入存档大厅
                </Button>
              </div>
            </div>
          </div>

          <div className="panel rounded-3xl p-5">
            <h2 className="text-lg font-semibold text-white">稳定性策略</h2>
            <img
              src="assets/kenney/tiny-town-preview.png"
              alt="Kenney Tiny Town 预览"
              className="mt-4 h-32 w-full rounded-2xl border border-white/10 object-cover"
            />
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>• 默认 2D 俯视角，桌宠模式也能看清 Agent 动作。</li>
              <li>• 世界创建时可切换 2D / 3D，当前默认优先 3D 体素世界。</li>
              <li>• Admin Agent 默认目标：建设城镇、发展更多小 Agent。</li>
              <li>• Authority 固定调用 OpenRouter openai/gpt-5.4 进行管控。</li>
              <li>• 行为决策默认由 MiniMax LLM 执行，不使用经典搜索算法。</li>
              <li>• Token Dashboard 会跟踪聊天和总结类调用消耗。</li>
              <li>• 已接入 Kenney Tiny Town 素材作为基础 2D 资源参考。</li>
            </ul>
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
              这一步只要填好两个必填 Key（OpenRouter + MiniMax）即可进入存档大厅。
            </div>
          </div>
        </CardBody>
      </Card>
      </div>
    </div>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        className="field-input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SaveLobby({
  saves,
  onCreate,
  onOpen,
  onDelete
}: {
  saves: SaveMeta[]
  onCreate: (draft: SaveDraft) => Promise<void>
  onOpen: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<SaveDraft>({
    name: 'New Clawcraft World',
    species: 'lobster',
    renderMode: '3d',
    decisionEngine: 'minimax-llm'
  })
  const [creating, setCreating] = useState(false)
  const [mode, setMode] = useState<'menu' | 'new' | 'load'>('menu')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-slate-950">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-30"
        style={{ backgroundImage: 'url(assets/kenney/tiny-town-preview.png)', filter: 'blur(4px)' }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent" />

      <div className="relative z-10 w-full max-w-4xl p-6">
        <div className="mb-12 text-center">
          <h1 className="text-6xl font-black tracking-widest text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">CLAWCRAFT</h1>
          <p className="mt-4 text-xl tracking-widest text-cyan-300 drop-shadow-md">AUTONOMOUS WORLD</p>
        </div>

        {mode === 'menu' && (
          <div className="flex flex-col items-center gap-4">
            <Button size="lg" color="primary" variant="solid" className="w-64 text-lg font-bold shadow-lg" onPress={() => setMode('new')}>
              新世界 (New Game)
            </Button>
            <Button size="lg" color="default" variant="solid" className="w-64 bg-white/10 text-lg font-bold text-white shadow-lg hover:bg-white/20" onPress={() => setMode('load')}>
              载入世界 (Load Game)
            </Button>
            <div className="mt-8">
              <GlobalDashboard saves={saves} compact />
            </div>
          </div>
        )}

        {mode === 'new' && (
          <Card className="panel mx-auto w-full max-w-2xl rounded-[2rem] border-white/20 bg-slate-900/80 backdrop-blur-xl">
            <CardHeader className="flex items-center justify-between p-6 pb-2">
              <h2 className="text-2xl font-bold text-white">创建新世界</h2>
              <Button isIconOnly variant="flat" onPress={() => setMode('menu')}>✕</Button>
            </CardHeader>
            <CardBody className="gap-6 p-6">
              <FieldInput label="世界名称" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
              
              <div className="grid gap-3">
                <p className="text-sm font-medium text-slate-300">选择世界管理员物种</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(Object.keys(speciesLabels) as AgentSpecies[]).map((species) => (
                    <button
                      key={species}
                      type="button"
                      className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition ${
                        draft.species === species 
                          ? 'border-cyan-400 bg-cyan-400/20 text-white' 
                          : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/30 hover:text-white'
                      }`}
                      onClick={() => setDraft((current) => ({ ...current, species }))}
                    >
                      <div className="text-2xl">
                        {species === 'lobster' ? '🦞' : species === 'cat' ? '🐱' : species === 'dog' ? '🐶' : '🐑'}
                      </div>
                      <div className="font-bold">{speciesLabels[species]}</div>
                    </button>
                  ))}
                </div>
                <p className="text-center text-sm text-slate-400">
                  {draft.species === 'lobster' && '坚韧、适合高压管理。'}
                  {draft.species === 'cat' && '灵巧、偏扩张与探索。'}
                  {draft.species === 'dog' && '稳定、偏执行与巡逻。'}
                  {draft.species === 'sheep' && '温顺、偏资源与耕作。'}
                </p>
              </div>

              <div className="grid gap-3">
                <p className="text-sm font-medium text-slate-300">世界渲染模式（必填）</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['3d', '3D 体素世界', '优先体验，含体素建筑与角色动画'],
                    ['2d', '2D 俯视世界', '兼容模式，保留像素风表现']
                  ] as const).map(([id, label, desc]) => (
                    <button
                      key={id}
                      type="button"
                      className={`rounded-2xl border p-4 text-left transition ${
                        draft.renderMode === id ? 'border-cyan-400 bg-cyan-400/20 text-white' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/30 hover:text-white'
                      }`}
                      onClick={() => setDraft((current) => ({ ...current, renderMode: id as RenderMode }))}
                    >
                      <div className="font-semibold">{label}</div>
                      <div className="mt-1 text-xs">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <p className="text-sm font-medium text-slate-300">行为决策引擎（必填）</p>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['minimax-llm', 'MiniMax LLM（推荐）', 'Agent 行为由 MiniMax 大模型规划'],
                    ['general-llm', '通用 LLM（实验）', '预留扩展通用 LLM 行为规划']
                  ] as const).map(([id, label, desc]) => (
                    <button
                      key={id}
                      type="button"
                      className={`rounded-2xl border p-4 text-left transition ${
                        draft.decisionEngine === id ? 'border-cyan-400 bg-cyan-400/20 text-white' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/30 hover:text-white'
                      }`}
                      onClick={() => setDraft((current) => ({ ...current, decisionEngine: id as DecisionEngine }))}
                    >
                      <div className="font-semibold">{label}</div>
                      <div className="mt-1 text-xs">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <Button
                  size="lg"
                  color="primary"
                  className="w-full max-w-sm text-lg font-bold shadow-cyan-500/50"
                  isLoading={creating}
                  onPress={async () => {
                    setCreating(true)
                    try {
                      await onCreate(draft)
                    } finally {
                      setCreating(false)
                    }
                  }}
                >
                  降临世界 (Start)
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {mode === 'load' && (
          <Card className="panel mx-auto w-full max-w-4xl rounded-[2rem] border-white/20 bg-slate-900/80 backdrop-blur-xl">
            <CardHeader className="flex items-center justify-between p-6 pb-2">
              <h2 className="text-2xl font-bold text-white">载入世界</h2>
              <Button isIconOnly variant="flat" onPress={() => setMode('menu')}>✕</Button>
            </CardHeader>
            <CardBody className="gap-4 p-6">
              {saves.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  没有找到存档，请先创建一个新世界。
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {saves.map((save) => (
                    <div key={save.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-400/50 hover:bg-white/10">
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white group-hover:text-cyan-300">{save.name}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="text-xs text-slate-400">管理员: {speciesLabels[save.species]}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                save.renderMode === '3d'
                                  ? 'bg-cyan-400/15 text-cyan-300'
                                  : 'bg-violet-400/15 text-violet-300'
                              }`}
                            >
                              {save.renderMode.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div>Token: {save.tokenTotal.toLocaleString()}</div>
                          <div>Agent: {save.agentCount}</div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Button color="primary" className="flex-1 font-bold" onPress={() => void onOpen(save.id)}>
                          唤醒此世界
                        </Button>
                        <Button
                          color="danger"
                          variant="flat"
                          className="font-bold"
                          isLoading={deletingId === save.id}
                          onPress={async () => {
                            const confirmed = window.confirm(`确定要删除世界「${save.name}」吗？此操作不可撤销。`)
                            if (!confirmed) return
                            setDeletingId(save.id)
                            try {
                              await onDelete(save.id)
                            } finally {
                              setDeletingId(null)
                            }
                          }}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}

function GlobalDashboard({ saves, compact = false }: { saves: SaveMeta[], compact?: boolean }) {
  const sortedSaves = saves.slice().sort((a, b) => b.tokenTotal - a.tokenTotal)
  const totalTokens = saves.reduce((sum, save) => sum + save.tokenTotal, 0)
  const totalLastHour = saves.reduce((sum, save) => sum + save.lastHourTokens, 0)

  if (compact) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-xs text-slate-400 backdrop-blur-md">
        <div>Total API Tokens Used: {totalTokens.toLocaleString()}</div>
      </div>
    )
  }

  return (
    <Card className="panel rounded-3xl">
      <CardBody className="gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">用户侧 Token Dashboard</h3>
            <p className="mt-1 text-sm text-slate-300">按世界汇总所有存档的 token 消耗，方便你总览每个世界的成本。</p>
          </div>
          <Chip color="primary" variant="flat">
            {saves.length} Worlds
          </Chip>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="所有世界总 Token" value={totalTokens.toLocaleString()} />
          <Metric label="过去 1 小时 Token" value={totalLastHour.toLocaleString()} />
          <Metric label="最高成本世界" value={sortedSaves[0]?.name ?? '暂无'} />
        </div>
        <div className="space-y-3">
          {saves.length === 0 ? <div className="text-sm text-slate-400">创建世界后，这里会显示按世界聚合的 token 统计。</div> : null}
          {sortedSaves.map((save) => (
              <div key={save.id} className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{save.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        save.renderMode === '3d'
                          ? 'bg-cyan-400/15 text-cyan-300'
                          : 'bg-violet-400/15 text-violet-300'
                      }`}
                    >
                      {save.renderMode.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-slate-300">{save.tokenTotal.toLocaleString()} tokens</span>
                </div>
                <div className="mt-2 token-bar">
                  <span style={{ width: `${totalTokens === 0 ? 0 : (save.tokenTotal / totalTokens) * 100}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>焦点：{focusLabels[save.focus]}</span>
                  <span>近 1 小时：{save.lastHourTokens.toLocaleString()}</span>
                  <span>Agent：{save.agentCount}</span>
                </div>
              </div>
            ))}
        </div>
      </CardBody>
    </Card>
  )
}

function WorldWorkspace({
  initialSave,
  compactMode,
  onBack,
  onCompactChange
}: {
  initialSave: WorldSave
  compactMode: boolean
  onBack: () => Promise<void>
  onCompactChange: (nextCompactMode: boolean) => Promise<void>
}) {
  const runtimeRef = useRef<GameRuntime | null>(null)
  const [save, setSave] = useState(initialSave)
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [playerTarget, setPlayerTarget] = useState<{ x: number; y: number } | null>(null)
  const [playerPath, setPlayerPath] = useState<Array<{ x: number; y: number }>>([])
  const [conversationOpen, setConversationOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<'overview' | 'chronicle' | 'dialogue' | 'token' | 'assets'>('overview')
  const [worldHint, setWorldHint] = useState('')
  const [assetPrompt, setAssetPrompt] = useState('top-down pixel tiny town storage hut with blue roof')
  const [assetLoading, setAssetLoading] = useState(false)
  const [assetError, setAssetError] = useState('')
  const [assetPreview, setAssetPreview] = useState<string>('')
  const [assetSavedPath, setAssetSavedPath] = useState('')
  const [pixelLabBalance, setPixelLabBalance] = useState<{ credits?: { usd: number }; subscription?: { generations: number; total: number } } | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number>(Date.now())
  const [autoSaving, setAutoSaving] = useState(false)
  const [observeAgentId, setObserveAgentId] = useState<string | null>(initialSave.world.agents.find((agent) => agent.role === 'admin')?.id ?? null)
  const [observeCameraOffset, setObserveCameraOffset] = useState({ x: 0, y: 0 })
  const latestSaveRef = useRef(initialSave)
  const observeCameraOffsetRef = useRef(observeCameraOffset)
  const hintTimerRef = useRef<number | null>(null)
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const observeKeysRef = useRef<Set<string>>(new Set())
  const playerPathRef = useRef<Array<{ x: number; y: number }>>([])
  const motionClockRef = useRef<number>(performance.now())

  useEffect(() => {
    const runtime = new GameRuntime(initialSave)
    runtimeRef.current = runtime
    const unsubscribe = runtime.subscribe(setSave)
    runtime.start()
    return () => {
      unsubscribe()
      runtime.stop()
    }
  }, [initialSave])

  useEffect(() => {
    latestSaveRef.current = save
  }, [save])

  useEffect(() => {
    playerPathRef.current = playerPath
  }, [playerPath])

  useEffect(() => {
    observeCameraOffsetRef.current = observeCameraOffset
  }, [observeCameraOffset])

  useEffect(() => {
    if (!observeAgentId) return
    if (save.world.agents.some((agent) => agent.id === observeAgentId)) return
    setObserveAgentId(save.world.agents.find((agent) => agent.role === 'admin')?.id ?? save.world.agents[0]?.id ?? null)
  }, [observeAgentId, save.world.agents])

  const admin = save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0]
  const isObserving = compactMode || save.settings.playerControlMode === 'observe'
  const canTalkToAdmin = tileDistance(save.world.player.position, admin.position) <= 2

  function pushWorldHint(message: string) {
    setWorldHint(message)
    if (hintTimerRef.current) {
      window.clearTimeout(hintTimerRef.current)
    }
    hintTimerRef.current = window.setTimeout(() => {
      setWorldHint('')
    }, 1800)
  }

  function applyPlayerStep(target: { x: number; y: number }) {
    setSave((current) => {
      const dx = target.x - current.world.player.position.x
      const dy = target.y - current.world.player.position.y
      const next = structuredClone(current)
      next.world.player.position = { x: target.x, y: target.y }
      next.world.player.animState = dx === 0 && dy === 0 ? 'idle' : 'walk'
      next.world.player.facing =
        Math.abs(dx) >= Math.abs(dy)
          ? dx < 0
            ? 'west'
            : dx > 0
              ? 'east'
              : dy < 0
                ? 'north'
                : 'south'
          : dy < 0
            ? 'north'
            : 'south'
      runtimeRef.current?.replaceSave(next)
      return next
    })
  }

  function canMovePlayerTo(snapshot: WorldSave, position: { x: number; y: number }) {
    const probes = [
      position,
      { x: position.x + 0.08, y: position.y },
      { x: position.x - 0.08, y: position.y },
      { x: position.x, y: position.y + 0.08 },
      { x: position.x, y: position.y - 0.08 }
    ]
    return probes.every((probe) =>
      isWalkableTile(
        snapshot.world,
        {
          x: Math.round(probe.x),
          y: Math.round(probe.y)
        },
        {
          allowDoorway: true,
          ignorePoint: snapshot.world.player.position
        }
      )
    )
  }

  function tryMovePlayerStep(target: { x: number; y: number }) {
    const snapshot = latestSaveRef.current
    if (!isWalkableTile(snapshot.world, target, { allowDoorway: true, ignorePoint: snapshot.world.player.position })) {
      pushWorldHint('目标不可达')
      return false
    }
    setPlayerPath([])
    setPlayerTarget(null)
    applyPlayerStep(target)
    return true
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return

      const isThreeWorld = latestSaveRef.current.settings.renderMode === '3d'
      const key = event.key.toLowerCase()
      const isMovementKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
      if (isObserving && isThreeWorld && isMovementKey) {
        event.preventDefault()
        observeKeysRef.current.add(key)
        return
      }
      if (isObserving) return

      const direction =
        event.key === 'ArrowUp' || key === 'w'
          ? isThreeWorld
            ? { x: -1, y: -1 }
            : { x: 0, y: -1 }
          : event.key === 'ArrowDown' || key === 's'
            ? isThreeWorld
              ? { x: 1, y: 1 }
              : { x: 0, y: 1 }
            : event.key === 'ArrowLeft' || key === 'a'
              ? isThreeWorld
                ? { x: -1, y: 1 }
                : { x: -1, y: 0 }
              : event.key === 'ArrowRight' || key === 'd'
                ? isThreeWorld
                  ? { x: 1, y: -1 }
                  : { x: 1, y: 0 }
                : null

      if (!direction && key === 'e' && canTalkToAdmin) {
        event.preventDefault()
        setConversationOpen((current) => !current)
        return
      }

      if (!direction && key === 'e' && !canTalkToAdmin) {
        pushWorldHint('靠近 Admin 才能交谈')
        return
      }

      if (!direction) return
      event.preventDefault()

      if (isThreeWorld) {
        pressedKeysRef.current.add(key)
        setPlayerTarget(null)
        setPlayerPath([])
        return
      }

      const current = latestSaveRef.current.world.player.position
      void tryMovePlayerStep({
        x: Math.max(0, Math.min(latestSaveRef.current.world.width - 1, current.x + direction.x)),
        y: Math.max(0, Math.min(latestSaveRef.current.world.height - 1, current.y + direction.y))
      })
    }

    function onKeyUp(event: KeyboardEvent) {
      pressedKeysRef.current.delete(event.key.toLowerCase())
      observeKeysRef.current.delete(event.key.toLowerCase())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [canTalkToAdmin, isObserving])

  useEffect(() => {
    if (latestSaveRef.current.settings.renderMode === '3d') return
    if (playerPath.length === 0 || isObserving) return
    const timer = window.setInterval(() => {
      setPlayerPath((currentPath) => {
        const [nextStep, ...rest] = currentPath
        if (!nextStep) {
          setPlayerTarget(null)
          return currentPath
        }
        applyPlayerStep(nextStep)
        if (rest.length === 0) {
          setPlayerTarget(null)
        }
        return rest
      })
    }, 110)

    return () => window.clearInterval(timer)
  }, [playerPath, isObserving])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSave((current) => {
        const next = structuredClone(current)
        let changed = false
        const now = performance.now()
        const dt = Math.min(0.05, (now - motionClockRef.current) / 1000)
        motionClockRef.current = now
        const isThreeWorld = next.settings.renderMode === '3d'

        const nudge = (from: number, to: number) => {
          const delta = to - from
          if (Math.abs(delta) < 0.02) return to
          return from + delta * 0.28
        }

        const glideToward = (from: { x: number; y: number }, to: { x: number; y: number }, speed: number) => {
          const dx = to.x - from.x
          const dy = to.y - from.y
          const distance = Math.hypot(dx, dy)
          if (distance < 0.001) return to
          const step = speed * dt
          if (distance <= step) return to
          return {
            x: from.x + (dx / distance) * step,
            y: from.y + (dy / distance) * step
          }
        }

        const activeVector = (() => {
          if (!isThreeWorld || isObserving) return { x: 0, y: 0 }
          let x = 0
          let y = 0
          if (pressedKeysRef.current.has('w') || pressedKeysRef.current.has('arrowup')) {
            x -= 1
            y -= 1
          }
          if (pressedKeysRef.current.has('s') || pressedKeysRef.current.has('arrowdown')) {
            x += 1
            y += 1
          }
          if (pressedKeysRef.current.has('a') || pressedKeysRef.current.has('arrowleft')) {
            x -= 1
            y += 1
          }
          if (pressedKeysRef.current.has('d') || pressedKeysRef.current.has('arrowright')) {
            x += 1
            y -= 1
          }
          return normalizeVector({ x, y })
        })()
        const observeVector = (() => {
          if (!isThreeWorld || !isObserving) return { x: 0, y: 0 }
          let x = 0
          let y = 0
          if (observeKeysRef.current.has('w') || observeKeysRef.current.has('arrowup')) {
            x -= 1
            y -= 1
          }
          if (observeKeysRef.current.has('s') || observeKeysRef.current.has('arrowdown')) {
            x += 1
            y += 1
          }
          if (observeKeysRef.current.has('a') || observeKeysRef.current.has('arrowleft')) {
            x -= 1
            y += 1
          }
          if (observeKeysRef.current.has('d') || observeKeysRef.current.has('arrowright')) {
            x += 1
            y -= 1
          }
          return normalizeVector({ x, y })
        })()

        const slidePlayer = (vector: { x: number; y: number }, speed: number) => {
          if (Math.abs(vector.x) < 0.001 && Math.abs(vector.y) < 0.001) return false
          const candidate = {
            x: Math.max(0, Math.min(next.world.width - 1, next.world.player.renderPosition.x + vector.x * speed * dt)),
            y: Math.max(0, Math.min(next.world.height - 1, next.world.player.renderPosition.y + vector.y * speed * dt))
          }
          const tryPositions = [
            candidate,
            { x: candidate.x, y: next.world.player.renderPosition.y },
            { x: next.world.player.renderPosition.x, y: candidate.y }
          ]
          const accepted = tryPositions.find((item) => canMovePlayerTo(next, item))
          if (!accepted) return false
          next.world.player.renderPosition = accepted
          next.world.player.position = {
            x: Math.round(accepted.x),
            y: Math.round(accepted.y)
          }
          next.world.player.facing = facingFromVector(vector)
          next.world.player.animState = 'walk'
          return true
        }

        if (isThreeWorld && !isObserving) {
          if (Math.abs(activeVector.x) > 0.001 || Math.abs(activeVector.y) > 0.001) {
            setPlayerTarget(null)
            if (playerPathRef.current.length > 0) {
              playerPathRef.current = []
              setPlayerPath([])
            }
            if (slidePlayer(activeVector, 28)) {
              changed = true
            }
          } else if (playerPathRef.current.length > 0) {
            const nextWaypoint = playerPathRef.current[0]!
            const toWaypoint = {
              x: nextWaypoint.x - next.world.player.renderPosition.x,
              y: nextWaypoint.y - next.world.player.renderPosition.y
            }
            const distance = Math.hypot(toWaypoint.x, toWaypoint.y)
            if (distance < 0.12) {
              next.world.player.renderPosition = { x: nextWaypoint.x, y: nextWaypoint.y }
              next.world.player.position = { x: nextWaypoint.x, y: nextWaypoint.y }
              playerPathRef.current = playerPathRef.current.slice(1)
              setPlayerPath(playerPathRef.current)
              if (playerPathRef.current.length === 0) {
                setPlayerTarget(null)
              }
              changed = true
            } else if (slidePlayer(normalizeVector(toWaypoint), 22)) {
              changed = true
            }
          }
        }

        if (!isThreeWorld) {
          next.world.player.renderPosition.x = nudge(next.world.player.renderPosition.x, next.world.player.position.x)
          next.world.player.renderPosition.y = nudge(next.world.player.renderPosition.y, next.world.player.position.y)

          if (
            next.world.player.renderPosition.x !== current.world.player.renderPosition.x ||
            next.world.player.renderPosition.y !== current.world.player.renderPosition.y
          ) {
            changed = true
          }
        }

        if (isThreeWorld && isObserving && (Math.abs(observeVector.x) > 0.001 || Math.abs(observeVector.y) > 0.001)) {
          const currentOffset = observeCameraOffsetRef.current
          const nextOffset = {
            x: currentOffset.x + observeVector.x * 16 * dt,
            y: currentOffset.y + observeVector.y * 16 * dt
          }
          setObserveCameraOffset({
            x: Math.max(-18, Math.min(18, nextOffset.x)),
            y: Math.max(-18, Math.min(18, nextOffset.y))
          })
        }

        next.world.agents.forEach((agent, index) => {
          if (isThreeWorld) {
            const nextRender = glideToward(agent.renderPosition, agent.position, 9.5)
            agent.renderPosition.x = nextRender.x
            agent.renderPosition.y = nextRender.y
          } else {
            agent.renderPosition.x = nudge(agent.renderPosition.x, agent.position.x)
            agent.renderPosition.y = nudge(agent.renderPosition.y, agent.position.y)
          }
          if (
            agent.renderPosition.x !== current.world.agents[index]?.renderPosition.x ||
            agent.renderPosition.y !== current.world.agents[index]?.renderPosition.y
          ) {
            changed = true
          }
        })

        if (
          isThreeWorld &&
          Math.abs(activeVector.x) < 0.001 &&
          Math.abs(activeVector.y) < 0.001 &&
          playerPathRef.current.length === 0 &&
          next.world.player.animState === 'walk'
        ) {
          next.world.player.animState = 'idle'
          if (current.world.player.animState !== 'idle') {
            changed = true
          }
        }

        if (changed) {
          if (
            samePosition(next.world.player.renderPosition, next.world.player.position) &&
            next.world.player.animState === 'walk' &&
            playerPath.length === 0
          ) {
            next.world.player.animState = 'idle'
          }
          next.world.agents.forEach((agent, index) => {
            if (samePosition(agent.renderPosition, agent.position) && agent.animState === 'walk') {
              agent.animState = 'idle'
            }
            if (current.world.agents[index] && current.world.agents[index]!.animState !== agent.animState) {
              changed = true
            }
          })
          runtimeRef.current?.replaceSave(next)
          return next
        }

        return current
      })
    }, 16)

    return () => window.clearInterval(timer)
  }, [isObserving, playerPath.length])

  useEffect(() => {
    if (!canTalkToAdmin && conversationOpen) {
      setConversationOpen(false)
    }
  }, [canTalkToAdmin, conversationOpen])

  useEffect(() => {
    if (!compactMode) return
    if (save.settings.playerControlMode === 'observe') return
    const next = structuredClone(save)
    next.settings.playerControlMode = 'observe'
    setPlayerPath([])
    setPlayerTarget(null)
    setSave(next)
    runtimeRef.current?.replaceSave(next)
  }, [compactMode, save])

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current)
      }
    }
  }, [])

  async function persist(nextSave: WorldSave) {
    setAutoSaving(true)
    setSave(nextSave)
    runtimeRef.current?.replaceSave(nextSave)
    await window.clawcraft.writeSave(nextSave)
    setLastSavedAt(Date.now())
    setAutoSaving(false)
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void persist(structuredClone(latestSaveRef.current))
    }, 12_000)
    return () => window.clearInterval(timer)
  }, [])

  async function sendChat() {
    if (!canTalkToAdmin) {
      setAssetError('')
      return
    }
    if (!chatInput.trim()) return
    setSending(true)

    try {
      const requestedFocus = parseFocusFromMessage(chatInput, save.world.focus)
      const withPlayerMessage = appendChat(save, 'player', chatInput)
      const authority = evaluateAuthority(chatInput, withPlayerMessage)

      if (!authority.accepted) {
        const rejected = appendChat(withPlayerMessage, 'admin', authority.reason ?? 'Authority 拒绝了这条命令。')
        await persist(rejected)
        setChatInput('')
        return
      }

      const focused = applyFocus(withPlayerMessage, requestedFocus)
      const response = await window.clawcraft.chatWithAdmin({
        worldId: focused.meta.id,
        agentId: admin.id,
        playerMessage: chatInput,
        worldSummary: getWorldSummary(focused),
        currentFocus: requestedFocus
      })

      let nextSave = appendChat(focused, 'admin', response.reply)
      if (response.usage) {
        nextSave = addTokenUsage(nextSave, response.usage)
      } else {
        nextSave = addTokenUsage(
          nextSave,
          createEstimatedUsage('local-estimated', focused.meta.id, admin.id, 'fallback', 'heuristic-local', chatInput, response.reply)
        )
      }
      await persist(nextSave)
      setChatInput('')
    } finally {
      setSending(false)
    }
  }

  function movePlayerTo(position: { x: number; y: number }) {
    if (isObserving) return
    const current = latestSaveRef.current.world.player.position
    const path = findPath(latestSaveRef.current.world, current, position)
    if (!path) {
      setPlayerPath([])
      setPlayerTarget(null)
      pushWorldHint('目标不可达')
      return
    }
    setPlayerTarget(position)
    setPlayerPath(path)
  }

  async function togglePlayerControlMode(nextMode: PlayerControlMode) {
    const next = structuredClone(latestSaveRef.current)
    next.settings.playerControlMode = nextMode
    if (nextMode === 'observe') {
      setPlayerTarget(null)
      setObserveCameraOffset({ x: 0, y: 0 })
      setObserveAgentId(next.world.agents.find((agent) => agent.role === 'admin')?.id ?? next.world.agents[0]?.id ?? null)
    } else {
      setObserveCameraOffset({ x: 0, y: 0 })
    }
    await persist(next)
  }

  function lockObserveAgent(agentId: string) {
    setObserveAgentId(agentId)
    setObserveCameraOffset({ x: 0, y: 0 })
  }

  async function refreshPixelLabBalance() {
    setAssetError('')
    try {
      const balance = await window.clawcraft.getPixelLabBalance()
      setPixelLabBalance(balance)
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : String(error))
    }
  }

  async function generatePixelAsset() {
    if (!assetPrompt.trim()) return
    setAssetLoading(true)
    setAssetError('')
    try {
      const result = await window.clawcraft.generatePixelLabImage({
        prompt: assetPrompt,
        width: 32,
        height: 32,
        noBackground: true
      })

      if (!result.success) {
        setAssetError(result.error ?? 'PixelLab 生成失败。')
        return
      }

      setAssetPreview(result.imageDataUrl ?? '')
      setAssetSavedPath(result.savedPath ?? '')
      await refreshPixelLabBalance()
    } finally {
      setAssetLoading(false)
    }
  }

  async function leaveWorld() {
    await persist(structuredClone(latestSaveRef.current))
    await onBack()
  }

  if (compactMode) {
    return (
      <div className="group relative flex-1 min-h-0 w-full overflow-hidden drag-region">
        <WorldRenderer
          save={save}
          compact
          onMovePlayer={movePlayerTo}
          playerTarget={playerTarget}
          observeAgentId={observeAgentId}
          observeCameraOffset={observeCameraOffset}
        />
        <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="no-drag pointer-events-auto rounded-xl bg-slate-900/80 px-2.5 py-1.5 text-xs font-bold text-cyan-300 shadow-lg backdrop-blur-md transition hover:bg-slate-800"
            onClick={() => void onCompactChange(false)}
          >
            ⬜ 展开
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden p-3">
      <div className="relative h-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/50">
        <WorldRenderer
          save={save}
          compact={false}
          onMovePlayer={movePlayerTo}
          playerTarget={playerTarget}
          observeAgentId={observeAgentId}
          observeCameraOffset={observeCameraOffset}
        />

        <div className="pointer-events-none absolute inset-0">
          {/* ─── 顶部横向 HUD 条 ─── */}
          <div className="pointer-events-auto absolute left-3 top-3 flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/65 px-3 py-1.5 backdrop-blur-md">
            <button
              type="button"
              className="no-drag flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs text-white transition hover:bg-white/20"
              onClick={() => void leaveWorld()}
              aria-label="返回"
            >
              ←
            </button>
            <span className="max-w-[9rem] truncate text-xs font-bold text-white">{save.meta.name}</span>
            <div className="h-3 w-px shrink-0 bg-white/20" />
            <span className="shrink-0 text-[10px] text-slate-300">{save.settings.renderMode.toUpperCase()}</span>
            <span className="shrink-0 text-[10px] text-slate-300">{save.settings.decisionEngine.toUpperCase()}</span>
            <div className="h-3 w-px shrink-0 bg-white/20" />
            <span className="shrink-0 font-mono text-xs text-amber-400">🌲 {save.world.stockpile.wood}</span>
            <span className="shrink-0 font-mono text-xs text-slate-400">🪨 {save.world.stockpile.stone}</span>
            <div className="h-3 w-px shrink-0 bg-white/20" />
            <span className="shrink-0 text-xs text-slate-400">🏠 {save.world.buildings.length} · 🤖 {save.world.agents.length}</span>
            <div className="h-3 w-px shrink-0 bg-white/20" />
            <span className="shrink-0 font-mono text-xs text-slate-500">⏱ {save.world.time}</span>
            <div className="ml-auto shrink-0">
              {autoSaving
                ? <span className="text-[10px] text-amber-400">保存中…</span>
                : <span className="text-[10px] text-emerald-500">✓ {new Date(lastSavedAt).toLocaleTimeString()}</span>
              }
            </div>
          </div>

          {/* ─── 右侧游戏面板（高度自适应内容，不遮挡空白区域） ─── */}
          <div className="pointer-events-auto absolute right-3 top-3 w-[240px] flex flex-col gap-2" style={{ maxHeight: 'calc(100% - 1.5rem)' }}>
            <div className="flex gap-2 rounded-xl border border-white/10 bg-slate-950/60 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => void togglePlayerControlMode('control')}
                className={`flex-1 rounded-lg py-1 text-[10px] transition ${!isObserving ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                控制角色
              </button>
              <button
                type="button"
                onClick={() => void togglePlayerControlMode('observe')}
                className={`flex-1 rounded-lg py-1 text-[10px] transition ${isObserving ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                观察模式
              </button>
            </div>
            {isObserving ? (
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-2 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">观察目标</div>
                    <div className="mt-1 text-[11px] text-slate-300">WASD 可平移镜头，点击角色可锁定观察。</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-300 transition hover:bg-white/5"
                    onClick={() => setObserveCameraOffset({ x: 0, y: 0 })}
                  >
                    重置镜头
                  </button>
                </div>
                <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-auto">
                  {save.world.agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => lockObserveAgent(agent.id)}
                      className={`rounded-xl border px-2 py-1.5 text-left transition ${
                        observeAgentId === agent.id
                          ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-200'
                          : 'border-white/8 bg-white/3 text-slate-300 hover:border-white/15 hover:bg-white/6'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold">{agent.name}</span>
                        <span className="text-[9px] uppercase tracking-widest text-slate-500">{agent.role}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{agent.currentTask}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {/* Tab 切换 */}
            <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-950/60 p-1 backdrop-blur-md">
              {([ ['overview', '概览', '◉'], ['chronicle', '编年史', '☷'], ['dialogue', '对话', '💬'], ['token', 'Token', '◈'], ['assets', '工坊', '✦'] ] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActivePanel(id)}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-center transition ${activePanel === id ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="text-sm">{icon}</span>
                  <span className="text-[9px] font-medium leading-none">{label}</span>
                </button>
              ))}
            </div>

            {/* 面板内容区：高度随内容，最多占剩余空间 */}
            <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-950/60 backdrop-blur-md" style={{ overflow: 'hidden auto', maxHeight: 'calc(100vh - 8rem)' }}>
              <div className="p-2">
                {activePanel === 'overview' ? <CompactOverviewPanel save={save} /> : null}
                {activePanel === 'chronicle' ? <ChroniclePanel save={save} /> : null}
                {activePanel === 'dialogue' ? <CompactDialoguePanel save={save} /> : null}
                {activePanel === 'token' ? <CompactTokenPanel save={save} /> : null}
                {activePanel === 'assets' ? (
                  <AssetLabPanel
                    prompt={assetPrompt}
                    onPromptChange={setAssetPrompt}
                    onGenerate={() => void generatePixelAsset()}
                    onRefreshBalance={() => void refreshPixelLabBalance()}
                    loading={assetLoading}
                    error={assetError}
                    preview={assetPreview}
                    savedPath={assetSavedPath}
                    balance={pixelLabBalance}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {/* ─── 底部对话浮层 ─── */}
          <div className="pointer-events-none absolute bottom-3 left-3 right-[252px] flex justify-start">
            {worldHint ? (
              <div className="pointer-events-auto rounded-xl border border-amber-400/20 bg-slate-950/80 px-3 py-1.5 text-xs text-amber-200 backdrop-blur-md">
                {worldHint}
              </div>
            ) : canTalkToAdmin ? (
              conversationOpen ? (
                <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/15 bg-slate-950/90 p-3 backdrop-blur-xl">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">与 Admin 交谈</span>
                    <span className="text-[10px] text-slate-500">E 收起</span>
                  </div>
                  <Textarea
                    size="sm"
                    label=""
                    value={chatInput}
                    onValueChange={setChatInput}
                    minRows={2}
                    placeholder="给 Admin 下达指令…"
                    classNames={{ input: 'text-xs', base: 'text-xs' }}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" color="primary" isLoading={sending} onPress={() => void sendChat()}>
                      发送
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-md">
                  [E] 与 Admin 交谈
                </div>
              )
            ) : !isObserving ? (
              <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-400 backdrop-blur-md">
                靠近 Admin 才能交谈
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function AssetLabPanel({
  prompt,
  onPromptChange,
  onGenerate,
  onRefreshBalance,
  loading,
  error,
  preview,
  savedPath,
  balance
}: {
  prompt: string
  onPromptChange: (value: string) => void
  onGenerate: () => void
  onRefreshBalance: () => void
  loading: boolean
  error: string
  preview: string
  savedPath: string
  balance: { credits?: { usd: number }; subscription?: { generations: number; total: number } } | null
}) {
  const quickPrompts = [
    'top-down pixel tiny town admin lobster worker',
    'top-down pixel tiny town lumber camp with storage',
    'top-down pixel stone quarry sign and crates',
    'top-down pixel cozy workshop with blue roof'
  ]

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
        <h3 className="text-base font-semibold text-white">PixelLab 运行时素材工坊</h3>
        <p className="mt-2 text-sm text-slate-300">
          这里会调用你填写的 PixelLab API Key 生成像素素材。适合临时补角色、建筑、道具概念图，再落到本地资源目录。
        </p>
      </div>

      <FieldInput label="素材提示词" value={prompt} onChange={onPromptChange} />

      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPromptChange(item)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-white/20"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button color="primary" isLoading={loading} onPress={onGenerate}>
          生成 32x32 透明 PNG
        </Button>
        <Button variant="flat" onPress={onRefreshBalance}>
          查询 PixelLab 余额
        </Button>
      </div>

      {balance ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Metric label="余额（USD）" value={`${balance.credits?.usd ?? 0}`} />
          <Metric label="剩余生成次数" value={`${balance.subscription?.generations ?? 0}/${balance.subscription?.total ?? 0}`} />
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger-300">{error}</div> : null}

      {preview ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
          <div className="mb-3 text-sm text-slate-300">生成预览</div>
          <div className="flex flex-wrap items-start gap-4">
            <img src={preview} alt="PixelLab generated asset preview" className="h-32 w-32 rounded-2xl border border-white/10 bg-slate-900 object-contain p-2" />
            <div className="max-w-sm text-xs text-slate-400">
              <div>已保存到：</div>
              <div className="mt-1 break-all text-slate-200">{savedPath}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CompactOverviewPanel({ save }: { save: WorldSave }) {
  const admin = save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0]
  const npcCount = save.world.agents.filter((agent) => agent.role === 'npc').length
  const logs = [
    ...admin.memorySummary.slice(-3).map((s, i) => ({ id: `s${i}`, text: s, dim: true })),
    ...admin.memories.slice(-4).map((m) => ({ id: m.id, text: m.content, dim: false }))
  ].slice(-5)

  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-2 gap-1">
        <StatCell label="管理员" value={speciesLabels[admin.species]} />
        <StatCell label="居民" value={`A1 / NPC${npcCount}`} />
        <StatCell label="建筑" value={String(save.world.buildings.length)} />
        <StatCell label="仓库" value={`🌲${save.world.stockpile.wood} 🪨${save.world.stockpile.stone}`} />
      </div>
      <div className="rounded-lg border border-white/8 bg-white/3 p-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-100/80">Admin 动态</div>
        <div className="space-y-1">
          {logs.length === 0 ? <p className="text-[10px] text-slate-300/70">世界尚年轻</p> : null}
          {logs.map((log) => (
            <p key={log.id} className={`text-[10px] leading-snug ${log.dim ? 'text-slate-300/80' : 'text-white/95'}`}>
              {log.text}
            </p>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-white/8 bg-white/3 px-2 py-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-emerald-100/80">当前任务</div>
        <p className="mt-0.5 text-[11px] font-medium text-cyan-300">{admin.currentTask}</p>
      </div>
    </div>
  )
}

function ChroniclePanel({ save }: { save: WorldSave }) {
  const events = [
    ...save.world.chatLog
      .filter((message) => message.role === 'system')
      .map((message) => ({ id: message.id, timestamp: message.timestamp, text: message.content, tone: 'system' as const })),
    ...save.world.scriptEvents.map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      text: event.summary,
      tone: event.status === 'approved' ? ('approved' as const) : ('rejected' as const)
    }))
  ]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 24)

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-white/8 bg-white/3 p-2">
        <div className="text-[9px] font-semibold uppercase tracking-widest text-emerald-100/80">世界编年史</div>
        <p className="mt-1 text-[10px] leading-snug text-slate-200/85">记录出生、情绪波动、死亡、继任和 Authority 调整等关键事件。</p>
      </div>
      {events.length === 0 ? <p className="py-3 text-center text-[10px] text-slate-300/70">暂时还没有大事件</p> : null}
      {events.map((event) => (
        <div
          key={event.id}
          className={`rounded-lg border px-2.5 py-2 text-[10px] leading-snug ${
            event.tone === 'approved'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
              : event.tone === 'rejected'
                ? 'border-amber-400/20 bg-amber-400/10 text-amber-100'
                : 'border-white/8 bg-white/4 text-white/90'
          }`}
        >
          <div className="mb-1 text-[9px] uppercase tracking-widest opacity-60">{new Date(event.timestamp).toLocaleTimeString()}</div>
          {event.text}
        </div>
      ))}
    </div>
  )
}

function CompactDialoguePanel({ save }: { save: WorldSave }) {
  const messages = save.world.chatLog.slice(-12)
  return (
    <div className="space-y-1.5">
      {messages.length === 0 ? <p className="text-[10px] text-slate-600 py-2 text-center">还没有对话记录</p> : null}
      {messages.map((message) => (
        <div
          key={message.id}
          className={`rounded-lg p-2 text-[10px] leading-snug ${
            message.role === 'player'
              ? 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
              : message.role === 'admin'
                ? 'border border-white/8 bg-white/5 text-slate-200'
                : 'border border-slate-700/50 text-slate-500'
          }`}
        >
          <span className="mr-1 text-[9px] font-bold uppercase tracking-widest opacity-50">
            {message.role === 'player' ? 'YOU' : message.role === 'admin' ? 'ADMIN' : 'SYS'}
          </span>
          {message.content}
        </div>
      ))}
    </div>
  )
}

function CompactTokenPanel({ save }: { save: WorldSave }) {
  const summary = summarizeTokenUsage(save.world.tokenLedger)
  const lastRecord = save.world.tokenLedger.at(-1)
  return (
    <div className="grid gap-1.5">
      <div className="grid grid-cols-2 gap-1">
        <StatCell label="总消耗" value={summary.totalTokens.toLocaleString()} />
        <StatCell label="近1小时" value={summary.lastHour.toLocaleString()} />
        <StatCell label="请求次数" value={String(save.world.tokenLedger.length)} />
        <StatCell label="最近模型" value={lastRecord?.model?.split('-').slice(-1)[0] ?? '—'} />
      </div>
      {save.world.tokenLedger.length > 0 ? (
        <div className="space-y-1">
          <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">最近调用</div>
          {save.world.tokenLedger.slice(-4).reverse().map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/3 px-2 py-1">
              <span className="text-[10px] text-slate-400">{r.requestType}</span>
              <span className={`text-[10px] font-mono font-bold ${r.estimated ? 'text-amber-400' : 'text-emerald-400'}`}>
                {r.totalTokens}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-[10px] text-slate-600 py-2">暂无调用记录</p>
      )}
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/3 px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-emerald-100/80">{label}</div>
      <div className="mt-0.5 text-[11px] font-bold leading-none text-white">{value}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <StatCell label={label} value={value} />
}

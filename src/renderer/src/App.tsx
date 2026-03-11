import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Spinner,
  Tab,
  Tabs,
  Textarea
} from '@heroui/react'
import type { AgentSpecies, AppSettings, FocusGoal, SaveDraft, SaveMeta, WorldSave } from '@shared/contracts'
import { createDefaultBaseUrl } from '@shared/contracts'
import {
  addTokenUsage,
  appendChat,
  applyFocus,
  createEstimatedUsage,
  evaluateAuthority,
  getAuthoritySnapshot,
  getWorldSummary,
  parseFocusFromMessage,
  summarizeTokenTrend,
  summarizeTokenUsage
} from '@shared/game'
import { PixiWorld } from './game/PixiWorld'
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
    <div className="flex h-screen flex-col">
      <WindowTitleBar compactMode={compactMode} />
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

function WindowTitleBar({ compactMode }: { compactMode: boolean }) {
  return (
    <div className="drag-region flex h-12 items-center justify-between border-b border-white/10 px-4 text-sm text-slate-200">
      <div className="flex items-center gap-3">
        <span className="text-base font-semibold tracking-wide text-cyan-300">Clawcraft</span>
        <Chip size="sm" variant="flat" color={compactMode ? 'warning' : 'primary'}>
          {compactMode ? '桌宠模式' : '标准模式'}
        </Chip>
      </div>
      <div className="no-drag flex items-center gap-2">
        <Button size="sm" variant="flat" onPress={() => void window.clawcraft.minimizeWindow()}>
          最小化
        </Button>
        <Button size="sm" color="danger" variant="flat" onPress={() => void window.clawcraft.closeWindow()}>
          关闭
        </Button>
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
  const [step, setStep] = useState<'mode' | 'provider' | 'review'>(
    initialSettings.offlineMode ? 'review' : initialSettings.apiKey ? 'review' : 'mode'
  )
  const [error, setError] = useState('')

  const providerReady = settings.offlineMode || settings.apiKey.trim().length > 0

  function goNext() {
    setError('')
    if (step === 'mode') {
      setStep(settings.offlineMode ? 'review' : 'provider')
      return
    }

    if (step === 'provider') {
      if (!providerReady) {
        setError('请先填写 API Key，或者返回上一步开启离线演示模式。')
        return
      }
      setStep('review')
    }
  }

  return (
    <div className="grid flex-1 place-items-center overflow-auto p-6">
      <Card className="panel w-full max-w-5xl rounded-[2rem]">
        <CardHeader className="flex flex-col items-start gap-2 p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">World bootstrap</p>
          <h1 className="text-3xl font-semibold text-white">配置管理员世界脑</h1>
          <p className="max-w-2xl text-sm text-slate-300">
            进入游戏前，需要先配置 OpenAI 或 MiniMax 的 API Key。为了便于本地调试，也可以启用离线演示模式，
            让世界先以本地启发式 AI 运转。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip color={step === 'mode' ? 'primary' : 'default'} variant="flat">
              1. 运行模式
            </Chip>
            <Chip color={step === 'provider' ? 'primary' : 'default'} variant="flat">
              2. Provider 配置
            </Chip>
            <Chip color={step === 'review' ? 'primary' : 'default'} variant="flat">
              3. 完成确认
            </Chip>
          </div>
        </CardHeader>
        <CardBody className="grid gap-6 p-8 pt-0 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4">
            {step === 'mode' ? (
              <div className="grid gap-4">
                <p className="text-sm text-slate-300">先决定这次测试是走在线模式，还是先用离线演示模式。</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <ProviderCard
                    active={!settings.offlineMode}
                    title="在线模式"
                    subtitle="填写 OpenAI / MiniMax API Key 后进入世界"
                    onPress={() =>
                      setSettings((current) => ({
                        ...current,
                        offlineMode: false
                      }))
                    }
                  />
                  <ProviderCard
                    active={settings.offlineMode}
                    title="离线演示模式"
                    subtitle="不需要 API Key，适合先测试世界循环和 UI"
                    onPress={() =>
                      setSettings((current) => ({
                        ...current,
                        offlineMode: true
                      }))
                    }
                  />
                </div>
                <div className="flex justify-end">
                  <Button color="primary" onPress={goNext}>
                    下一步
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 'provider' ? (
              <div className="grid gap-4">
                <p className="text-sm text-slate-300">现在再配置 Provider。没有 API Key 时，不能继续创建世界。</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <ProviderCard
                    active={settings.provider === 'openai'}
                    title="OpenAI"
                    subtitle="官方 OpenAI Chat Completions"
                    onPress={() => setSettings((current) => ({ ...current, provider: 'openai', baseUrl: createDefaultBaseUrl('openai') }))}
                  />
                  <ProviderCard
                    active={settings.provider === 'minimax'}
                    title="MiniMax"
                    subtitle="OpenAI 兼容模式"
                    onPress={() => setSettings((current) => ({ ...current, provider: 'minimax', baseUrl: createDefaultBaseUrl('minimax') }))}
                  />
                </div>
                <FieldInput
                  label="API Key"
                  placeholder="sk-..."
                  type="password"
                  value={settings.apiKey}
                  onChange={(apiKey) => {
                    setError('')
                    setSettings((current) => ({ ...current, apiKey }))
                  }}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <FieldInput label="模型" value={settings.model} onChange={(model) => setSettings((current) => ({ ...current, model }))} />
                  <FieldInput
                    label="Base URL"
                    value={settings.baseUrl}
                    onChange={(baseUrl) => setSettings((current) => ({ ...current, baseUrl }))}
                  />
                </div>
                {settings.provider === 'minimax' ? (
                  <FieldInput
                    label="MiniMax Group ID（可选）"
                    value={settings.groupId ?? ''}
                    onChange={(groupId) => setSettings((current) => ({ ...current, groupId }))}
                  />
                ) : null}
                {error ? <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger-300">{error}</div> : null}
                <div className="flex justify-between gap-3">
                  <Button variant="flat" onPress={() => setStep('mode')}>
                    上一步
                  </Button>
                  <Button color="primary" onPress={goNext}>
                    下一步
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 'review' ? (
              <div className="grid gap-4">
                <p className="text-sm text-slate-300">最后确认一次。完成后才会进入存档大厅，避免没配好就直接开世界。</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Metric label="运行模式" value={settings.offlineMode ? '离线演示模式' : '在线模式'} />
                  <Metric label="Provider" value={settings.offlineMode ? '本地启发式 AI' : settings.provider.toUpperCase()} />
                  <Metric label="API 状态" value={settings.offlineMode ? '不需要 API Key' : settings.apiKey ? '已填写' : '未填写'} />
                  <Metric label="默认模型" value={settings.model} />
                </div>
                {!providerReady ? (
                  <div className="rounded-2xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger-300">
                    当前还不能继续：你还没有填写 API Key，也没有启用离线演示模式。
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <Button variant="flat" onPress={() => setStep(settings.offlineMode ? 'mode' : 'provider')}>
                    上一步
                  </Button>
                  <Button
                    className="w-full max-w-xs"
                    color="primary"
                    isDisabled={!providerReady}
                    isLoading={saving}
                    onPress={async () => {
                      setSaving(true)
                      try {
                        await onSaved(settings)
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    完成引导并进入存档大厅
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel rounded-3xl p-5">
            <h2 className="text-lg font-semibold text-white">稳定性策略</h2>
            <img
              src="/assets/kenney/tiny-town-preview.png"
              alt="Kenney Tiny Town 预览"
              className="mt-4 h-32 w-full rounded-2xl border border-white/10 object-cover"
            />
            <ul className="mt-4 space-y-3 text-sm text-slate-300">
              <li>• 默认 2D 俯视角，桌宠模式也能看清 Agent 动作。</li>
              <li>• Admin Agent 默认目标：建设城镇、发展更多小 Agent。</li>
              <li>• Authority 会拒绝危险命令、限制世界边界与内存膨胀。</li>
              <li>• Token Dashboard 会跟踪聊天和总结类调用消耗。</li>
              <li>• 已接入 Kenney Tiny Town 素材作为基础 2D 资源参考。</li>
            </ul>
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-300">
              {step === 'mode' ? '先决定运行模式。' : null}
              {step === 'provider' ? '这一步必须先填好 API Key，或者返回上一步启用离线演示模式。' : null}
              {step === 'review' ? '只有当配置完整时，才会允许进入存档大厅。' : null}
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function ProviderCard({
  active,
  title,
  subtitle,
  onPress
}: {
  active: boolean
  title: string
  subtitle: string
  onPress: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`rounded-3xl border p-4 text-left transition ${
        active ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-white/5 hover:border-white/20'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-300">{subtitle}</div>
        </div>
        <Chip size="sm" color={active ? 'primary' : 'default'} variant="flat">
          {active ? '已选择' : '点击选择'}
        </Chip>
      </div>
    </button>
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
  onOpen
}: {
  saves: SaveMeta[]
  onCreate: (draft: SaveDraft) => Promise<void>
  onOpen: (id: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<SaveDraft>({
    name: 'New Clawcraft World',
    species: 'lobster'
  })
  const [creating, setCreating] = useState(false)

  return (
    <div className="grid flex-1 gap-6 overflow-auto p-6 lg:grid-cols-[420px_1fr]">
      <Card className="panel rounded-[2rem]">
        <CardHeader className="flex flex-col items-start gap-2">
          <h2 className="text-2xl font-semibold text-white">创建新世界</h2>
          <p className="text-sm text-slate-300">选择管理员物种后，剩下的世界将交给 Agent 自己生长。</p>
        </CardHeader>
        <CardBody className="gap-4">
          <img
            src="/assets/kenney/tiny-town-preview.png"
            alt="Kenney Tiny Town 俯视角参考"
            className="h-32 w-full rounded-3xl border border-white/10 object-cover"
          />
          <FieldInput label="存档名" value={draft.name} onChange={(name) => setDraft((current) => ({ ...current, name }))} />
          <div className="grid gap-3">
            <p className="text-sm text-slate-400">管理员物种</p>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(speciesLabels) as AgentSpecies[]).map((species) => (
                <button
                  key={species}
                  type="button"
                  className={`rounded-2xl border p-4 text-left transition ${
                    draft.species === species ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                  onClick={() => setDraft((current) => ({ ...current, species }))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold text-white">{speciesLabels[species]}</div>
                      <div className="mt-1 text-xs text-slate-400">
                        {species === 'lobster'
                          ? '坚韧、适合高压管理'
                          : species === 'cat'
                            ? '灵巧、偏扩张与探索'
                            : species === 'dog'
                              ? '稳定、偏执行与巡逻'
                              : '温顺、偏资源与耕作'}
                      </div>
                    </div>
                    <Chip size="sm" color={draft.species === species ? 'primary' : 'default'} variant="flat">
                      {draft.species === species ? '当前选择' : '点击选择'}
                    </Chip>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-sm text-slate-300">
            当前管理员：<span className="font-semibold text-white">{speciesLabels[draft.species]}</span>
          </div>
          <Button
            color="primary"
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
            创建世界并交给 Admin Agent
          </Button>
        </CardBody>
      </Card>

      <div className="grid content-start gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">已有存档</h2>
          <p className="mt-2 text-sm text-slate-300">所有世界都是 JSON 存档，可独立恢复。</p>
        </div>
        <GlobalDashboard saves={saves} />
        <div className="grid gap-4 xl:grid-cols-2">
          {saves.length === 0 ? (
            <Card className="panel rounded-3xl">
              <CardBody className="text-sm text-slate-300">还没有任何世界，先创建第一个自治文明吧。</CardBody>
            </Card>
          ) : null}
          {saves.map((save) => (
            <Card key={save.id} className="panel rounded-3xl">
              <CardBody className="gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{save.name}</h3>
                    <p className="mt-1 text-sm text-slate-300">{save.description}</p>
                  </div>
                  <Chip color="primary" variant="flat">
                    {speciesLabels[save.species]}
                  </Chip>
                </div>
                <div className="stat-grid text-sm">
                  <Metric label="Agent" value={String(save.agentCount)} />
                  <Metric label="建筑" value={String(save.buildingCount)} />
                  <Metric label="当前焦点" value={focusLabels[save.focus]} />
                  <Metric label="Token 总量" value={save.tokenTotal.toLocaleString()} />
                  <Metric label="种子" value={String(save.seed)} />
                  <Metric label="最近 1 小时 Token" value={save.lastHourTokens.toLocaleString()} />
                </div>
                <Button color="primary" variant="flat" onPress={() => void onOpen(save.id)}>
                  进入这个世界
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function GlobalDashboard({ saves }: { saves: SaveMeta[] }) {
  const sortedSaves = saves.slice().sort((a, b) => b.tokenTotal - a.tokenTotal)
  const totalTokens = saves.reduce((sum, save) => sum + save.tokenTotal, 0)
  const totalLastHour = saves.reduce((sum, save) => sum + save.lastHourTokens, 0)

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
                  <span className="font-medium text-white">{save.name}</span>
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
  const [renderMode, setRenderMode] = useState<'2d' | '3d'>('2d')

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

  const admin = save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0]

  async function persist(nextSave: WorldSave) {
    setSave(nextSave)
    runtimeRef.current?.replaceSave(nextSave)
    await window.clawcraft.writeSave(nextSave)
  }

  async function sendChat() {
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

  if (compactMode) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="panel flex items-center justify-between rounded-2xl px-3 py-2 text-xs text-slate-200">
          <div>
            <div className="font-semibold text-white">{save.meta.name}</div>
            <div>{admin.currentTask}</div>
          </div>
          <div className="flex items-center gap-2">
            <Chip size="sm" color="primary" variant="flat">
              {save.world.agents.length} Agent
            </Chip>
            <Button size="sm" variant="flat" onPress={() => void onCompactChange(false)}>
              展开
            </Button>
          </div>
        </div>
        <div className="panel min-h-0 flex-1 rounded-[1.5rem] p-2">
          <PixiWorld save={save} compact />
        </div>
      </div>
    )
  }

  return (
    <div className="grid flex-1 gap-4 overflow-hidden p-4 xl:grid-cols-[minmax(0,1.8fr)_420px]">
      <div className="panel flex min-h-0 flex-col rounded-[2rem] p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">{save.meta.name}</h2>
            <p className="mt-1 text-sm text-slate-300">{getWorldSummary(save)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="flat" onPress={() => void persist(save)}>
              立即保存
            </Button>
            <Button variant="flat" onPress={() => void onCompactChange(true)}>
              切到桌宠模式
            </Button>
            <Button color="warning" variant="flat" onPress={() => void onBack()}>
              返回存档大厅
            </Button>
          </div>
        </div>

        <div className="mb-4 stat-grid">
          <Metric label="默认大目标" value="建设城镇 / 发展小 Agent" />
          <Metric label="当前焦点" value={focusLabels[save.world.focus]} />
          <Metric label="城镇库存" value={`木 ${save.world.stockpile.wood} / 石 ${save.world.stockpile.stone}`} />
          <Metric label="实时任务" value={admin.currentTask} />
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Button size="sm" color={renderMode === '2d' ? 'primary' : 'default'} variant="flat" onPress={() => setRenderMode('2d')}>
            2D 俯视角
          </Button>
          <Button size="sm" color={renderMode === '3d' ? 'warning' : 'default'} variant="flat" onPress={() => setRenderMode('3d')}>
            3D（占位）
          </Button>
        </div>

        <div className="min-h-0 flex-1 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-2">
          {renderMode === '2d' ? (
            <PixiWorld save={save} compact={false} />
          ) : (
            <div className="grid h-full place-items-center rounded-[1.2rem] bg-slate-950/50">
              <div className="max-w-lg text-center">
                <div className="text-lg font-semibold text-white">3D 世界尚未开放</div>
                <p className="mt-3 text-sm text-slate-300">
                  当前版本默认以 2D 俯视角保证桌宠观察体验。世界逻辑与渲染已分层，后续可以接入 3D renderer adapter。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-0 gap-4">
        <Card className="panel rounded-[2rem]">
          <CardBody>
            <Tabs aria-label="World panels" className="min-h-0">
              <Tab key="overview" title="概览">
                <OverviewPanel save={save} />
              </Tab>
              <Tab key="chat" title="神谕对话">
                <div className="grid gap-3">
                  <div className="max-h-[330px] overflow-auto rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                    <div className="space-y-3">
                      {save.world.chatLog.slice(-12).map((message) => (
                        <div key={message.id} className="rounded-2xl border border-white/8 bg-white/5 p-3 text-sm">
                          <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-400">{message.role}</div>
                          <div className="whitespace-pre-wrap text-slate-200">{message.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    label="给 Admin Agent 的命令"
                    value={chatInput}
                    onValueChange={setChatInput}
                    placeholder="例如：优先扩张木材产量，尽快建设新的小屋。"
                  />
                  <Button color="primary" isLoading={sending} onPress={() => void sendChat()}>
                    下达神谕
                  </Button>
                </div>
              </Tab>
              <Tab key="token" title="Token Dashboard">
                <TokenDashboard save={save} />
              </Tab>
            </Tabs>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function OverviewPanel({ save }: { save: WorldSave }) {
  const admin = save.world.agents.find((agent) => agent.role === 'admin') ?? save.world.agents[0]
  const npcCount = save.world.agents.filter((agent) => agent.role === 'npc').length
  const authority = getAuthoritySnapshot(save)
  const adminScript = save.world.scriptProfiles.find((profile) => profile.id === admin.scriptId)
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Metric label="Admin 角色" value={`${speciesLabels[admin.species]} / ${admin.currentTask}`} />
        <Metric label="城镇发展" value={`建筑 ${save.world.buildings.length}，NPC ${npcCount}`} />
        <Metric label="Authority 上限" value={`Agent ${save.world.authority.maxAgents} / 建筑 ${save.world.authority.maxBuildings}`} />
        <Metric label="记忆压缩" value={`${admin.memorySummary.length} 条摘要，${admin.memories.length} 条活动记忆`} />
      </div>

      <Divider className="bg-white/10" />

      <div className="grid gap-3">
        <h3 className="text-base font-semibold text-white">Authority 稳定性快照</h3>
        <AuthorityBar
          label={`Agent 负载 ${save.world.agents.length}/${save.world.authority.maxAgents}`}
          value={authority.agentLoad}
          tone="linear-gradient(90deg, #06b6d4, #60a5fa)"
        />
        <AuthorityBar
          label={`建筑负载 ${save.world.buildings.length}/${save.world.authority.maxBuildings}`}
          value={authority.buildingLoad}
          tone="linear-gradient(90deg, #d946ef, #8b5cf6)"
        />
        <AuthorityBar
          label={`记忆负载 ${authority.memoryUsage}/${authority.memoryCapacity}`}
          value={authority.memoryLoad}
          tone="linear-gradient(90deg, #f59e0b, #fb923c)"
        />
      </div>

      <Divider className="bg-white/10" />

      <div className="grid gap-3">
        <h3 className="text-base font-semibold text-white">受限脚本演化</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <Metric label="Admin Script" value={`${adminScript?.name ?? '未加载'} · v${adminScript?.version ?? 0}`} />
          <Metric label="当前参数" value={adminScript ? `木 ${adminScript.params.woodBias} / 石 ${adminScript.params.stoneBias}` : '无'} />
        </div>
        <div className="space-y-2">
          {save.world.scriptEvents.slice(-3).reverse().map((event) => (
            <div key={event.id} className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3 text-sm text-slate-200">
              {event.summary}
            </div>
          ))}
          {save.world.scriptEvents.length === 0 ? <div className="text-sm text-slate-400">还没有脚本变更事件。</div> : null}
        </div>
      </div>

      <Divider className="bg-white/10" />

      <div className="grid gap-3">
        <h3 className="text-base font-semibold text-white">Admin Agent 记忆摘要</h3>
        <div className="space-y-2 text-sm text-slate-300">
          {admin.memorySummary.length === 0 ? <div>当前还没有历史摘要，世界还很年轻。</div> : null}
          {admin.memorySummary.slice(-4).map((entry, index) => (
            <div key={`${entry}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              {entry}
            </div>
          ))}
          {admin.memories.slice(-4).map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-3">
              {entry.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TokenDashboard({ save }: { save: WorldSave }) {
  const summary = summarizeTokenUsage(save.world.tokenLedger)
  const trend = summarizeTokenTrend(save.world.tokenLedger)
  const providerEntries = Object.entries(summary.byProvider)
  const agentEntries = Object.entries(summary.byAgent)
  const requestEntries = Object.entries(summary.byType)

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Metric label="总 Token" value={summary.totalTokens.toLocaleString()} />
        <Metric label="过去 1 小时" value={summary.lastHour.toLocaleString()} />
        <Metric label="请求次数" value={String(save.world.tokenLedger.length)} />
        <Metric label="最近一次模型" value={save.world.tokenLedger.at(-1)?.model ?? '尚未请求'} />
      </div>

      <div className="grid gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
          <h3 className="text-sm font-semibold text-white">最近时段趋势</h3>
          <div className="mt-4 grid grid-cols-6 gap-2">
            {trend.map((bucket) => {
              const max = Math.max(...trend.map((item) => item.total), 1)
              const height = Math.max(10, Math.round((bucket.total / max) * 90))
              return (
                <div key={bucket.label} className="flex flex-col items-center gap-2">
                  <div className="flex h-28 items-end">
                    <div
                      className="w-8 rounded-t-xl bg-gradient-to-t from-sky-500 to-indigo-400"
                      style={{ height: `${height}px` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400">{bucket.label}</div>
                  <div className="text-[10px] text-slate-300">{bucket.total}</div>
                </div>
              )
            })}
          </div>
        </div>
        <TokenSection title="按 Provider 统计" entries={providerEntries} total={summary.totalTokens} />
        <TokenSection title="按 Agent 统计" entries={agentEntries} total={summary.totalTokens} />
        <TokenSection title="按请求类型统计" entries={requestEntries} total={summary.totalTokens} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
        <h3 className="text-sm font-semibold text-white">最近 6 条调用</h3>
        <div className="mt-3 space-y-2">
          {save.world.tokenLedger.slice(-6).reverse().map((record) => (
            <div key={record.id} className="rounded-2xl border border-white/8 bg-white/5 p-3 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-3 text-sm text-white">
                <span>
                  {record.provider} · {record.model}
                </span>
                <span>{record.totalTokens} tokens</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Chip size="sm" variant="flat">
                  {record.requestType}
                </Chip>
                <Chip size="sm" variant="flat" color={record.estimated ? 'warning' : 'primary'}>
                  {record.estimated ? '估算' : '真实'}
                </Chip>
                <Chip size="sm" variant="flat">
                  {new Date(record.timestamp).toLocaleTimeString()}
                </Chip>
              </div>
            </div>
          ))}
          {save.world.tokenLedger.length === 0 ? <div className="text-sm text-slate-400">还没有任何调用记录。</div> : null}
        </div>
      </div>
    </div>
  )
}

function TokenSection({
  title,
  entries,
  total
}: {
  title: string
  entries: Array<[string, number]>
  total: number
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-3">
        {entries.length === 0 ? <div className="text-sm text-slate-400">暂无数据</div> : null}
        {entries.map(([label, value]) => (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-200">{label}</span>
              <span className="text-slate-300">{value.toLocaleString()}</span>
            </div>
            <div className="token-bar">
              <span style={{ width: `${total === 0 ? 0 : (value / total) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
    </div>
  )
}

function AuthorityBar({
  label,
  value,
  tone
}: {
  label: string
  value: number
  tone: string
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-200">{label}</span>
        <span className="text-slate-300">{percent}%</span>
      </div>
      <div className="token-bar mt-2">
        <span style={{ width: `${percent}%`, background: tone }} />
      </div>
    </div>
  )
}

import { z } from 'zod'

export const providerKindSchema = z.enum(['openrouter'])
export type ProviderKind = z.infer<typeof providerKindSchema>

export const windowModeSchema = z.enum(['standard', 'compact'])
export type WindowMode = z.infer<typeof windowModeSchema>

export const agentSpeciesSchema = z.enum(['lobster', 'cat', 'dog', 'sheep'])
export type AgentSpecies = z.infer<typeof agentSpeciesSchema>

export const terrainTypeSchema = z.enum(['grass', 'forest', 'water', 'stone', 'soil'])
export type TerrainType = z.infer<typeof terrainTypeSchema>

export const resourceKindSchema = z.enum(['tree', 'stone'])
export type ResourceKind = z.infer<typeof resourceKindSchema>

export const buildingKindSchema = z.enum(['campfire', 'storage', 'hut', 'workshop'])
export type BuildingKind = z.infer<typeof buildingKindSchema>

export const focusGoalSchema = z.enum(['balanced', 'expand', 'wood', 'stone', 'tidy'])
export type FocusGoal = z.infer<typeof focusGoalSchema>

export const renderModeSchema = z.enum(['2d', '3d'])
export type RenderMode = z.infer<typeof renderModeSchema>

export const decisionEngineSchema = z.enum(['minimax-llm', 'general-llm'])
export type DecisionEngine = z.infer<typeof decisionEngineSchema>

export const playerControlModeSchema = z.enum(['control', 'observe'])
export type PlayerControlMode = z.infer<typeof playerControlModeSchema>

export const facingSchema = z.enum(['north', 'south', 'east', 'west'])
export type Facing = z.infer<typeof facingSchema>

export const animStateSchema = z.enum(['idle', 'walk'])
export type AnimState = z.infer<typeof animStateSchema>

export const pointSchema = z.object({
  x: z.number().int(),
  y: z.number().int()
})
export type Point = z.infer<typeof pointSchema>

export const smoothPositionSchema = z.object({
  x: z.number(),
  y: z.number()
})
export type SmoothPosition = z.infer<typeof smoothPositionSchema>

export const playerStateSchema = z.object({
  name: z.string(),
  position: pointSchema,
  renderPosition: smoothPositionSchema,
  facing: facingSchema.default('south'),
  animState: animStateSchema.default('idle')
})
export type PlayerState = z.infer<typeof playerStateSchema>

export const appSettingsSchema = z.object({
  provider: providerKindSchema.default('openrouter'),
  apiKey: z.string().default(''),
  model: z.string().default('openai/gpt-5.4'),
  baseUrl: z.string().default('https://openrouter.ai/api/v1'),
  minimaxApiKey: z.string().default(''),
  minimaxModel: z.string().default('MiniMax-M2.5'),
  minimaxBaseUrl: z.string().default('https://api.minimax.io/v1'),
  pixelLabApiKey: z.string().default(''),
  compactMode: z.boolean().default(false)
})
export type AppSettings = z.infer<typeof appSettingsSchema>

export const saveMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: agentSpeciesSchema,
  renderMode: renderModeSchema.default('3d'),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastPlayedAt: z.number(),
  seed: z.number().int(),
  agentCount: z.number().int(),
  buildingCount: z.number().int(),
  tokenTotal: z.number().int().nonnegative(),
  lastHourTokens: z.number().int().nonnegative(),
  focus: focusGoalSchema,
  description: z.string()
})
export type SaveMeta = z.infer<typeof saveMetaSchema>

export const inventorySchema = z.object({
  wood: z.number().int().nonnegative(),
  stone: z.number().int().nonnegative()
})
export type Inventory = z.infer<typeof inventorySchema>

export const memoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  kind: z.enum(['observation', 'plan', 'action', 'summary', 'dialogue']),
  content: z.string()
})
export type MemoryEntry = z.infer<typeof memoryEntrySchema>

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['player', 'admin', 'system']),
  content: z.string(),
  timestamp: z.number()
})
export type ChatMessage = z.infer<typeof chatMessageSchema>

export const agentStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: agentSpeciesSchema,
  role: z.enum(['admin', 'npc']),
  scriptId: z.string(),
  position: pointSchema,
  renderPosition: smoothPositionSchema,
  inventory: inventorySchema,
  currentTask: z.string(),
  actionTicks: z.number().int().nonnegative(),
  ageTicks: z.number().int().nonnegative(),
  maxAgeTicks: z.number().int().positive(),
  mental: z.number().min(0).max(100),
  mood: z.enum(['stable', 'emo']),
  facing: facingSchema.default('south'),
  animState: animStateSchema.default('idle'),
  plan: z.string(),
  focus: focusGoalSchema,
  memories: z.array(memoryEntrySchema),
  memorySummary: z.array(z.string()),
  color: z.string()
})
export type AgentState = z.infer<typeof agentStateSchema>

export const resourceNodeSchema = z.object({
  id: z.string(),
  kind: resourceKindSchema,
  scriptId: z.string(),
  position: pointSchema,
  amount: z.number().int().positive()
})
export type ResourceNode = z.infer<typeof resourceNodeSchema>

export const buildingSchema = z.object({
  id: z.string(),
  kind: buildingKindSchema,
  scriptId: z.string(),
  position: pointSchema,
  rotation: z.number().int().min(0).max(3).default(0),
  progress: z.number().min(0).max(1),
  complete: z.boolean()
})
export type BuildingState = z.infer<typeof buildingSchema>

export const scriptParamsSchema = z.object({
  woodBias: z.number().min(0).max(1),
  stoneBias: z.number().min(0).max(1),
  expansionBias: z.number().min(0).max(1),
  tidyBias: z.number().min(0).max(1),
  spawnBias: z.number().min(0).max(1)
})
export type ScriptParams = z.infer<typeof scriptParamsSchema>

export const scriptProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerAgentId: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.number(),
  params: scriptParamsSchema
})
export type ScriptProfile = z.infer<typeof scriptProfileSchema>

export const scriptEventSchema = z.object({
  id: z.string(),
  scriptId: z.string(),
  actorId: z.string(),
  timestamp: z.number(),
  status: z.enum(['approved', 'rejected']),
  summary: z.string()
})
export type ScriptEvent = z.infer<typeof scriptEventSchema>

export const authorityLimitsSchema = z.object({
  maxAgents: z.number().int().positive(),
  maxBuildings: z.number().int().positive(),
  maxMemoriesPerAgent: z.number().int().positive(),
  maxQueuedTasks: z.number().int().positive(),
  mapWidth: z.number().int().positive(),
  mapHeight: z.number().int().positive()
})
export type AuthorityLimits = z.infer<typeof authorityLimitsSchema>

export const tokenUsageRecordSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  provider: z.string(),
  worldId: z.string(),
  agentId: z.string(),
  requestType: z.enum(['chat', 'planner', 'summary', 'fallback']),
  model: z.string(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimated: z.boolean().default(false)
})
export type TokenUsageRecord = z.infer<typeof tokenUsageRecordSchema>

export const adminActionSchema = z.enum(['gatherWood', 'gatherStone', 'build', 'spawn', 'stabilize'])
export type AdminAction = z.infer<typeof adminActionSchema>

export const llmPolicySchema = z.object({
  nextAdminAction: adminActionSchema.default('gatherWood'),
  rationale: z.string().default(''),
  source: z.enum(['minimax-llm', 'fallback']).default('fallback'),
  updatedAt: z.number().default(0)
})
export type LlmPolicyState = z.infer<typeof llmPolicySchema>

export const worldStateSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  seed: z.number().int(),
  time: z.number().nonnegative(),
  focus: focusGoalSchema,
  townCenter: pointSchema,
  player: playerStateSchema,
  stockpile: inventorySchema,
  terrain: z.array(z.array(terrainTypeSchema)),
  resources: z.array(resourceNodeSchema),
  buildings: z.array(buildingSchema),
  agents: z.array(agentStateSchema),
  chatLog: z.array(chatMessageSchema),
  tokenLedger: z.array(tokenUsageRecordSchema),
  llmPolicy: llmPolicySchema,
  scriptProfiles: z.array(scriptProfileSchema),
  scriptEvents: z.array(scriptEventSchema),
  authority: authorityLimitsSchema
})
export type WorldState = z.infer<typeof worldStateSchema>

export const worldSaveSchema = z.object({
  version: z.literal(1),
  meta: saveMetaSchema,
  settings: z.object({
    focus: focusGoalSchema,
    renderMode: renderModeSchema.default('3d'),
    decisionEngine: decisionEngineSchema.default('minimax-llm'),
    playerControlMode: playerControlModeSchema.default('control')
  }),
  world: worldStateSchema
})
export type WorldSave = z.infer<typeof worldSaveSchema>

export const bootstrapStateSchema = z.object({
  settings: appSettingsSchema,
  saves: z.array(saveMetaSchema),
  windowMode: windowModeSchema
})
export type BootstrapState = z.infer<typeof bootstrapStateSchema>

export const saveDraftSchema = z.object({
  name: z.string().min(2).max(32),
  species: agentSpeciesSchema,
  renderMode: renderModeSchema,
  decisionEngine: decisionEngineSchema,
  seed: z.number().int().optional()
})
export type SaveDraft = z.infer<typeof saveDraftSchema>

export const behaviorPlanRequestSchema = z.object({
  worldId: z.string(),
  agentId: z.string(),
  decisionEngine: decisionEngineSchema,
  worldSummary: z.string(),
  currentFocus: focusGoalSchema,
  adminTask: z.string()
})
export type BehaviorPlanRequest = z.infer<typeof behaviorPlanRequestSchema>

export const behaviorPlanResponseSchema = z.object({
  action: adminActionSchema,
  focus: focusGoalSchema.optional(),
  rationale: z.string(),
  usage: tokenUsageRecordSchema.optional()
})
export type BehaviorPlanResponse = z.infer<typeof behaviorPlanResponseSchema>

export const agentIdentityRequestSchema = z.object({
  worldId: z.string(),
  agentId: z.string(),
  worldSummary: z.string(),
  species: agentSpeciesSchema,
  role: z.enum(['admin', 'npc']),
  existingNames: z.array(z.string())
})
export type AgentIdentityRequest = z.infer<typeof agentIdentityRequestSchema>

export const agentIdentityResponseSchema = z.object({
  name: z.string(),
  story: z.string(),
  usage: tokenUsageRecordSchema.optional()
})
export type AgentIdentityResponse = z.infer<typeof agentIdentityResponseSchema>

export const chatRequestSchema = z.object({
  worldId: z.string(),
  agentId: z.string(),
  playerMessage: z.string().min(1),
  worldSummary: z.string(),
  currentFocus: focusGoalSchema
})
export type ChatRequest = z.infer<typeof chatRequestSchema>

export const chatResponseSchema = z.object({
  accepted: z.boolean(),
  reply: z.string(),
  focus: focusGoalSchema.optional(),
  usage: tokenUsageRecordSchema.optional()
})
export type ChatResponse = z.infer<typeof chatResponseSchema>

export const pixelLabBalanceSchema = z.object({
  credits: z
    .object({
      type: z.string(),
      usd: z.number()
    })
    .optional(),
  subscription: z
    .object({
      type: z.string(),
      generations: z.number(),
      total: z.number()
    })
    .optional()
})
export type PixelLabBalance = z.infer<typeof pixelLabBalanceSchema>

export const pixelLabGenerateRequestSchema = z.object({
  prompt: z.string().min(3),
  width: z.number().int().min(16).max(64).default(32),
  height: z.number().int().min(16).max(64).default(32),
  noBackground: z.boolean().default(true)
})
export type PixelLabGenerateRequest = z.infer<typeof pixelLabGenerateRequestSchema>

export const pixelLabGenerateResponseSchema = z.object({
  success: z.boolean(),
  imageDataUrl: z.string().optional(),
  savedPath: z.string().optional(),
  error: z.string().optional()
})
export type PixelLabGenerateResponse = z.infer<typeof pixelLabGenerateResponseSchema>

export const defaultAuthorityLimits: AuthorityLimits = {
  maxAgents: 64,
  maxBuildings: 30,
  maxMemoriesPerAgent: 24,
  maxQueuedTasks: 16,
  mapWidth: 96,
  mapHeight: 96
}

export const defaultAppSettings: AppSettings = {
  provider: 'openrouter',
  apiKey: '',
  model: 'openai/gpt-5.4',
  baseUrl: 'https://openrouter.ai/api/v1',
  minimaxApiKey: '',
  minimaxModel: 'MiniMax-M2.5',
  minimaxBaseUrl: 'https://api.minimax.io/v1',
  pixelLabApiKey: '',
  compactMode: false
}

export function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4))
}

export function createDefaultBaseUrl(provider: ProviderKind): string {
  return provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://openrouter.ai/api/v1'
}

export function createDefaultModel(provider: ProviderKind): string {
  return provider === 'openrouter' ? 'openai/gpt-5.4' : 'openai/gpt-5.4'
}

export function getRecommendedModels(provider: ProviderKind): string[] {
  return provider === 'openrouter'
    ? ['openai/gpt-5.4', 'openai/gpt-5.4-mini', 'openai/gpt-4.1']
    : ['openai/gpt-5.4']
}

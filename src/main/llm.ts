import OpenAI from 'openai'
import type { AgentIdentityRequest, AgentIdentityResponse, BehaviorPlanRequest, BehaviorPlanResponse, ChatRequest, ChatResponse, TokenUsageRecord } from '../shared/contracts'
import { createEstimatedUsage } from '../shared/game'
import { getSettings } from './storage'

function buildFallbackReply(request: ChatRequest): { reply: string; usage: TokenUsageRecord } {
  const focus =
    request.currentFocus === 'wood'
      ? '我会优先扩张伐木与仓储。'
      : request.currentFocus === 'stone'
        ? '我会优先铺开采石与建材储备。'
        : request.currentFocus === 'tidy'
          ? '我会优先整理营地与优化布局。'
          : request.currentFocus === 'balanced'
            ? '我会平衡资源循环与建设节奏。'
            : '我会继续扩张城镇并在预算范围内培育更多小 Agent。'

  const reply = `已记录你的神谕：${request.playerMessage}\n${focus}\n如果 Authority 发现超限风险，我会优先保持世界稳定。`
  return {
    reply,
    usage: createEstimatedUsage('offline-fallback', request.worldId, request.agentId, 'fallback', 'heuristic-local', request.worldSummary + request.playerMessage, reply)
  }
}

export async function chatWithAdmin(request: ChatRequest): Promise<ChatResponse> {
  const settings = getSettings()

  if (!settings.apiKey) {
    const fallback = buildFallbackReply(request)
    return {
      accepted: true,
      reply: fallback.reply,
      usage: fallback.usage
    }
  }

  const systemPrompt =
    '你是 Clawcraft 世界的唯一管理员 Agent。玩家是神，只能通过你改变世界。你的默认目标是建设城镇、维持稳定、在预算允许时派生更多子 Agent。遇到危险、失控、超预算或可能引发崩溃的命令必须拒绝，并说明原因与替代方案。回复请简短、直接、具可执行性。'

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl
  })

  try {
    const response = await client.chat.completions.create({
      model: 'openai/gpt-5.4',
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `世界摘要：${request.worldSummary}\n当前焦点：${request.currentFocus}\n玩家消息：${request.playerMessage}`
        }
      ]
    })

    const reply = response.choices[0]?.message?.content?.trim() || '我收到了你的目标，会尽快调整城镇计划。'
    const usage: TokenUsageRecord = {
      id: `usage_${Date.now()}`,
      timestamp: Date.now(),
      provider: settings.provider,
      worldId: request.worldId,
      agentId: request.agentId,
      requestType: 'chat',
      model: 'openai/gpt-5.4',
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens:
        response.usage?.total_tokens ??
        (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
      estimated: false
    }

    return {
      accepted: true,
      reply,
      usage
    }
  } catch {
    const fallback = buildFallbackReply(request)
    return {
      accepted: true,
      reply: fallback.reply,
      usage: fallback.usage
    }
  }
}

function parseBehaviorJson(text: string): { action: BehaviorPlanResponse['action']; focus?: BehaviorPlanResponse['focus']; rationale: string } | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidate = fenced ?? text.trim()
  try {
    const parsed = JSON.parse(candidate) as { action?: BehaviorPlanResponse['action']; focus?: BehaviorPlanResponse['focus']; rationale?: string }
    if (!parsed.action) return null
    if (!['gatherWood', 'gatherStone', 'build', 'spawn', 'stabilize'].includes(parsed.action)) return null
    return {
      action: parsed.action,
      focus: parsed.focus,
      rationale: parsed.rationale?.trim() || 'MiniMax 行为规划完成。'
    }
  } catch {
    return null
  }
}

export async function planAgentBehavior(request: BehaviorPlanRequest): Promise<BehaviorPlanResponse> {
  const settings = getSettings()
  const fallback: BehaviorPlanResponse = {
    action: request.currentFocus === 'stone' ? 'gatherStone' : 'gatherWood',
    focus: request.currentFocus,
    rationale: 'MiniMax 不可用，临时使用保守行为。',
    usage: createEstimatedUsage(
      'minimax-fallback',
      request.worldId,
      request.agentId,
      'planner',
      'heuristic-local',
      request.worldSummary + request.adminTask,
      'fallback behavior'
    )
  }

  if (!settings.minimaxApiKey) return fallback

  const client = new OpenAI({
    apiKey: settings.minimaxApiKey,
    baseURL: settings.minimaxBaseUrl
  })

  const systemPrompt =
    '你是 Clawcraft 的 Agent 行为规划器。必须返回 JSON：{"action":"gatherWood|gatherStone|build|spawn|stabilize","focus":"balanced|expand|wood|stone|tidy","rationale":"..."}。只返回 JSON，不要解释。'

  try {
    const response = await client.chat.completions.create({
      model: settings.minimaxModel,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `决策引擎：${request.decisionEngine}\n世界摘要：${request.worldSummary}\n当前焦点：${request.currentFocus}\nAdmin任务：${request.adminTask}`
        }
      ]
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ''
    const parsed = parseBehaviorJson(raw)
    if (!parsed) return fallback
    return {
      action: parsed.action,
      focus: parsed.focus,
      rationale: parsed.rationale,
      usage: {
        id: `usage_${Date.now()}`,
        timestamp: Date.now(),
        provider: 'minimax',
        worldId: request.worldId,
        agentId: request.agentId,
        requestType: 'planner',
        model: settings.minimaxModel,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens:
          response.usage?.total_tokens ??
          (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
        estimated: false
      }
    }
  } catch {
    return fallback
  }
}

function buildFallbackIdentity(request: AgentIdentityRequest): AgentIdentityResponse {
  const pools = {
    lobster: ['赤钳', '潮壳', '砂尾', '珊钳'],
    cat: ['雾铃', '松尾', '灰杏', '阿苔'],
    dog: ['石耳', '栗爪', '阿砾', '木岚'],
    sheep: ['绒果', '白穗', '云团', '禾铃']
  } as const
  const base = pools[request.species][request.existingNames.length % pools[request.species].length] ?? `${request.species}-agent`
  const suffix = request.role === 'admin' ? '长' : ''
  return {
    name: `${base}${suffix}`,
    story: request.role === 'admin' ? '天生爱记账和规划营地，总想把聚落打理得更稳。' : '习惯把采来的资源分类堆好，希望有一天能拥有自己的小屋。',
    usage: createEstimatedUsage('minimax-fallback', request.worldId, request.agentId, 'summary', 'heuristic-local', request.worldSummary, base)
  }
}

export async function generateAgentIdentity(request: AgentIdentityRequest): Promise<AgentIdentityResponse> {
  const settings = getSettings()
  if (!settings.minimaxApiKey) return buildFallbackIdentity(request)

  const client = new OpenAI({
    apiKey: settings.minimaxApiKey,
    baseURL: settings.minimaxBaseUrl
  })

  const systemPrompt =
    '你是 Clawcraft 的命名与人物设定助手。请只返回 JSON：{"name":"名字","story":"一句20到40字的人物背景"}。名字要简短自然，适合中文奇幻/低模小镇世界，不要使用 Settler、Admin、NPC、编号。story 要体现这个 agent 的性格或过往。'

  try {
    const response = await client.chat.completions.create({
      model: settings.minimaxModel,
      temperature: 0.9,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `世界摘要：${request.worldSummary}\n物种：${request.species}\n身份：${request.role}\n已存在名字：${request.existingNames.join('、') || '无'}`
        }
      ]
    })
    const raw = response.choices[0]?.message?.content?.trim() ?? ''
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim()
    const candidate = fenced ?? raw
    const parsed = JSON.parse(candidate) as { name?: string; story?: string }
    if (!parsed.name || !parsed.story) return buildFallbackIdentity(request)
    return {
      name: parsed.name.trim(),
      story: parsed.story.trim(),
      usage: {
        id: `usage_${Date.now()}`,
        timestamp: Date.now(),
        provider: 'minimax',
        worldId: request.worldId,
        agentId: request.agentId,
        requestType: 'summary',
        model: settings.minimaxModel,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens:
          response.usage?.total_tokens ??
          (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
        estimated: false
      }
    }
  } catch {
    return buildFallbackIdentity(request)
  }
}

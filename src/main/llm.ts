import OpenAI from 'openai'
import type { ChatRequest, ChatResponse, TokenUsageRecord } from '../shared/contracts'
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

  if (settings.offlineMode || !settings.apiKey) {
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
    baseURL: settings.baseUrl,
    defaultHeaders:
      settings.provider === 'minimax' && settings.groupId
        ? {
            'Group-Id': settings.groupId,
            'Minimax-Group-Id': settings.groupId
          }
        : undefined
  })

  try {
    const response = await client.chat.completions.create({
      model: settings.model,
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
      model: settings.model,
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

/**
 * Agent 请求上下文 — 通过 Mastra RequestContext 按请求注入
 * 路由层 build → generate({ requestContext }) → 工具 execute 内读取
 */
import { RequestContext } from '@mastra/core/request-context'
import type { ImportCandidate } from './tools/import-tools.js'
import type { StoryboardImportCandidate } from './tools/storyboard-import-tools.js'
import type { AssistantRef } from '../services/assistant.js'

export type AssistantAttachment = { url: string; name?: string }

export interface AssistantUiContext {
  route?: string
  drama_id?: number | null
  episode_id?: number | null
  episode_number?: number | null
  stage?: string
  script_step?: number
  prod_tab?: string
  selected_asset?: { type: 'character' | 'scene' | 'prop'; id: number } | null
  selected_storyboard_id?: number | null
}

export interface AgentRequestContextValues {
  episodeId: number
  dramaId: number
  modelOverride?: string
  textConfigId?: number
  imageConfigId?: number
  img2imgConfigId?: number
  imageModelOverride?: string
  /** 本轮是否开启模型思考（默认关；影响兼容层关思考注入） */
  enableThinking?: boolean
  uiContext?: AssistantUiContext
  /** 本轮用户 @ 引用（工具层可自动注入 reference，避免模型漏传） */
  assistantRefs?: AssistantRef[]
  assistantAttachments?: AssistantAttachment[]
  /** 资产导入解析阶段：Agent 通过工具写入候选，服务层读取 */
  importCandidateBuffer?: ImportCandidate[]
  /** 分镜导入解析阶段 */
  storyboardImportBuffer?: StoryboardImportCandidate[]
}

export function buildAgentRequestContext(values: AgentRequestContextValues): RequestContext<AgentRequestContextValues> {
  const rc = new RequestContext<AgentRequestContextValues>()
  rc.set('episodeId', values.episodeId)
  rc.set('dramaId', values.dramaId)
  if (values.modelOverride) rc.set('modelOverride', values.modelOverride)
  if (values.textConfigId) rc.set('textConfigId', values.textConfigId)
  if (values.imageConfigId) rc.set('imageConfigId', values.imageConfigId)
  if (values.img2imgConfigId) rc.set('img2imgConfigId', values.img2imgConfigId)
  if (values.imageModelOverride) rc.set('imageModelOverride', values.imageModelOverride)
  if (typeof values.enableThinking === 'boolean') rc.set('enableThinking', values.enableThinking)
  if (values.uiContext) rc.set('uiContext', values.uiContext)
  if (values.assistantRefs?.length) rc.set('assistantRefs', values.assistantRefs)
  if (values.assistantAttachments?.length) rc.set('assistantAttachments', values.assistantAttachments)
  if (values.importCandidateBuffer) rc.set('importCandidateBuffer', values.importCandidateBuffer)
  if (values.storyboardImportBuffer) rc.set('storyboardImportBuffer', values.storyboardImportBuffer)
  return rc
}

export function getEpisodeId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('episodeId' as never)
  return typeof v === 'number' && v > 0 ? v : null
}

export function getDramaId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('dramaId' as never)
  return typeof v === 'number' && v > 0 ? v : null
}

export function getImageConfigId(requestContext: RequestContext | undefined): number | undefined {
  const v = requestContext?.get('imageConfigId' as never)
  return typeof v === 'number' ? v : undefined
}

export function getImg2imgConfigId(requestContext: RequestContext | undefined): number | undefined {
  const v = requestContext?.get('img2imgConfigId' as never)
  return typeof v === 'number' ? v : undefined
}

export function getImageModelOverride(requestContext: RequestContext | undefined): string | undefined {
  const v = requestContext?.get('imageModelOverride' as never)
  return typeof v === 'string' && v ? v : undefined
}

/** 未显式传入时视为关闭思考（与助手面板默认一致） */
export function getEnableThinking(requestContext: RequestContext | undefined): boolean {
  return requestContext?.get('enableThinking' as never) === true
}

export function getUiContext(requestContext: RequestContext | undefined): AssistantUiContext | null {
  const v = requestContext?.get('uiContext' as never)
  return v && typeof v === 'object' ? (v as AssistantUiContext) : null
}

export function getAssistantRefs(requestContext: RequestContext | undefined): AssistantRef[] {
  const v = requestContext?.get('assistantRefs' as never)
  return Array.isArray(v) ? (v as AssistantRef[]) : []
}

export function getAssistantAttachments(requestContext: RequestContext | undefined): AssistantAttachment[] {
  const v = requestContext?.get('assistantAttachments' as never)
  return Array.isArray(v) ? (v as AssistantAttachment[]) : []
}

export function getImportCandidateBuffer(requestContext: RequestContext | undefined): ImportCandidate[] | null {
  const v = requestContext?.get('importCandidateBuffer' as never)
  return Array.isArray(v) ? (v as ImportCandidate[]) : null
}

export function getStoryboardImportBuffer(requestContext: RequestContext | undefined): StoryboardImportCandidate[] | null {
  const v = requestContext?.get('storyboardImportBuffer' as never)
  return Array.isArray(v) ? (v as StoryboardImportCandidate[]) : null
}

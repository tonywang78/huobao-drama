/**
 * Agent 请求上下文 — 通过 Mastra RequestContext 按请求注入
 * 路由层 build → generate({ requestContext }) → 工具 execute 内读取
 */
import { RequestContext } from '@mastra/core/request-context'
import type { ImportCandidate } from './tools/import-tools.js'
import type { StoryboardImportCandidate } from './tools/storyboard-import-tools.js'

export interface AgentRequestContextValues {
  episodeId: number
  dramaId: number
  modelOverride?: string
  textConfigId?: number
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
  if (values.importCandidateBuffer) rc.set('importCandidateBuffer', values.importCandidateBuffer)
  if (values.storyboardImportBuffer) rc.set('storyboardImportBuffer', values.storyboardImportBuffer)
  return rc
}

export function getEpisodeId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('episodeId' as never)
  return typeof v === 'number' ? v : null
}

export function getDramaId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('dramaId' as never)
  return typeof v === 'number' ? v : null
}

export function getImportCandidateBuffer(requestContext: RequestContext | undefined): ImportCandidate[] | null {
  const v = requestContext?.get('importCandidateBuffer' as never)
  return Array.isArray(v) ? (v as ImportCandidate[]) : null
}

export function getStoryboardImportBuffer(requestContext: RequestContext | undefined): StoryboardImportCandidate[] | null {
  const v = requestContext?.get('storyboardImportBuffer' as never)
  return Array.isArray(v) ? (v as StoryboardImportCandidate[]) : null
}

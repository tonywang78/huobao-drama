/**
 * 资产文件导入 Agent 工具
 * 仅收集候选结果到 RequestContext，不写库；确认入库由服务层完成
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getImportCandidateBuffer } from '../context.js'
import { logTaskSuccess } from '../../utils/task-logger.js'

const candidateSchema = z.object({
  key: z.string().describe('Stable id from the source file, e.g. s01_01_peninsula'),
  type: z.enum(['character', 'scene', 'prop']),
  name: z.string().describe('Display name; for scenes use location-like name'),
  summary: z.string().describe('Chinese summary for description fields'),
  final_prompt: z.string().describe('English image prompt from fenced code block'),
  role: z.string().optional(),
  styling: z.string().optional(),
  location: z.string().optional(),
  time: z.string().optional(),
  lighting: z.string().optional(),
  prop_type: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
})

export type ImportCandidate = z.infer<typeof candidateSchema>

const submitImportCandidates = createTool({
  id: 'submit_import_candidates',
  description:
    'Submit all parsed asset candidates from the uploaded markdown/text. Call once with the full list. Does not save to database.',
  inputSchema: z.object({
    candidates: z.array(candidateSchema).describe('All parsed assets from the file'),
  }),
  execute: async ({ candidates }, context) => {
    const buffer = getImportCandidateBuffer(context?.requestContext)
    if (!buffer) {
      return { error: 'Missing import candidate buffer in request context' }
    }
    buffer.length = 0
    for (const item of candidates) {
      buffer.push({
        ...item,
        name: (item.name || '').trim(),
        summary: (item.summary || '').trim(),
        final_prompt: (item.final_prompt || '').trim(),
        key: (item.key || item.name || `item_${buffer.length + 1}`).trim(),
        confidence: item.confidence || 'medium',
      })
    }
    logTaskSuccess('ImportTool', 'submit-candidates', { count: buffer.length })
    return {
      message: `已接收 ${buffer.length} 条导入候选（尚未入库）`,
      count: buffer.length,
    }
  },
})

export const importTools = {
  submitImportCandidates,
}


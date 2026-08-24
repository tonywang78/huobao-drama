/**
 * 分镜文件导入 Agent 工具
 * 仅收集候选到 RequestContext，不写库；确认入库由服务层完成
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { getStoryboardImportBuffer } from '../context.js'
import { logTaskSuccess } from '../../utils/task-logger.js'

const storyboardCandidateSchema = z.object({
  key: z.string().describe('Stable id from the source file, e.g. s01_01_peninsula'),
  title: z.string().describe('Readable shot title'),
  description: z.string().describe('Chinese shot/camera description (no English I2V)'),
  video_prompt: z.string().describe('English I2V / motion prompt; empty if missing'),
  duration: z.number().optional().describe('Duration in seconds from title like (4s)'),
  atmosphere: z.string().optional().describe('Optional mood / atmosphere'),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
})

export type StoryboardImportCandidate = z.infer<typeof storyboardCandidateSchema>

const submitStoryboardCandidates = createTool({
  id: 'submit_storyboard_candidates',
  description:
    'Submit all parsed storyboard/shot candidates from the uploaded markdown/text. Call once with the full list. Does not save to database.',
  inputSchema: z.object({
    candidates: z.array(storyboardCandidateSchema).describe('All parsed shots from the file, in order'),
  }),
  execute: async ({ candidates }, context) => {
    const buffer = getStoryboardImportBuffer(context?.requestContext)
    if (!buffer) {
      return { error: 'Missing storyboard import buffer in request context' }
    }
    buffer.length = 0
    for (const item of candidates) {
      const durationRaw = item.duration
      const duration = typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0
        ? Math.round(durationRaw * 10) / 10
        : undefined
      buffer.push({
        ...item,
        key: (item.key || item.title || `shot_${buffer.length + 1}`).trim(),
        title: (item.title || '').trim(),
        description: (item.description || '').trim(),
        video_prompt: (item.video_prompt || '').trim(),
        atmosphere: (item.atmosphere || '').trim() || undefined,
        duration,
        confidence: item.confidence || 'medium',
      })
    }
    logTaskSuccess('StoryboardImportTool', 'submit-candidates', { count: buffer.length })
    return {
      message: `已接收 ${buffer.length} 条分镜候选（尚未入库）`,
      count: buffer.length,
    }
  },
})

export const storyboardImportTools = {
  submitStoryboardCandidates,
}

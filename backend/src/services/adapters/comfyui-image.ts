/**
 * ComfyUI 图片生成 Adapter
 * POST /prompt → 轮询 GET /history/{prompt_id} → GET /view 下载
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import {
  buildComfyHistoryRequest,
  buildComfyPromptRequest,
  isEmptyComfyHistory,
  isComfyPromptQueued,
  parseComfyHistory,
  parseComfyPromptResponse,
  parseSize,
  parseUrlList,
} from './comfyui-common'

export class ComfyUIImageAdapter implements ImageProviderAdapter {
  provider = 'comfyui'

  async buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): Promise<ProviderRequest> {
    const { width, height } = parseSize(record.size)
    const refs = parseUrlList(record.referenceImages)
    return buildComfyPromptRequest(
      config,
      'image',
      {
        prompt: record.prompt,
        negativePrompt: '',
        width,
        height,
        seed: Math.floor(Math.random() * 2 ** 32),
      },
      refs,
    )
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    return parseComfyPromptResponse(result)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return buildComfyHistoryRequest(config, taskId)
  }

  async parsePollResponse(result: any, config?: AIConfig, taskId?: string): Promise<ImagePollResponse> {
    if (!config || !taskId) return { status: 'processing' }
    if (isEmptyComfyHistory(result)) {
      const queued = await isComfyPromptQueued(config, taskId)
      if (!queued) {
        return { status: 'failed', error: 'ComfyUI 任务已取消或不存在（history 为空且不在队列中）' }
      }
      return { status: 'processing' }
    }
    const parsed = parseComfyHistory(result, taskId, config, false)
    if (parsed.status === 'completed') {
      return { status: 'completed', imageUrl: parsed.mediaUrl }
    }
    if (parsed.status === 'failed') {
      return { status: 'failed', error: parsed.error }
    }
    return { status: 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return null
  }

  extractImageBase64(_result: any): { data: string; mimeType: string } | null {
    return null
  }
}

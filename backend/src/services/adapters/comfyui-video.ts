/**
 * ComfyUI 视频生成 Adapter
 * 与图片共用 /prompt + /history + /view；默认 API workflow 为可替换的骨架模板。
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import {
  buildComfyHistoryRequest,
  buildComfyPromptRequest,
  cancelComfyRemoteTask,
  hasFirstLastFrameInjection,
  isEmptyComfyHistory,
  isComfyPromptQueued,
  parseComfyHistory,
  parseComfyPromptResponse,
  parseUrlList,
  uploadReferenceImages,
} from './comfyui-common'

export class ComfyUIVideoAdapter implements VideoProviderAdapter {
  provider = 'comfyui'

  async buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): Promise<ProviderRequest> {
    const isFirstLast = record.referenceMode === 'first_last' || config.serviceType === 'first_last'
    if (isFirstLast) {
      if (!hasFirstLastFrameInjection(config)) {
        throw new Error('请在设置中为该 ComfyUI 首尾帧配置绑定首帧和尾帧节点')
      }
      const firstFrame = (record.firstFrameUrl || record.imageUrl || '').trim()
      const lastFrame = (record.lastFrameUrl || '').trim()
      if (!firstFrame || !lastFrame) {
        throw new Error('首尾帧模式必须同时提供 first_frame_url 和 last_frame_url')
      }
      const [firstName] = await uploadReferenceImages(config, [firstFrame])
      const [lastName] = await uploadReferenceImages(config, [lastFrame])
      return buildComfyPromptRequest(
        config,
        'first_last',
        {
          prompt: record.prompt,
          negativePrompt: '',
          seed: Math.floor(Math.random() * 2 ** 32),
          duration: record.duration,
          aspectRatio: record.aspectRatio,
          firstFrame: firstName,
          lastFrame: lastName,
        },
        [],
      )
    }

    const uniqueRefs = [...new Set(parseUrlList(record.referenceImageUrls).map((u) => u.trim()).filter(Boolean))]

    return buildComfyPromptRequest(
      config,
      'video',
      {
        prompt: record.prompt,
        negativePrompt: '',
        seed: Math.floor(Math.random() * 2 ** 32),
        duration: record.duration,
        aspectRatio: record.aspectRatio,
      },
      uniqueRefs,
    )
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    return parseComfyPromptResponse(result)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return buildComfyHistoryRequest(config, taskId)
  }

  async parsePollResponse(result: any, config?: AIConfig, taskId?: string): Promise<VideoPollResponse> {
    if (!config || !taskId) return { status: 'processing' }
    if (isEmptyComfyHistory(result)) {
      const queued = await isComfyPromptQueued(config, taskId)
      if (!queued) {
        return { status: 'failed', error: 'ComfyUI 任务已取消或不存在（history 为空且不在队列中）' }
      }
      return { status: 'processing' }
    }
    const parsed = parseComfyHistory(result, taskId, config, true)
    if (parsed.status === 'completed') {
      return { status: 'completed', videoUrl: parsed.mediaUrl }
    }
    if (parsed.status === 'failed') {
      return { status: 'failed', error: parsed.error }
    }
    return { status: 'processing' }
  }

  extractVideoUrl(_result: any): string | null {
    return null
  }

  async cancelRemoteTask(config: AIConfig, taskId: string): Promise<void> {
    await cancelComfyRemoteTask(config, taskId)
  }
}

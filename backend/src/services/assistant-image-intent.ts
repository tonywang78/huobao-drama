/**
 * 助手图生图兜底意图判定（纯函数，无 DB/IO）
 */

/** 明确改图 / 图生图意图（避免单字「改」误伤字段编辑） */
const IMAGE_EDIT_HINT = /去掉|删除|移除|改图|图生图|换背景|换衣服|换发型|换姿势|换风格|美化|放大|缩小|变暗|改暗|变亮|改亮|remove|crop|blur|enhance|img2img|edit[\s_-]?image|把人|背景改|颜色改/i

/** 资产文本字段编辑意图 — 命中且非明确改图时禁止走图生图兜底 */
const FIELD_EDIT_HINT = /外貌|样貌|造型|描述|字段|提示词|final[_\s-]?prompt|appearance|styling|description|人设|设定|身份|\brole\b|lighting|灯光|改名|名称|地点/i

export function looksLikeImageEditIntent(text: string): boolean {
  return IMAGE_EDIT_HINT.test(text || '')
}

export function looksLikeFieldEditIntent(text: string): boolean {
  return FIELD_EDIT_HINT.test(text || '')
}

export function shouldDirectImageEdit(opts: {
  text: string
  stripped: string
  hasGeneratedRef: boolean
  hasAssetRef: boolean
  hasAttachment: boolean
  hasLatestGenerated: boolean
  /** 模型已生图但未带用户参考图时，允许强制用参考图重入队 */
  forceForRefFallback?: boolean
}): boolean {
  const fieldish = looksLikeFieldEditIntent(opts.stripped) || looksLikeFieldEditIntent(opts.text)
  const editish = looksLikeImageEditIntent(opts.stripped) || looksLikeImageEditIntent(opts.text)

  // 改外貌/描述/提示词等：除非同时说了改图/换背景等，否则绝不自动生图
  if (fieldish && !editish) return false

  if (opts.forceForRefFallback) return true

  return (opts.hasGeneratedRef && editish)
    || (opts.hasAssetRef && editish)
    || (opts.hasAttachment && editish)
    || (!opts.hasGeneratedRef && !opts.hasAssetRef && opts.hasLatestGenerated && editish)
}

/** 本轮已成功写库且未生图时，跳过图生图兜底（避免改字段被拽去生图） */
export function shouldSkipDirectImageEditFallback(opts: {
  imageTasksLength: number
  needsRefFallback: boolean
  didWrite: boolean
}): boolean {
  void opts.needsRefFallback
  return opts.didWrite && opts.imageTasksLength === 0
}

---
name: default
description: 默认视频引擎 — 无额外约束，仅遵守底座 video-prompt；由 settings.videoEngine=default 选用
---

# 引擎增量：default

无额外引擎约束。严格遵守底座 `video-prompt` skill（3 秒分段、`@` 引用、对齐【镜头N】、中文）。

适用于：未标注 `videoEngine` 的 ComfyUI 配置，或其他未映射的 provider。

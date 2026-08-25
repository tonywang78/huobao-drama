---
name: seedance
description: Seedance / 火山视频引擎增量规范 — 云端 Seedance 与 Comfy·Seedance 共用；由 settings.videoEngine 选用，不随 Agent 全局注入
---

# 引擎增量：seedance

在底座 `video-prompt` 之上追加；冲突时以本文件为准。

## 适用

- provider=`volcengine`（Seedance 系列）
- provider=`comfyui` 且 `settings.videoEngine=seedance`

## 增量要求

- **景别与运镜清晰**：每段写明近景/中景/全景/特写与固定/推/拉/摇/跟；切镜后重新交代景别与主体。
- **空间建立**：第一段必须建立场景位置与角色状态，便于多模态参考对齐。
- **引用**：`@场景名` / `@角色名` / `@道具名` 与列表完全一致；每段至少一个 @ 锚定。
- **节奏**：按底座 3 秒分段，总时长对齐 `duration`；内容节奏「建立 → 推进 → 落点」。
- **语言**：保持中文连贯描述，不要分点、不要混入英文风格词。

## 禁止

- 不要跨场景、闪回。
- 不要写抽象心理或文学比喻；只写可见画面与动作。

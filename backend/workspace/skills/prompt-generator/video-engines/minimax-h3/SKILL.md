---
name: minimax-h3
description: MiniMax H3 视频引擎增量规范 — 云端 MiniMax 与 Comfy·MiniMax 共用；由 settings.videoEngine 选用，不随 Agent 全局注入
---

# 引擎增量：minimax-h3

在底座 `video-prompt` 之上追加；冲突时以本文件为准。

## 适用

- provider=`minimax`（官方 / 火宝代理）
- provider=`comfyui` 且 `settings.videoEngine=minimax-h3`

## 增量要求

- **多参考图锚定**：分镜已绑定的场景/角色/道具用 `@名字` 精确引用；生成阶段会替换为 `@图片N名字`，名字必须与列表完全一致。
- **动作优先**：H3 对可见动作、表情、运镜更敏感；每段一个主动作，避免抽象情绪词。
- **节奏**：按底座 3 秒分段；总时长与分镜 `duration` 对齐。段落内切镜用「切到/切回」明确衔接触点。
- **对白**：台词写在对应时间段内，过长拆段；无对白可写短环境音/动作音。
- **语言**：保持中文（与底座一致），不要改成英文提示词。

## 禁止

- 不要写厂商 API 字段名或英文技术标签（如 `reference_image`、`first_frame`）。
- 不要假设首帧/尾帧语法；参考图由系统按数组顺序注入。

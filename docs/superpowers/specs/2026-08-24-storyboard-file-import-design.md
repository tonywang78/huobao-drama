# 分镜文件导入（MD/TXT）

## 目标

支持上传运镜/分镜 md/txt（或粘贴文本），经 storyboard_importer Agent + Skill 解析为镜头候选；用户勾选并选择「替换本集 / 追加末尾」后再写入分镜。

## 流程

1. `POST /episodes/:id/storyboards/import/parse` — Agent 解析，返回 candidates（不写库）
2. 前端勾选、可预览 description / video_prompt；选择 mode：`replace` | `append`
3. `POST /episodes/:id/storyboards/import/confirm` — 按 mode 创建分镜

## 字段映射

| 源（运镜设计 MD） | 分镜字段 |
|------------------|----------|
| 运镜 + 构图 + 意图等中文 | `description` |
| I2V 英文句 | `video_prompt` |
| 标题中的秒数 | `duration`（缺省 10） |
| 段情绪（可选） | `atmosphere` |

总原则 / 节奏总谱 / 剪辑提示 / 验收不成条。

## 冲突策略

确认页可选：

- **replace**：清空本集分镜（含角色/道具绑定与相关 sys_task）后按序插入
- **append**：从 `max(storyboard_number)+1` 起追加

## 入口

剧集工作台 · 分镜拆分：工具栏「导入」+ 空状态「导入文件」

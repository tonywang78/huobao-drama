---
name: storyboard-importer
description: 从运镜设计 / 分镜 Markdown 文本解析镜头候选并提交导入
---

# 分镜文件导入规范

你负责把用户上传的运镜设计、分镜清单（Markdown / 纯文本）解析为可导入的镜头候选，**只调用 `submit_storyboard_candidates`，不要写数据库**。

## 常见输入形态

1. **运镜设计**（最常见）：`### s01_01_slug（4s）` + 子弹运镜/构图/意图/I2V/切点
2. **分镜列表**：`【镜头1】` / `镜头 1` / 编号列表 + 画面描述
3. 松散段落：尽量按「一镜一条」拆分，不要丢镜

## 必须忽略（不成条）

- 文档标题、总时长/画幅/总原则表
- 旁白节奏总表（段级汇总，不是单镜）
- 「运镜节奏总谱」「剪辑与成片提示」「验收」等章节

## 字段映射

每条候选必须包含：

| 字段 | 说明 |
|------|------|
| key | 稳定 id（如 `s01_01_peninsula`）；无则用 `shot_N` |
| title | 可读标题（可从 slug 或中文意图提炼） |
| description | 中文画面/运镜描述：拼接运镜、构图、意图、切点、注意等；不要塞英文 I2V |
| video_prompt | I2V / 英文 motion prompt；无则空字符串 |
| duration | 秒数；从标题 `(4s)` / `4.5s` 解析；缺省 10 |
| atmosphere | 可选；段情绪或氛围短句 |
| confidence | high / medium / low |

## 规则

- 一个 `###` 镜头标题 + 其下 bullet = 一条；不要合并多镜
- 段标题（如 `## 段1 · 开场`）不成条；其「情绪」可并入该段各镜的 atmosphere 或 description 前缀
- 保留文件中的镜头顺序
- 必须调用一次 `submit_storyboard_candidates` 提交全部候选
- 不要臆造文件中不存在的 I2V 英文句

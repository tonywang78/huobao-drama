---
name: asset-importer
description: 从 Markdown/文本文件解析角色、场景、道具并输出导入候选
---

# 资产文件导入规范

你负责把用户上传的 Markdown / 纯文本清单解析为可导入的资产候选，**只调用 `submit_import_candidates`，不要写数据库**。

## 常见输入形态

1. **出图 Prompt 清单**（最常见）：`### id_name` + 中文说明 + ```英文 prompt```
2. **角色卡**：标题或正文含「角色 / 人物 / Character」
3. **道具清单**：含「道具 / 物品 / Prop」
4. 其他松散列表：尽量按条目拆分，不要丢条目

## 类型判定

- 条目或其小节标题含「角色」「人物」「Character」→ `character`
- 含「道具」「物品」「Prop」→ `prop`
- **其余默认 `scene`**（旅顺口一类出图 prompt 清单全部按场景）

## 字段映射

每条候选必须包含：

| 字段 | 说明 |
|------|------|
| key | 稳定 id（如 `s01_01_peninsula`）；无则用 slug(name) |
| type | character / scene / prop |
| name | 展示名；场景可用中文地点名 |
| summary | 中文摘要（标题下说明）；写入 appearance / prompt / description |
| final_prompt | 英文代码块全文；写入 final_prompt |
| confidence | high / medium / low |

可选：role、styling（角色）；location、time、lighting（场景）；prop_type（道具）。

## 规则

- 统一风格锚点 / 文档前言不要单独成条，可并入各条 final_prompt 前文（若条目本身未写风格）
- 一个 ### + 一个代码块 = 一条；不要合并多条
- 必须调用一次 `submit_import_candidates` 提交全部候选
- 不要臆造文件中不存在的英文 prompt


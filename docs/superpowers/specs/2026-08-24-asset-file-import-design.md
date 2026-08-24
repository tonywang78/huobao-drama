# 资产文件批量导入（MD/TXT）

## 目标

支持上传 md/txt（或粘贴文本），经 asset_importer Agent + Skill 解析为角色/场景/道具候选；用户勾选后再入库。中文摘要写入描述字段，英文 prompt 写入 final_prompt。

## 流程

1. POST /dramas/:id/assets/import/parse — Agent 解析，返回 candidates（不写库）
2. 前端勾选、可改类型
3. POST /dramas/:id/assets/import/confirm — 批量创建/去重更新；可选 episode_id 挂集

## 分类

- 含「角色 / 人物 / Character」等 → character
- 含「道具 / 物品 / Prop」等 → prop
- 其余默认 scene

## 入口

- 剧集工作台 · 资产：导入并挂当前集
- 项目详情 · 素材库：仅进项目库

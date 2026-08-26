# ComfyUI 部署参考

本目录下的 `*.ui.json` 为 **ComfyUI 完整 UI workflow**，仅供在 ComfyUI 中导入、对照节点与部署模型，**不会被火宝后端加载**。

运行时实际提交的是 **API 格式** workflow：

- 内置默认：`backend/src/services/adapters/comfyui/workflows/*.api.json`
- 或设置页里粘贴的自定义 API JSON（存入 AI 配置的 `settings.workflowApi`）

当前仓库内置默认 API JSON 面向 **MiniMax H3**（24GB 量化栈），详见下方「默认模型文件」。  
**代码侧只做通用占位符 / bindings 注入，不依赖具体模型名或节点类型。**

视频提示词（`video_prompt`）按配置 `settings.videoEngine` 选择引擎规则（`minimax-h3` / `seedance` / `default`），与 workflow 解耦。  
**ComfyUI 视频配置请把 `videoEngine` 设成与底层节点栈一致**（例如 MiniMax H3 workflow → `minimax-h3`）；未设置时 Comfy 回退为 `default`，不会仅因配置名含 MiniMax 而走 H3 规则。

## 参数绑定（推荐）

设置页支持「解析 API JSON → Source→Pin 绑定」，结果写入配置 `settings.bindings`，运行时优先于 `{{PLACEHOLDER}}`。

参考图：运行时是 URL **数组**（上传后变成文件名）。绑定 UI 会按 workflow 里的 `LoadImage` 数量（或 `{{IMAGE_N}}`）动态生成 `image_1…image_N` 槽位，**上限 9**；每个槽位应对一个 `LoadImage.image`。视频侧数组顺序一般为：场景 → 角色… → 道具… → 手动上传。

```json
{
  "workflowApi": { "...": "API prompt 对象" },
  "bindings": {
    "prompt": { "nodeId": "7", "input": "prompt" },
    "image_1": { "nodeId": "12", "input": "image" },
    "output": { "nodeId": "16", "input": "auto" }
  }
}
```

`bindings.output` 指定 history 结果取自哪个节点、哪个通道（`images` / `gifs` / `videos` / `auto`）。未配置时仍自动取首个媒体。

**首尾帧服务**（`service_type: first_last`）使用独立绑定源，**不要**把两帧塞进 `image_1…N`：

```json
{
  "bindings": {
    "prompt": { "nodeId": "7", "input": "prompt" },
    "first_frame": { "nodeId": "17", "input": "image" },
    "last_frame": { "nodeId": "18", "input": "image" },
    "output": { "nodeId": "16", "input": "auto" }
  }
}
```

运行时两帧分别上传后写入对应 LoadImage。请把这两个 LoadImage 接到图生视频节点；代码不写死具体节点字段名。

## 占位符（兼容兜底）

在 API JSON 的节点 `inputs` 中使用：

| 占位符 | 说明 |
|--------|------|
| `{{PROMPT}}` | 正向提示词 |
| `{{NEGATIVE_PROMPT}}` | 负向提示词 |
| `{{WIDTH}}` / `{{HEIGHT}}` | 宽高 |
| `{{SEED}}` | 随机种子 |
| `{{IMAGE_1}}` … | 参考图上传后的文件名 |
| `{{FIRST_FRAME}}` / `{{LAST_FRAME}}` | 首尾帧服务：两帧上传后的文件名 |
| `{{DURATION}}` / `{{ASPECT_RATIO}}` | 视频参数 |

## 默认模型文件（MiniMax H3 / 3090 24GB）

| 文件 | 目录 |
|------|------|
| `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `models/diffusion_models/` |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `models/text_encoders/` |
| `minimax_h3_video_vae_fp16.safetensors` | `models/vae/` |
| `minimax_h3_audio_vae_fp32.safetensors` | `models/vae/`（视频） |
| `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | `models/loras/` |

下载：[Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)。需要 ComfyUI ≥ 0.30.0。

- 图片默认：最短 `length=5` → 解码取首帧 `SaveImage`
- 视频默认：T2V ≈5s（`length=124`）→ `CreateVideo` + `SaveVideo`
- 图生视频等：在设置页覆盖自己的 API JSON，勿改通用 adapter 代码

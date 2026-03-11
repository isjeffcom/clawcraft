# Assets Pipeline

Clawcraft 当前默认以程序化渲染和数据驱动内容为主，避免运行时强依赖在线素材生成。

## Kenney

后续如引入 Kenney 2D 开源素材，建议放在：

```text
resources/assets/kenney/
```

并在 `THIRD_PARTY_NOTICES.md` 中补充具体素材包名称与许可证。

## PixelLab

仓库已提供可选脚本：

```bash
PIXELLAB_API_KEY=your_key npm run pixellab:image -- \
  --description "top-down pixel lobster admin in blue scarf" \
  --output resources/assets/generated/lobster-admin.json
```

脚本当前会将 PixelLab API 返回结果保存为 JSON，方便后续二次处理、提取 base64 图像或制作资源管线。

出于安全原因：

- API Key 不会写入仓库
- 运行时不会强依赖 PixelLab
- 所有在线生成内容都应先离线落盘，再手动纳入版本控制

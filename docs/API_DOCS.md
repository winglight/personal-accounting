# 智谱 AI 接入说明

应用直接调用智谱 BigModel 的 OpenAI 兼容接口，不再依赖原有的本地 `/chat` 代理。

## 默认配置

| 配置 | 默认值 |
|---|---|
| API 地址 | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| 文本模型 | `glm-5.3-flash` |
| 图片模型 | `glm-4.6v-flashx` |
| 鉴权 | `Authorization: Bearer <API Key>` |

以上配置可在“设置 → AI 记账”中修改。API Key 会随应用数据保存在当前浏览器的 LocalStorage；不要在不受信任或多人共用的设备上保存生产密钥。

## 文本请求

文本解析以普通 `user` 消息发送，模型被要求仅返回记账 JSON。应用支持 SSE 流式返回，并从 `choices[0].delta.content` 组合完整内容。

## 图片请求与本地预处理

小票不会直接以上传时的原始尺寸发送。浏览器会先完成：

1. 按 EXIF 方向解码图片；
2. 限制短边 1400 px、长边 4000 px、总像素 400 万；
3. 转为灰度图；
4. 以 `0.86`、`0.82`、`0.78` 的 JPEG 质量逐级尝试压缩；
5. 将约 700 KB 作为软目标，2 MB 作为发送硬上限；
6. 仅将处理后的 JPEG Data URI 作为 `image_url` 内容发送给视觉模型。

原始图片只参与本地处理，不会默认上传。无法由浏览器解码的 HEIC 图片会提示用户先转换为 JPEG；特别长的小票建议裁剪或分段拍摄。

## 请求结构

```json
{
  "model": "glm-4.6v-flashx",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } },
        { "type": "text", "text": "请按给定 JSON 结构识别小票" }
      ]
    }
  ],
  "stream": true,
  "temperature": 0.1
}
```

所有 AI 调用都强制使用 SSE 流式响应，并要求响应类型为 `text/event-stream`。输出长度由智谱模型和服务端默认配置决定，应用不再提供非流式回退。

连接检测会使用同一 API Key 请求 `/models` 验证鉴权；它不会生成内容或消耗生成 token。如果配置的模型未出现在账号返回的模型列表中，页面会保留“连接正常”并给出模型权限提示，因为部分模型可能不通过该列表公开。页面本身也不会周期性调用模型做健康检查。

## 本地调用日志

AI 日志只保存在当前浏览器的 LocalStorage 中，不上传 R2，也不按日期长期归档。一次请求及其返回结果合并为一条调用日志，最多保留最近 3 条；新日志写入时自动淘汰最旧记录。图片调用只记录文件尺寸、分辨率、类型和哈希等元数据，不保存图片内容。旧版按日期保存的 `ai_logs_*` 数据会在读取新日志时清理。

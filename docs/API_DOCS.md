# AI Web to API - API 调用文档

本文档详细说明如何调用 AI Web to API 后端接口，包括文本对话、发送图片以及会话管理。

## 1. 基础信息

- **API 地址**: `http://localhost:8000` (默认)
- **请求方式**: HTTP POST
- **接口路径**: `/chat`
- **Content-Type**: `application/json`

## 2. 接口定义

### 2.1 发送聊天请求

**Endpoint**: `/chat`

**Request Body (JSON)**:

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `messages` | List[Object] | 是 | 消息列表，通常只需要包含最新的一条消息即可（因为网页端会自动保持上下文） |
| `model` | String | 否 | 模型名称，默认为 "gpt-4" (目前仅作透传，具体取决于网页端选择的模型) |
| `stream` | Boolean | 否 | 是否流式返回 (默认为 False)。如果为 True，将返回 `application/x-ndjson` 格式的流式数据。 |
| `is_new_session` | Boolean | 否 | 是否开启新会话 (默认为 True)。如果为 True，插件会尝试点击网页上的 "New Chat" 按钮，开启一个新的对话上下文。 |

**Message Object**:

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `role` | String | 是 | 角色，通常为 "user" |
| `content` | String | 是 | 文本内容 |
| `image_data` | String | 否 | Base64 编码的图片数据 (Data URI 格式，例如 `data:image/png;base64,...`) |
| `image_url` | String | 否 | 图片 URL (备用字段，目前主要使用 image_data) |

**Response (JSON)**:

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | String | 请求 ID |
| `content` | String | AI 返回的文本内容 |
| `status` | String | 状态，成功为 "success" |

**Response (Stream)**:

当 `stream=True` 时，接口返回 Content-Type 为 `application/x-ndjson` 的流式数据。
每一行是一个独立的 JSON 对象。

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `content` | String | 增量文本内容 (Delta) |
| `error` | String | 如果发生错误，会返回包含 error 字段的 JSON |

示例数据流:
```json
{"content": "你好"}
{"content": "，"}
{"content": "我是"}
{"content": "AI"}
```

### 2.2 服务健康检查

**Endpoint**: `/healthz`

**Request Method**: `GET`

**Response (JSON)**:

```json
{
  "status": "ok"
}
```

## 3. 会话管理 (Session)

本系统通过浏览器插件控制网页端（如 ChatGPT）来实现 API 功能。

- **创建 Session**: 实际上是指在浏览器中打开目标 AI 网页（如 chatgpt.com），并确保插件已连接到后端。
- **保持 Session**: 网页端本身会保持会话上下文。API 调用时，插件会将最新的消息输入到当前的网页对话框中。因此，你不需要在 API 请求中携带完整的历史记录，只需要发送**最新的一条消息**，网页端会自动将其视为当前会话的延续。
- **开启新会话**: 可以通过在 API 请求中设置 `is_new_session: true` 来自动开启新会话。插件会尝试点击网页上的 "New Chat" 按钮。

## 4. Python 调用示例

以下是一个完整的 Python 示例，包含：
1. 发送普通文本消息
2. 发送带图片的消息 (多模态)
3. 模拟连续对话

首先安装依赖:
```bash
pip install requests
```

### 4.1 完整 Demo 代码

```python
import requests
import base64
import json
import os

# API 地址
API_URL = "http://localhost:8000/chat"

def send_chat(text, image_path=None):
    """
    发送聊天请求
    :param text: 文本提示词
    :param image_path: 图片路径 (可选)
    :return: AI 的回复
    """
    message = {
        "role": "user",
        "content": text
    }

    # 如果有图片，转换为 Base64
    if image_path:
        if os.path.exists(image_path):
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                # 自动识别 mime type 比较复杂，这里简单假设为 png 或 jpg
                mime_type = "image/png" if image_path.endswith(".png") else "image/jpeg"
                message["image_data"] = f"data:{mime_type};base64,{encoded_string}"
                print(f"[INFO] 已加载图片: {image_path}")
        else:
            print(f"[WARN] 图片不存在: {image_path}")

    payload = {
        "messages": [message],
        "model": "gpt-4"
    }

    try:
        print(f"正在发送请求: {text[:20]}...")
        response = requests.post(API_URL, json=payload, timeout=120) # 设置较长超时以等待网页生成
        response.raise_for_status()
        
        result = response.json()
        content = result.get("content", "")
        print("-" * 30)
        print(f"AI 回复:\n{content}")
        print("-" * 30)
        return content

    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")
        return None

if __name__ == "__main__":
    # 1. 简单的文本对话 (Session 1)
    print(">>> 测试文本对话")
    send_chat("你好，请做一个简单的自我介绍。")

    # 2. 连续对话 (Session 1 继续)
    # 因为是控制同一个网页 Tab，所以直接发送下一句即可，上下文由网页保持
    print("\n>>> 测试连续对话")
    send_chat("刚才我问了什么？")

    # 3. 发送图片 (多模态)
    # 请确保目录下有一张名为 test_image.png 的图片，或者修改路径
    print("\n>>> 测试图片分析")
    # 创建一个简单的测试图片（如果不存在）
    if not os.path.exists("test_image.png"):
        print("未找到测试图片，跳过图片测试。")
    else:
        send_chat("这张图片里有什么？请详细描述。", "test_image.png")
```

### 4.2 流式调用示例

```python
import requests
import json

API_URL = "http://localhost:8000/chat"

def chat_stream(text):
    payload = {
        "messages": [{"role": "user", "content": text}],
        "stream": True,
        "is_new_session": True
    }
    
    print(f"正在发送请求 (流式): {text}...")
    try:
        with requests.post(API_URL, json=payload, stream=True) as response:
            response.raise_for_status()
            
            print("-" * 30)
            print("AI 回复:")
            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if "content" in data:
                            print(data["content"], end="", flush=True)
                        elif "error" in data:
                            print(f"\n[ERROR] {data['error']}")
                    except json.JSONDecodeError:
                        pass
            print("\n" + "-" * 30)
            
    except Exception as e:
        print(f"请求失败: {e}")

if __name__ == "__main__":
    chat_stream("请写一首关于春天的短诗")
```

## 5. 注意事项

1. **超时设置**: 网页生成回答可能需要较长时间，建议将 API 调用的超时时间设置长一些（如 60-120秒）。
2. **浏览器状态**: 确保浏览器已打开目标网页，且插件图标显示为"已连接"状态。
3. **输入框焦点**: 插件会尝试自动定位输入框，但如果网页结构更新可能会失效。
4. **图片上传**: 图片上传依赖于网页的文件上传控件，不同网页的实现可能不同。

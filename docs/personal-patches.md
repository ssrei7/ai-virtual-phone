# 个人功能补丁与上游同步说明

本文件记录 `ssrei7/ai-virtual-phone` 相对官方仓库保留的个人功能，便于同步上游、解决冲突、重新部署和后续维护。

> 维护原则：个人功能保留在本 fork 的 Git 提交中；同步官方更新使用合并，不使用强制覆盖或重置。

## 当前个人功能

### 1. MOSI 语音服务商

在「设置 → 语音 API」中增加 `MOSI 语音`，复用现有角色语音绑定、试听、聊天朗读和语音通话链路。

主要能力：

- 默认 Base URL：`https://api.mosi.cn/v1`
- 支持模型：
  - `moss-tts-1.5-flash`
  - `moss-tts-1.0-pro`
  - 手动填写 Snapshot ID
- 手动填写 MOSI Voice ID
- 使用用户在本机语音设置中填写的 API Key
- API Key 不写入仓库或环境变量
- 支持语音配置页试听
- 支持 Windows Chrome 与 iPhone Safari 播放

MOSI 浏览器接口会拒绝带 `Authorization`、`Content-Type` 的 CORS 预检请求，因此不能由浏览器直接调用。当前实现通过本站 Next.js API Route 转发请求。

语音生成使用 MOSI 官方异步任务流程：

1. `POST /v1/audio/speech`，传入 `async: true`、`delivery_method: "url"`；
2. 读取服务端返回的 `task_id`；
3. 按 `retry_after` 轮询 `GET /v1/audio/tasks/{task_id}`；
4. 状态从 `PENDING`、`PROCESSING` 进入 `SUCCESS`；
5. 读取成功任务顶层的 `url`；
6. 由本站服务端下载音频并返回浏览器。

相关文件：

- `app/api/voice/mosi/route.ts`
- `lib/tts-service.ts`
- `components/settings/voice-settings.tsx`

相关个人提交（以仓库实际历史为准）：

- `feat: add MOSI voice provider`
- `fix: improve MOSI audio playback compatibility`
- `fix: proxy MOSI TTS requests to avoid browser CORS preflight`
- `fix: use MOSI async speech tasks to avoid CORS and function timeout`
- `fix: make voice preview compatible with iPhone Safari`

### 2. 聊天消息朗读、缓存与下载

角色发送的普通文字消息下方增加手动朗读功能。用户自己发送的消息默认不显示朗读按钮。

主要能力：

- 使用当前角色绑定的语音配置；
- 支持现有 TTS provider，包括 Minimax、OpenAI 和本 fork 的 MOSI；
- 第一次朗读时调用 TTS；
- 音频生成后保存到独立 IndexedDB；
- 同一消息、文本、配置、模型和 Voice ID 下重复播放不再调用 TTS；
- 新消息开始播放时停止上一条朗读；
- 生成期间防止同一条消息重复请求；
- 缓存存在后允许下载音频；
- 「设置 → 语音 API」显示缓存数量与占用空间；
- 支持手动清空全部朗读缓存；
- 清空缓存不删除聊天记录，但再次朗读会重新调用 TTS。

缓存指纹包含：

- 消息 ID
- 清洗后的朗读文本
- TTS 配置 ID
- Provider
- 模型
- Voice ID
- 音频格式

相关文件：

- `components/chat/message-bubble.tsx`
- `lib/chat-tts-cache.ts`
- `components/settings/voice-settings.tsx`
- `lib/tts-service.ts`（复用现有合成和播放能力）

相关个人提交（以仓库实际历史为准）：

- `feat: add chat message read aloud with caching and download`

## 个人测试记录

目前已测试：

- Windows Chrome：MOSI 接入正常；语音配置试听正常；聊天朗读正常。
- iPhone Safari：MOSI 接入正常；语音配置试听正常；聊天朗读正常。

尚未测试：

- Android Chrome / WebView
- macOS Safari
- Firefox
- Edge
- 其他 iOS 浏览器或 PWA 组合

## 同步官方更新时会不会提醒冲突

会。正常使用 GitHub 的 Sync fork 或合并上游时，结果分为两种：

### 无冲突

GitHub 会直接完成同步，官方更新和个人提交都会保留。同步不会主动删除本 fork 的个人功能。

### 有冲突

GitHub 会拒绝自动同步或提示分支存在 conflicts。仓库会保持同步前状态，不会静默覆盖个人文件。需要手动解决冲突后再提交。

常见提示包括：

- `This branch has conflicts that must be resolved`
- `Can't automatically merge`
- `Sync failed due to conflicts`
- Git 命令行中的 `CONFLICT (content)` 或 `CONFLICT (add/add)`

Netlify 只负责部署 GitHub 中已经提交的版本。GitHub 冲突尚未解决时，通常不会产生新的同步提交，线上旧版本会继续运行。

## 高风险冲突文件

官方更新如果修改以下文件，最需要检查个人功能是否仍然完整：

- `lib/tts-service.ts`
- `components/settings/voice-settings.tsx`
- `components/chat/message-bubble.tsx`

以下是本 fork 新增文件，除非官方新增同名文件，一般不容易产生内容冲突：

- `app/api/voice/mosi/route.ts`
- `lib/chat-tts-cache.ts`

如果官方也新增同名文件，Git 可能产生 `add/add` 冲突，需要人工合并两边实现。

## 推荐的同步流程

1. 确认当前个人改动已经提交到 `ssrei7/ai-virtual-phone`，不要带着未提交改动同步。
2. 在 GitHub 或工坊中检查 fork 与官方仓库的领先/落后状态。
3. 使用正常的 Sync fork / 合并上游，不要执行强制重置。
4. 如果提示冲突，先查看冲突文件，不要直接选择“全部使用 upstream”。
5. 解决冲突时保留官方新逻辑，并把本文件记录的 MOSI 与朗读功能重新接入新结构。
6. 完成合并后检查构建与部署日志。
7. 使用下方验收清单回归测试。

## 同步后的验收清单

### MOSI 配置与试听

- 「设置 → 语音 API」仍能选择 `MOSI 语音`；
- Base URL、模型和 Voice ID 可以保存；
- 试听会请求本站 `/api/voice/mosi`；
- 浏览器不再直接向 `api.mosi.cn` 发起 CORS 预检；
- Windows Chrome 可以试听；
- iPhone Safari 可以试听。

### MOSI 异步任务

- 创建请求返回 `task_id`；
- `PENDING` / `PROCESSING` 会继续轮询；
- `SUCCESS` 后能取得并播放音频；
- `FAILED` 时能显示错误而不是无限等待；
- Netlify Function 没有长时间同步等待 MOSI 生成。

### 聊天朗读

- 角色普通文字消息显示「朗读」；
- 用户消息默认不显示朗读；
- 首次朗读能够生成并播放；
- 第二次显示「播放」并复用缓存；
- 播放另一条消息会停止上一条；
- 缓存音频可以下载；
- 「设置 → 语音 API」能看到缓存数量和空间；
- 清空缓存不会删除聊天消息。

## 发生冲突时的处理原则

不要简单对整个文件选择：

- `Accept incoming changes`
- `Use upstream version`

这样可能删除个人功能。

应按功能点逐段合并：

1. 以官方最新代码为基础；
2. 保留官方新增接口、类型和错误处理；
3. 重新加入 MOSI provider 分发；
4. 保留 `/api/voice/mosi` 异步代理调用；
5. 重新加入语音设置页面的 MOSI 选项与 iOS 试听播放逻辑；
6. 重新加入聊天朗读组件、缓存模块和缓存管理入口；
7. 构建并按验收清单测试。

## 不应执行的操作

除非明确准备放弃个人功能，否则不要：

- 将 fork 的 `main` 强制 reset 到官方分支；
- 删除 fork 后重新 fork；
- 用官方仓库重新创建 Netlify 站点；
- 冲突时对所有文件一键采用 upstream；
- 把 MOSI API Key 写入代码、README、Issue 或提交记录；
- 把私钥放入 `NEXT_PUBLIC_*` 环境变量。

## 部署关系

当前个人功能只存在于：

```text
ssrei7/ai-virtual-phone
```

Netlify 应继续关联这个 fork 的部署分支。若改为关联官方仓库，官方尚未合并这些功能时，MOSI 和聊天朗读将不会出现在部署版本中。

## 后续维护

每次调整这些个人功能后，请同步更新本文件：

- 新增或删除的文件；
- 提交标题；
- 支持的 MOSI 模型或接口；
- 测试设备与结果；
- 已知限制；
- 官方仓库是否已经合并其中部分功能。

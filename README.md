# DSH Qwen Voice

简体中文 | [English](./README_EN.md)

这是一个基于 [Qwen Audio Agent](https://github.com/QwenAudio/qwen-audio-agent)
构建的 DeepSeek Harness Web 实验性语音控制插件。

> 如果没有 Qwen Audio Agent，就不会有这个项目。本项目使用 Qwen Audio
> Agent 作为实时语音引擎，并在其基础上增加 DeepSeek Harness 插件界面、
> ACP 桥接和多会话任务路由。衷心感谢 Qwen Audio Agent 的维护者和所有贡献者，
> 感谢他们将优秀的实时语音 Agent 能力开源给社区。

插件会在 Harness 页面加入一个悬浮语音球。切换 DSH 会话时，实时语音连接不会
断开。用户可以在同一个浏览器标签页中，通过语音创建、继续和调度多个有名称的
DSH 会话，并在悬浮面板中查看任务状态。

## 主要功能

- 切换 Harness 会话时保持实时语音连接；
- 通过自然语言创建、继续和调度多个 DSH 会话；
- 在一个浏览器标签页中并行安排多个任务；
- 显示最新任务及其执行状态；
- 支持中断语音播放；
- 中断任务时显示处理中状态，并根据 Gateway 返回结果确认成功或报告失败；
- 任务完成后及时播报，不必等待全部任务结束；
- 通过播放状态回执减少重复播报；
- 根据任务目标生成更容易识别的侧边栏会话名称。

## 运行环境

- DeepSeek Harness Web `0.1.0-rc.6`
- Node.js `22.22.2+`、`24.15.0+` 或 `26+`
- npm `10+` 与 pnpm
- 提供 Windows 启动脚本；插件和 ACP 桥接本身使用跨平台 Node.js

本项目是社区集成，不是 DeepSeek 或 Qwen 的官方版本。两个上游项目仍在快速
迭代。项目已经内置并锁定经过验证的 Qwen Audio Agent Runtime，用户不需要
另外安装、升级或选择 Qwen Audio Agent 版本。

## 当前支持范围

本项目把“实时语音前台”和“后台任务 Agent”分开处理。目前正式支持：

- 实时语音前台：DashScope `Qwen-Audio-Realtime`，包括
  `qwen-audio-3.0-realtime-plus`（默认）、
  `qwen-audio-3.0-realtime-flash`、`qwen3.5-omni-flash-realtime` 和
  `qwen3.5-omni-plus-realtime`；
- 可选实时语音前台：Qwen Audio Agent 上游提供的 Hugging Face
  `speech-to-speech` 本地前台；
- 后台任务 Agent：DeepSeek Harness Web `0.1.0-rc.6`，通过本项目的 ACP
  Bridge 创建、继续、查询和取消 DSH 会话任务。

当前**不支持**直接使用 OpenAI Realtime、Gemini Live 或其他未在上游注册的
云端实时语音 Provider。后台 Agent 支持某个模型供应商，不代表实时语音前台也支持该供应商。

## 安装

```powershell
pnpm install
pnpm setup
```

安装完成后启动整个语音 Runtime、Gateway 和 ACP Bridge（前台运行，按
`Ctrl+C` 停止）：

```powershell
pnpm start
```

重启 DSH Web，并打开 `http://127.0.0.1:3080`。

仓库的 GitHub Actions 会在全新的 Windows Runner 上重复执行依赖安装、补丁、
类型检查、构建、Bridge 测试和本地 CLI 检查，不需要准备第二台电脑。

默认把启动命令所在目录作为 ACP 工作区。需要指定工作区时：

```powershell
$env:ACP_WORKSPACE = 'C:\path\to\workspace'
pnpm start
```

默认语音前台需要用户自行配置 DashScope API Key；使用本地
`speech-to-speech` 时按其上游文档配置服务地址。凭证只保存在 Qwen Audio
Agent 的本地配置中，仓库和 DSH 浏览器插件包均不包含 API Key。

## 临时兼容补丁

`pnpm setup` 会对本项目内部锁定的 Qwen Runtime 应用带版本检查的兼容修改，
不会查询或修改电脑上的全局 Qwen Audio Agent：

- 为同时发出的语音任务建立独立的协调通道；
- 每个认证用户只保留一个长期 ACP Coordinator Session；
- 允许管理员明确配置的 DSH 本机回环地址跨端口访问 Gateway。
- 安装带鉴权的本地 DSH Session API，并接入 Task Manager 生命周期；
- 在任务快照中保留目标 Session 身份；
- 存在旧的“继续时直接选第一个 Session”分支时将其禁用。

脚本遇到未知源码时会拒绝修改，并且可以安全地重复运行。重新安装项目依赖会
还原内部 Runtime；之后重新执行 `pnpm setup` 即可恢复完整接线。

## 开发与验证

```powershell
pnpm typecheck
pnpm build
pnpm --dir bridge test
```

ACP 桥接只允许访问本机回环地址。悬浮语音客户端默认连接
`127.0.0.1:3101` 的本地 Gateway。

## 已知限制

- 当前开发预览版只验证了 DSH `0.1.0-rc.6`；
- 云端实时语音前台当前只验证了 DashScope Qwen Realtime；
- Qwen 兼容补丁是临时方案，后续应尽量替换为上游正式扩展接口；
- 会话名称根据语音任务目标生成，表达含糊时可能仍需手动重命名。

## 致谢

特别感谢
[Qwen Audio Agent 团队和所有贡献者](https://github.com/QwenAudio/qwen-audio-agent/graphs/contributors)。
他们开发并开源了本项目赖以运行的实时语音前端、Gateway、音频传输、模型供应商
接入和 Agent 协调基础能力。本仓库的重点是将这些能力接入 DeepSeek Harness，
它不是对 Qwen Audio Agent 的替代品，也不是独立重写版本。

同时感谢 DeepSeek Harness 团队提供插件平台和开发者社区。

## 社区讨论

- [Qwen Audio Agent 社区：DSH Qwen Voice](https://github.com/QwenAudio/qwen-audio-agent/discussions/154)
- [DeepSeek Harness 社区：DSH Qwen Voice](https://github.com/deepseek-ai/deepseek-harness/discussions/1038)

## 许可证

本项目采用 MIT 许可证。改编的 Qwen Audio Agent 音频传输逻辑记录在 `NOTICE`
中；Qwen Audio Agent 采用 Apache-2.0 许可证。重新分发本集成时，请保留相关
上游署名。
# 协调会话绑定

语音悬浮面板会显示当前 Coordinator。首次使用时，在目标 DSH 会话中点击
“设为协调会话”；需要更换时，在新会话中点击“由当前会话接管”并确认。
Session ID 由 DSH 当前会话状态提供并由 Gateway 再次验证，用户无需复制或编辑。

本地 `rebind-coordinator` 命令仅作为网页不可用时的灾难恢复手段。

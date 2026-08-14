# DSH Qwen Voice

简体中文 | [English](./README.md)

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
- 任务完成后及时播报，不必等待全部任务结束；
- 通过播放状态回执减少重复播报；
- 根据任务目标生成更容易识别的侧边栏会话名称。

## 兼容版本

- DeepSeek Harness Web `0.1.0-rc.6`
- Qwen Audio Agent `1.10.0`
- 同时满足两个上游项目要求的 Node.js 版本
- 提供 Windows 启动脚本；插件和 ACP 桥接本身使用跨平台 Node.js

本项目是社区集成，不是 DeepSeek 或 Qwen 的官方版本。两个上游项目仍在快速
迭代，因此目前需要严格匹配上述版本。

## 安装

```powershell
npm.cmd install --global qwen-audio-agent@1.10.0
pnpm install
pnpm typecheck
pnpm build
pnpm setup:qwen
pnpm --dir bridge install
npx.cmd -p @deepseek-ai/dsh@0.1.0-rc.6 dsh plugin --profile web add .
```

复制 `start-qwen-dsh-voice.example.cmd`，保存为你自己的本地启动脚本。
如果需要，请修改其中的 `ACP_WORKSPACE`，然后启动语音 Gateway：

```powershell
.\start-qwen-dsh-voice.example.cmd webui
```

重启 DSH Web，并打开 `http://127.0.0.1:3080`。

Qwen 或 DashScope 凭证只保存在 Qwen Audio Agent 的本地配置中。仓库和 DSH
浏览器插件包均不包含 API Key。

## 临时兼容补丁

`pnpm setup:qwen` 会对全局安装的 Qwen Audio Agent `1.10.0` 应用三个带版本
检查的小型兼容修改：

- 为同时发出的语音任务建立独立的协调通道；
- 为每个工作任务建立独立的 ACP 协调会话；
- 允许管理员明确配置的 DSH 本机回环地址跨端口访问 Gateway。

脚本遇到未知版本时会拒绝修改，并且可以安全地重复运行。重新安装 Qwen Audio
Agent 会移除这些临时修改。

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
- Qwen 兼容补丁是临时方案，后续应尽量替换为上游正式扩展接口；
- 会话名称根据语音任务目标生成，表达含糊时可能仍需手动重命名。

## 致谢

特别感谢
[Qwen Audio Agent 团队和所有贡献者](https://github.com/QwenAudio/qwen-audio-agent/graphs/contributors)。
他们开发并开源了本项目赖以运行的实时语音前端、Gateway、音频传输、模型供应商
接入和 Agent 协调基础能力。本仓库的重点是将这些能力接入 DeepSeek Harness，
它不是对 Qwen Audio Agent 的替代品，也不是独立重写版本。

同时感谢 DeepSeek Harness 团队提供插件平台和开发者社区。

## 许可证

本项目采用 MIT 许可证。改编的 Qwen Audio Agent 音频传输逻辑记录在 `NOTICE`
中；Qwen Audio Agent 采用 Apache-2.0 许可证。重新分发本集成时，请保留相关
上游署名。

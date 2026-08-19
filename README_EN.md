# DSH Qwen Voice

[简体中文](./README.md) | English

Experimental voice-control plugin for DeepSeek Harness Web, **built on top of**
[Qwen Audio Agent](https://github.com/QwenAudio/qwen-audio-agent).

> This project would not exist without Qwen Audio Agent. It reuses Qwen Audio
> Agent as the realtime voice engine and adds the DeepSeek Harness plugin UI,
> ACP bridge, and multi-session routing integration around it. Our sincere
> thanks to the Qwen Audio Agent maintainers and every upstream contributor for
> releasing their excellent work as open source.

It adds a floating voice orb that remains connected while switching DSH
conversations. One browser tab can dispatch multiple named DSH sessions,
show live task state, interrupt playback, and announce results as tasks finish.

## Compatibility

- DeepSeek Harness Web `0.1.0-rc.6`
- Qwen Audio Agent `1.10.0`
- Node.js supported by both upstream projects
- Windows launcher included; the plugin and bridge are cross-platform Node.js

This is a community integration, not an official DeepSeek or Qwen release.
Both upstream projects are evolving quickly, so exact versions matter.

## Current support scope

The realtime voice frontend and the backend task Agent are separate layers.
This release supports:

- DashScope `Qwen-Audio-Realtime`: `qwen-audio-3.0-realtime-plus` (default),
  `qwen-audio-3.0-realtime-flash`, `qwen3.5-omni-flash-realtime`, and
  `qwen3.5-omni-plus-realtime`;
- the optional local Hugging Face `speech-to-speech` frontend provided by
  upstream Qwen Audio Agent;
- DeepSeek Harness Web `0.1.0-rc.6` as the backend task Agent through this
  project's ACP bridge.

This release does **not** directly support OpenAI Realtime, Gemini Live, or
other cloud realtime providers not registered by upstream Qwen Audio Agent.
Backend model-provider support does not imply realtime voice-provider support.

## Install (clone & run)

### Prerequisites

| Dependency | Version |
| --- | --- |
| Node.js | `22.22.2+`, `24.15.0+`, or `26+` |
| pnpm | `10+` (recommended `11.x`) |
| DeepSeek Harness Web | `0.1.0-rc.6` (installed and running at `127.0.0.1:3080`) |

### Steps

```powershell
# 1. Clone and install (includes the pinned Qwen Audio Agent 1.10.0)
git clone https://github.com/leaveimagination/dsh-qwen-voice.git
cd dsh-qwen-voice
pnpm install

# 2. Apply compatibility patches + build + register into a DSH profile
pnpm setup
```

`pnpm setup` does three things automatically:

1. patches the project-pinned Qwen Audio Agent `1.10.0` (never touches a global
   install);
2. installs the ACP Bridge dependencies and runs typecheck + build;
3. registers the plugin into `--profile web` via the DSH CLI (override with the
   `DSH_PROFILE` env var, e.g. `$env:DSH_PROFILE = 'voice-test'`).

### Start

```powershell
pnpm start
```

Starts the voice runtime, Gateway, and ACP Bridge (foreground, stop with
`Ctrl+C`). Then **refresh the DSH Web page** (`http://127.0.0.1:3080`) — a
floating voice orb appears in the bottom-right corner.

By default the current working directory is the ACP workspace. To override:

```powershell
$env:ACP_WORKSPACE = 'C:\path\to\workspace'
pnpm start
```

### Configure voice credentials (required)

The default frontend uses DashScope realtime voice and needs your own API key:

1. After the first start, edit the Qwen Audio Agent local config:
   `%USERPROFILE%\.config\qwaudio\config.env`
2. Set (`QWEN_AUDIO_REALTIME_PROVIDER` stays `dashscope`):

```ini
DASHSCOPE_API_KEY=sk-your-key
QWEN_AUDIO_REALTIME_PROVIDER=dashscope
QWEN_AUDIO_REALTIME_MODEL=qwen-audio-3.0-realtime-plus
```

3. Restart `pnpm start` for the config to take effect.

Credentials stay in the local config; no API key is included in this repository
or in the browser plugin bundle.

### First use: bind the coordinator session

Open the voice panel and click **Set as coordinator session** in the target DSH
session. Voice tasks are dispatched by that Coordinator session to multiple
child sessions in parallel; switching Harness conversations keeps the voice
connection alive.

### Troubleshooting

- **No floating orb on the page**: confirm `pnpm setup` succeeded, DSH Web was
  restarted, and the plugin shows up in `dsh plugin --profile web list`.
- **Gateway fails to start**: check the startup output and confirm
  `QWEN_AUDIO_REALTIME_PROVIDER=dashscope` in `config.env` (no other value is
  supported).
- **Cancelling a task hangs**: the cancellation deadlock is fixed in v1.0.0+;
  if it still misbehaves, open an issue with the Gateway log.

The GitHub Actions workflow re-runs install → patch → typecheck → build →
bridge tests → CLI check on a fresh Windows runner to prove that "clone and
run" works.

## What the compatibility patch changes

`pnpm setup:qwen` applies version-checked integration changes only to the
Qwen Audio Agent 1.10.0 runtime bundled inside this project:

- separate coordinator lanes for simultaneous voice turns;
- keep one persistent ACP Coordinator Session per authenticated owner;
- allow an explicitly configured DSH loopback origin on another port.
- install the authenticated local DSH Session API and Task Manager lifecycle;
- expose target Session identity in task snapshots;
- disable the obsolete first-session continuation fallback when present.

Task cards use the Gateway's authoritative task status. Cancelling a task now
shows an in-progress state, confirms the Gateway response, and reports failures
instead of silently sending a request.

The script refuses unknown Qwen Audio Agent versions and is safe to rerun.
Reinstalling the upstream package removes the patch; run `pnpm setup:qwen`
again afterward to restore the integration.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | Voice orb plugin source (DSH client plugin) |
| `bridge/` | ACP Bridge: exposes DSH Web sessions as an ACP backend |
| `tools/dsh-qwen-coordinator-tools/` | Coordinator session tools plugin (coordinator-only DSH tools) |
| `scripts/` | Install / start / compatibility patch scripts |
| `cordis.patch.yml` | Plugin registration patch |

`pnpm setup` builds and registers both the `src/` main plugin and the
`tools/` coordinator tools plugin into the same DSH profile.

## Development

```powershell
pnpm typecheck
pnpm build
pnpm --dir bridge test
```

The ACP bridge accepts loopback DSH URLs only. The floating client defaults to
the local gateway at `127.0.0.1:3101`.

## Known limitations

- Developer-preview compatibility is pinned to DSH `0.1.0-rc.6`.
- The only verified cloud realtime voice frontend is DashScope Qwen Realtime.
- The Qwen compatibility patch is temporary and should eventually be replaced
  by upstream extension points.
- Session titles are generated from the spoken task objective and may still
  require manual renaming for ambiguous requests.

## Acknowledgements

Special thanks to the
[Qwen Audio Agent team and contributors](https://github.com/QwenAudio/qwen-audio-agent/graphs/contributors).
They built and open-sourced the realtime voice frontend, gateway, audio
transport, provider integration, and agent coordination foundation on which
this DSH integration is based. This repository focuses on connecting that
foundation to DeepSeek Harness; it is not a replacement for or independent
reimplementation of Qwen Audio Agent.

Thanks also to the DeepSeek Harness team for the plugin platform and community.

## Community discussions

- [Qwen Audio Agent community: DSH Qwen Voice](https://github.com/QwenAudio/qwen-audio-agent/discussions/154)
- [DeepSeek Harness community: DSH Qwen Voice](https://github.com/deepseek-ai/deepseek-harness/discussions/1038)

## License

MIT. Adapted audio transport logic is noted in `NOTICE`; Qwen Audio Agent is
Apache-2.0 licensed. Please retain the upstream attribution when redistributing
this integration.

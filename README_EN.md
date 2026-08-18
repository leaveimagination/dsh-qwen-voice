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

This release does **not** directly support Doubao end-to-end Realtime, OpenAI
Realtime, Gemini Live, or other cloud realtime providers not registered by
upstream Qwen Audio Agent. Backend model-provider support does not imply
realtime voice-provider support. A local experimental branch previously ran
Doubao through an additional bridge, but that bridge and its task-routing
layer are not part of this release.

## Install

```powershell
pnpm install
pnpm setup
```

Copy `start-qwen-dsh-voice.example.cmd` to a local filename, adjust
`ACP_WORKSPACE` if needed, then start the gateway:

```powershell
pnpm start
```

Restart DSH Web and open `http://127.0.0.1:3080`.

The default voice frontend requires a user-provided DashScope API key. When
using local `speech-to-speech`, configure its endpoint as documented upstream.
Credentials remain in local Qwen Audio Agent configuration. No API key is
included in this repository or sent through the DSH browser bundle.

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
- The only verified cloud realtime voice frontend is DashScope Qwen Realtime;
  Doubao end-to-end Realtime is not included in this release.
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

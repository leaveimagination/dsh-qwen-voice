# DSH Qwen Voice

Experimental voice-control plugin for DeepSeek Harness Web, powered by
[Qwen Audio Agent](https://github.com/QwenAudio/qwen-audio-agent).

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

## Install

```powershell
npm.cmd install --global qwen-audio-agent@1.10.0
pnpm install
pnpm typecheck
pnpm build
pnpm setup:qwen
pnpm --dir bridge install
npx.cmd -p @deepseek-ai/dsh@0.1.0-rc.6 dsh plugin --profile web add .
```

Copy `start-qwen-dsh-voice.example.cmd` to a local filename, adjust
`ACP_WORKSPACE` if needed, then start the gateway:

```powershell
.\start-qwen-dsh-voice.example.cmd webui
```

Restart DSH Web and open `http://127.0.0.1:3080`.

Qwen/DashScope credentials remain in Qwen Audio Agent configuration. No API
key is included in this repository or sent through the DSH browser bundle.

## What the compatibility patch changes

`pnpm setup:qwen` applies three small, version-checked changes to the globally
installed Qwen Audio Agent 1.10.0:

- separate coordinator lanes for simultaneous voice turns;
- separate ACP coordinator sessions per work item;
- allow an explicitly configured DSH loopback origin on another port.

The script refuses unknown Qwen Audio Agent versions and is safe to rerun.
Reinstalling the upstream package removes the patch.

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
- The Qwen compatibility patch is temporary and should eventually be replaced
  by upstream extension points.
- Session titles are generated from the spoken task objective and may still
  require manual renaming for ambiguous requests.

## License

MIT. Adapted audio transport logic is noted in `NOTICE`; Qwen Audio Agent is
Apache-2.0 licensed.

# DSH Qwen Coordinator Tools

Registers Qwen's five project Session tools directly in DSH while enforcing a
single human-approved Coordinator Session ID. Calls are forwarded only to the
authenticated loopback Qwen Gateway endpoint and become ordinary Qwen Task
Manager work, preserving completion notifications and cancellation.

## Rebind the Coordinator

Rebinding is deliberately a local administrative operation; it is not exposed
as a model tool. The command atomically updates both the DSH plugin binding and
Qwen's ACP Session registry:

```powershell
pnpm rebind-coordinator session-7bfba7fa-5ac7-42b1-ab25-8bb6521a4100 C:\Users\admin\Documents\Codex\deepseek-harness-study
```

Restart the Qwen Gateway after rebinding. If the bound Session cannot be
resumed, Qwen reports `COORDINATOR_UNAVAILABLE` and never silently creates a
replacement Coordinator.

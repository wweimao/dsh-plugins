# @local/dsh-allow-all-permission

Adds the `allow-all` (`无限制全放行`) permission preset to DeepSeek Harness.

When selected in the session permission picker (or set as the default permission in General Settings):
- **Sandbox**: `danger-full-access` (no file/command sandbox confinement).
- **Approval**: `ask` with an automatic `allowed-once` answerer and `tools/pre-execute` allow gate, so every tool call and direct `ctx.approval.request` (such as `ssh_exec` or `plugin_manager`) is approved automatically without user prompts.

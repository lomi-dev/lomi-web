# Desktop CLI compatibility

`CliCompatibility.astro` renders immediately after Features and before the
default Newsletter position, on the same chalk surface. The native list has
fifteen named tools followed by “And more.” It uses static HTML and local SVGs
without remote logo services, animation, or JavaScript requirements.

`src/data/compatible-clis.ts` follows the desktop application's
`TitleCli::MCP_CLIENTS` catalog in `../lomi/src-tauri/src/cli_catalog.rs`.
Names match `../lomi/src/cli-agents.ts`. This is the same fifteen-client set
used by installed-agent discovery and automatic MCP configuration. It includes
Claude Code, Codex, Gemini CLI, GitHub Copilot CLI, Cursor CLI, OpenCode,
OpenClaw, Hermes Agent, Kilo Code CLI, Qwen Code, Kiro CLI, Mistral Vibe,
Kimi Code CLI, Grok Build and Antigravity CLI.

Pi remains in the desktop identity registry but is outside this discovery/MCP
set, so it is not advertised in this section. “And more” refers to commands
that can be run manually in a native terminal; it does not promise automatic
integration for arbitrary clients.

This catalog concerns CLI integrations on macOS and Linux. Workspace MCP control and
managed task/account capabilities have narrower platform and version scopes.
The section does not promise identical features or universal version support.
It follows Features when the CMS reorders sections and hides with Features.
No existing CMS schema, stored content, or migration changes are needed.

The [icon manifest](../public/cli/README.md) records all Iconify sources and
licenses. Monochrome marks follow the site's ink color; multicolor marks keep
their original colors. Brand names remain visible beside decorative marks.

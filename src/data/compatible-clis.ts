// Matches the desktop app's TitleCli::MCP_CLIENTS catalog and cliNames labels.
// Keep this factual list in code rather than adding unverified CMS entries.
export const compatibleClis = [
  { id: 'claude', name: 'Claude Code', monochrome: false },
  { id: 'codex', name: 'Codex', monochrome: true },
  { id: 'gemini', name: 'Gemini CLI', monochrome: false },
  { id: 'copilot', name: 'GitHub Copilot CLI', monochrome: true },
  { id: 'cursor', name: 'Cursor CLI', monochrome: true },
  { id: 'opencode', name: 'OpenCode', monochrome: true },
  { id: 'openclaw', name: 'OpenClaw', monochrome: false },
  { id: 'hermes', name: 'Hermes Agent', monochrome: true },
  { id: 'kilo', name: 'Kilo Code CLI', monochrome: true },
  { id: 'qwen', name: 'Qwen Code', monochrome: false },
  { id: 'kiro', name: 'Kiro CLI', monochrome: false },
  { id: 'vibe', name: 'Mistral Vibe', monochrome: false },
  { id: 'kimi', name: 'Kimi Code CLI', monochrome: true },
  { id: 'grok', name: 'Grok Build', monochrome: true },
  { id: 'agy', name: 'Antigravity CLI', monochrome: false },
] as const;

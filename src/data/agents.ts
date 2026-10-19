export const agents = [
  { id: 'codex', name: 'Codex', image: 'codex-dark', treatment: 'color', command: 'codex' },
  { id: 'claude-code', name: 'Claude Code', image: 'claude-code', treatment: 'color', command: 'claude' },
  { id: 'opencode', name: 'OpenCode', image: 'opencode', treatment: 'mono', command: 'opencode' },
  { id: 'hermes', name: 'Hermes Agent', image: 'hermes', treatment: 'mono', command: 'hermes' },
  { id: 'cursor', name: 'Cursor CLI', image: 'cursor', treatment: 'mono', command: 'agent' },
  { id: 'grok', name: 'Grok Build', image: 'grok', treatment: 'mono', command: 'grok' },
  { id: 'antigravity', name: 'Antigravity CLI', image: 'antigravity', treatment: 'color', command: 'antigravity' },
] as const;

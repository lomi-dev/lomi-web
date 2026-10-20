// Installation commands supplied by the project owner on 2026-10-20.
// The scripts are published separately from this static website.
const unixInstallCommand = 'curl -fsSL https://lomi.dev/download/remote | bash';

export const remoteInstallPlatforms = [
  { id: 'unix', label: 'macOS / Linux', icons: ['macos', 'linux'], command: unixInstallCommand },
  { id: 'windows', label: 'Windows', icons: ['windows'], command: 'Invoke-RestMethod "https://lomi.dev/download/remote.ps1" | Invoke-Expression' },
] as const;

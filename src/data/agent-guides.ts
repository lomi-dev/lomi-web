export interface GuideStep {
  title: string;
  description: string;
}

export interface AgentGuide {
  slug: 'claude-code' | 'codex';
  title: string;
  seoTitle: string;
  seoDescription: string;
  summary: string;
  heroAlt: string;
  providerName: string;
  command: string;
  officialDocs: { href: string; label: string };
  prerequisites: string[];
  localLaunchSteps: GuideStep[];
  localLaunchNote: string;
  windowsSteps: GuideStep[];
  windowsNote: string;
  workflowSteps: GuideStep[];
  limits: string[];
  related: { href: string; label: string };
}

export const agentGuides: Record<AgentGuide['slug'], AgentGuide> = {
  'claude-code': {
    slug: 'claude-code',
    title: 'Use Claude Code in Lomi',
    seoTitle: 'Use Claude Code in Lomi | Lomi',
    seoDescription: 'Run Claude Code from Lomi, keep your project, terminal and browser preview together, and review changes in Git. Setup notes for macOS, Linux and Windows.',
    summary: 'Run Claude Code beside your project files, development server, browser preview and Git changes in one desktop workspace.',
    heroAlt: 'Lomi workspace showing a project explorer, code editor and running terminal.',
    providerName: 'Claude Code',
    command: 'claude',
    officialDocs: {
      href: 'https://code.claude.com/docs/en/getting-started',
      label: 'Claude Code setup and sign-in',
    },
    prerequisites: [
      'Install Lomi and open the local project you want to work on.',
      'Install Claude Code and sign in using Anthropic’s current setup instructions. Lomi does not install the CLI or authenticate your Claude account.',
      'Keep the CLI available in the local shell you plan to use. A Git repository is recommended so you can inspect or undo edits.',
    ],
    localLaunchSteps: [
      { title: 'Open the project', description: 'Choose a project folder or repository in Lomi. The agent terminal starts in that project directory.' },
      { title: 'Open Agents', description: 'Select the + menu, choose Agents, and wait for Lomi to look for installed command-line tools in the selected local shell.' },
      { title: 'Launch Claude Code', description: 'Choose Claude Code and select how many terminals to open. Use Refresh installed CLI if you installed Claude Code after opening the dialog.' },
      { title: 'Start with a bounded task', description: 'Give Claude Code a specific change or ask it to explain the relevant files first. Review its edits before you keep them.' },
    ],
    localLaunchNote: 'The Agents launcher is available on macOS and Linux. It checks the selected supported local shell, then opens Claude Code in a Lomi terminal at your project directory.',
    windowsSteps: [
      { title: 'Open a regular terminal', description: 'In Lomi, select + and choose New terminal. Use PowerShell, Command Prompt or WSL according to Claude Code’s current Windows setup guidance.' },
      { title: 'Install and sign in', description: 'Follow Anthropic’s Windows instructions for the shell you chose. Lomi does not install or sign in to Claude Code for you.' },
      { title: 'Start the CLI', description: 'At the project prompt, enter the command shown below. Claude Code’s own terminal interface appears in that Lomi pane.' },
    ],
    windowsNote: 'Lomi’s Agents detection and one-click CLI launch are not available on Windows. Lomi’s managed native-agent runtime is not qualified for Windows or WSL, so use a regular terminal and follow the CLI vendor’s platform guidance.',
    workflowSteps: [
      { title: 'Ask before editing', description: 'For an unfamiliar repository, ask Claude Code to trace the relevant code and outline a small change before it edits files.' },
      { title: 'Run the project beside it', description: 'Keep a second terminal open for the project’s development server or checks. Each terminal remains part of the same workspace.' },
      { title: 'Preview locally', description: 'When the server is ready, use + → New browser and enter its local address, such as the localhost URL printed by your development command.' },
      { title: 'Review in Git', description: 'Inspect the changed files and diff in Lomi’s Git view. Run the project’s checks, then stage and commit the changes you want to keep.' },
    ],
    limits: [
      'Claude Code’s prompts and replies stay in its CLI; Lomi is the surrounding workspace, not a replacement chat frontend or a Claude Code IDE extension.',
      'Claude access, sign-in, plan eligibility and any API costs come from Anthropic. They are not included with Lomi.',
      'This workflow runs the CLI in a local terminal. It does not configure cloud delegation or unattended remote work; Claude Code’s own permissions and account rules still apply.',
    ],
    related: { href: '/codex/', label: 'Use Codex CLI in Lomi' },
  },
  codex: {
    slug: 'codex',
    title: 'Use Codex CLI in Lomi',
    seoTitle: 'Use Codex CLI in Lomi | Lomi',
    seoDescription: 'Launch Codex CLI in Lomi, work alongside your local project and browser preview, and review changes in Git. Setup notes for macOS, Linux and Windows.',
    summary: 'Use Codex CLI in a Lomi terminal with your project, local browser preview and Git review close at hand.',
    heroAlt: 'Lomi workspace showing a project explorer, code editor and running terminal.',
    providerName: 'Codex CLI',
    command: 'codex',
    officialDocs: {
      href: 'https://developers.openai.com/codex/cli/',
      label: 'Codex CLI installation and quickstart',
    },
    prerequisites: [
      'Install Lomi and open the local project you want Codex to inspect or change.',
      'Install Codex CLI and complete its sign-in flow using OpenAI’s current guide. Lomi does not provide Codex access, an OpenAI account or API credentials.',
      'Make sure Codex is available in the local shell you plan to use. A Git repository gives you a clear checkpoint before work begins.',
    ],
    localLaunchSteps: [
      { title: 'Open the project', description: 'Choose the project folder or repository in Lomi. The CLI terminal opens at that project directory.' },
      { title: 'Open Agents', description: 'Select the + menu, choose Agents, and let Lomi check the selected local shell for installed command-line tools.' },
      { title: 'Launch Codex', description: 'Select Codex and choose how many terminals to open. If you just installed it, use Refresh installed CLI to scan again.' },
      { title: 'Describe one reviewable task', description: 'Ask Codex to inspect the relevant code, make a focused change, or help debug an issue. Review the resulting diff before committing.' },
    ],
    localLaunchNote: 'The Agents launcher is available on macOS and Linux. It detects supported command-line tools in the selected local shell and starts Codex in a Lomi terminal at your project directory.',
    windowsSteps: [
      { title: 'Open a regular terminal', description: 'In Lomi, select + and choose New terminal. Use a Windows shell or WSL only if that environment is supported by the current Codex setup guide.' },
      { title: 'Install and sign in', description: 'Follow OpenAI’s Windows installation and sign-in instructions for the shell you chose. Lomi does not install or authenticate Codex for you.' },
      { title: 'Start the CLI', description: 'At the project prompt, enter the command shown below. Codex’s own terminal interface appears in the Lomi pane.' },
    ],
    windowsNote: 'Lomi’s Agents detection and one-click CLI launch are not available on Windows. Lomi’s managed native-agent runtime is not qualified for Windows or WSL, so use a regular terminal and follow OpenAI’s current platform guidance.',
    workflowSteps: [
      { title: 'Set a review point', description: 'Start from a Git checkpoint and ask Codex to explain the relevant files or outline its approach before making a larger change.' },
      { title: 'Keep local tools nearby', description: 'Use another Lomi terminal for the development server, tests or build command that belongs to your project.' },
      { title: 'Check the result in a browser', description: 'Once the server prints its local address, select + → New browser and enter that localhost URL to inspect the running app.' },
      { title: 'Review and commit', description: 'Use Lomi’s Git view to inspect the diff, stage selected files and write a commit. Run the project’s checks before keeping the change.' },
    ],
    limits: [
      'Codex’s prompts and replies stay in its CLI; Lomi provides the project workspace around it, not a full Codex chat frontend or a native Codex IDE extension.',
      'Codex sign-in, account or plan eligibility, API access and usage costs are handled by OpenAI. Lomi does not include them.',
      'This guide covers Codex running in a local terminal. It does not configure Codex Cloud, cloud delegation or unattended remote work; Codex’s own permissions still apply.',
    ],
    related: { href: '/claude-code/', label: 'Use Claude Code in Lomi' },
  },
};

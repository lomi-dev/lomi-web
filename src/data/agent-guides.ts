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
    seoDescription: 'Run Claude Code from Lomi, preview your project locally and review changes in Git. Setup notes for macOS, Linux and Windows.',
    summary: 'Run Claude Code alongside your project, local app preview and Git changes.',
    heroAlt: 'Lomi workspace showing a project explorer, code editor and running terminal.',
    providerName: 'Claude Code',
    command: 'claude',
    officialDocs: {
      href: 'https://code.claude.com/docs/en/getting-started',
      label: 'Claude Code setup and sign-in',
    },
    prerequisites: [
      'Install Lomi and open the local project you want to work on.',
      'Install Claude Code and sign in using Anthropic’s setup instructions. Lomi does not install the CLI or sign in to your account.',
      'Make sure the CLI is available in the local shell you plan to use. A Git repository lets you inspect or undo edits.',
    ],
    localLaunchSteps: [
      { title: 'Open the project', description: 'Choose a project folder or repository in Lomi. The agent terminal starts in that project directory.' },
      { title: 'Open Agents', description: 'Select the + menu, choose Agents, and let Lomi check the selected local shell for installed command-line tools.' },
      { title: 'Launch Claude Code', description: 'Choose Claude Code and select how many terminals to open. If you installed it after opening the dialog, select Refresh installed CLI.' },
      { title: 'Start with one clear task', description: 'Ask Claude Code to explain the relevant files or make a specific change. Review its edits before keeping them.' },
    ],
    localLaunchNote: 'On macOS and Linux, Agents looks for Claude Code in the local shell you selected, then opens it in a Lomi terminal at your project directory.',
    windowsSteps: [
      { title: 'Open a terminal', description: 'In Lomi, select + and choose New terminal. Choose PowerShell, Command Prompt or WSL based on Claude Code’s Windows setup guide.' },
      { title: 'Install and sign in', description: 'Follow Anthropic’s Windows instructions for your chosen shell. Lomi does not install Claude Code or sign in to your account.' },
      { title: 'Start the CLI', description: 'At the project prompt, enter the command shown below to open Claude Code in the Lomi terminal.' },
    ],
    windowsNote: 'Lomi’s Agents detection and one-click CLI launch are not available on Windows. Lomi’s managed native-agent runtime is not qualified for Windows or WSL, so use a regular terminal and follow the CLI vendor’s platform guidance.',
    workflowSteps: [
      { title: 'Plan the change', description: 'If the repository is unfamiliar, ask Claude Code to trace the relevant code and propose a small change before editing files.' },
      { title: 'Run the app or checks', description: 'Open another terminal for the project’s development server or checks. Both terminals stay in the same workspace.' },
      { title: 'Preview locally', description: 'When the server is ready, use + → New browser and enter its local address, such as the localhost URL printed by your development command.' },
      { title: 'Review in Git', description: 'Inspect the diff in Lomi’s Git view and run the project’s checks. Then stage and commit the changes you want to keep.' },
    ],
    limits: [
      'Claude Code’s prompts and replies stay in its CLI. Lomi provides the workspace around it; it is not a replacement chat frontend or a Claude Code IDE extension.',
      'Claude access, sign-in, plan eligibility and API costs are handled by Anthropic. They are not included with Lomi.',
      'This setup runs the CLI in a local terminal. It does not configure cloud delegation or unattended remote work. Claude Code’s own permissions and account rules still apply.',
    ],
    related: { href: '/codex/', label: 'Use Codex CLI in Lomi' },
  },
  codex: {
    slug: 'codex',
    title: 'Use Codex CLI in Lomi',
    seoTitle: 'Use Codex CLI in Lomi | Lomi',
    seoDescription: 'Run Codex CLI in Lomi, preview your project locally and review changes in Git. Setup notes for macOS, Linux and Windows.',
    summary: 'Run Codex CLI alongside your project, local app preview and Git changes.',
    heroAlt: 'Lomi workspace showing a project explorer, code editor and running terminal.',
    providerName: 'Codex CLI',
    command: 'codex',
    officialDocs: {
      href: 'https://developers.openai.com/codex/cli/',
      label: 'Codex CLI installation and quickstart',
    },
    prerequisites: [
      'Install Lomi and open the local project you want Codex to inspect or change.',
      'Install Codex CLI and sign in using OpenAI’s setup guide. Lomi does not provide Codex access, an OpenAI account or API credentials.',
      'Make sure Codex is available in the local shell you plan to use. A Git repository gives you a checkpoint before work begins.',
    ],
    localLaunchSteps: [
      { title: 'Open the project', description: 'Choose the project folder or repository in Lomi. The CLI terminal opens at that project directory.' },
      { title: 'Open Agents', description: 'Select the + menu, choose Agents, and let Lomi check the selected local shell for installed command-line tools.' },
      { title: 'Launch Codex', description: 'Select Codex and choose how many terminals to open. If you installed it after opening the dialog, select Refresh installed CLI.' },
      { title: 'Start with one clear task', description: 'Ask Codex to inspect the relevant code, make a small change, or help debug an issue. Review the diff before committing.' },
    ],
    localLaunchNote: 'On macOS and Linux, Agents looks for Codex in the local shell you selected, then opens it in a Lomi terminal at your project directory.',
    windowsSteps: [
      { title: 'Open a terminal', description: 'In Lomi, select + and choose New terminal. Use a Windows shell or WSL only if the current Codex setup guide supports it.' },
      { title: 'Install and sign in', description: 'Follow OpenAI’s Windows instructions for your chosen shell. Lomi does not install Codex or sign in to your account.' },
      { title: 'Start the CLI', description: 'At the project prompt, enter the command shown below to open Codex in the Lomi terminal.' },
    ],
    windowsNote: 'Lomi’s Agents detection and one-click CLI launch are not available on Windows. Lomi’s managed native-agent runtime is not qualified for Windows or WSL, so use a regular terminal and follow OpenAI’s current platform guidance.',
    workflowSteps: [
      { title: 'Start from a checkpoint', description: 'Before a larger change, start from a Git checkpoint and ask Codex to explain the relevant files or outline a plan.' },
      { title: 'Run the app or checks', description: 'Use another Lomi terminal for the development server, tests or build command.' },
      { title: 'Check the result in a browser', description: 'Once the server prints its local address, select + → New browser and enter that localhost URL to inspect the running app.' },
      { title: 'Review and commit', description: 'Inspect the diff in Lomi’s Git view and run the project’s checks. Then stage the files you want to keep and commit them.' },
    ],
    limits: [
      'Codex’s prompts and replies stay in its CLI. Lomi provides the project workspace around it; it is not a replacement chat frontend or a Codex IDE extension.',
      'Codex sign-in, account and plan eligibility, API access and usage costs are handled by OpenAI. Lomi does not include them.',
      'This setup runs Codex in a local terminal. It does not configure Codex Cloud, cloud delegation or unattended remote work. Codex’s own permissions still apply.',
    ],
    related: { href: '/claude-code/', label: 'Use Claude Code in Lomi' },
  },
};

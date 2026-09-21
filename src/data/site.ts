export const site = {
  name: 'lomi',
  title: 'lomi: Work in progress',
  description: 'An open-source workspace for building with AI. Lomi is a work in progress. Follow the project on GitHub.',
  github: 'https://github.com/lomi-dev/lomi',
  releases: 'https://github.com/lomi-dev/lomi/releases',
  docs: 'https://github.com/lomi-dev/lomi#readme',
};

// These are verified v0.4.0 assets. Update together when a new release ships.
const release = `${site.releases}/download/v0.4.0`;
export const downloads = [
  { name: 'macOS', icon: 'apple' as const, subtitle: 'Made for your Mac', options: [
    { label: 'Apple Silicon', href: `${release}/SimpleBench_0.4.0_aarch64.dmg` },
    { label: 'Intel', href: `${release}/SimpleBench_0.4.0_x64.dmg` },
  ] },
  { name: 'Windows', icon: 'windows' as const, subtitle: 'A new home for your workflow', options: [
    { label: 'Windows x64', href: `${release}/SimpleBench_0.4.0_x64-setup.exe` },
    { label: 'MSI installer', href: `${release}/SimpleBench_0.4.0_x64_en-US.msi` },
  ] },
  { name: 'Linux', icon: 'linux' as const, subtitle: 'Right at home on Linux', options: [
    { label: 'AppImage', href: `${release}/SimpleBench_0.4.0_amd64.AppImage` },
    { label: '.deb', href: `${release}/SimpleBench_0.4.0_amd64.deb` },
    { label: '.rpm', href: `${release}/SimpleBench-0.4.0-1.x86_64.rpm` },
  ] },
];

export const faqs = [
  { question: 'What is lomi?', answer: 'Lomi is an open-source project making tools for people who build with AI. Our first product is an Agentic Development Environment (ADE). It brings native terminals, a code editor, browser previews, Git, and AI chat into one desktop workspace.' },
  { question: 'Can I use my favorite coding agent?', answer: 'Yes. Run installed CLI tools such as Claude Code, Codex, and Gemini CLI in lomi’s native terminals, just as you would in your usual shell. Lomi also has a separate AI chat with your own provider connections. The agents, accounts, and subscriptions you choose remain yours.' },
  { question: 'Is lomi free and open source?', answer: 'Yes. Lomi is free to download, and its source code is available under the Apache 2.0 license. You can explore the code, modify it, and contribute. Any third-party AI services you connect have their own pricing.' },
  { question: 'Which operating systems are supported?', answer: 'Desktop packages are available for macOS on Apple Silicon and Intel, Windows x64, and Linux x86_64. You can choose your package below. Individual features can vary by platform and release; the release notes describe what is included.' },
  { question: 'Where does my work live?', answer: 'Your projects, workspace state, and chat history live locally on your computer. When you use an AI provider or CLI agent, the content you send is handled by that service under its own policies. You choose which tools and providers to connect.' },
  { question: 'Why do the downloads say SimpleBench?', answer: 'Lomi grew out of SimpleBench. The current desktop packages and product screenshots still carry that earlier name while the project moves to lomi. The download links on this page point to the real releases in our GitHub repository.' },
];

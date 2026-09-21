import Icon, { type IconName } from './Icon';

const features: { icon: IconName; title: string; text: string; detail: string }[] = [
  { icon: 'terminal', title: 'Your tools. Your rhythm.', text: 'Bring the CLI agents and shells you already love. Split terminals, run tasks side by side, and keep processes going in the background.', detail: 'Native terminals · CLI agents' },
  { icon: 'panels', title: 'Everything, in context.', text: 'Keep your code, browser previews, and AI chats next to each other. Arrange your workspace around the way your brain works.', detail: 'Flexible panels · Built-in browser' },
  { icon: 'git', title: 'From idea to committed.', text: 'See what changed, review a diff, and explore your Git history. Stay close to your code, all the way from the first prompt to the final commit.', detail: 'File editing · Git source control' },
];

// Rendered to HTML at build time. No React runtime is sent to the browser.
export default function Features() {
  return <div className="feature-grid">
    {features.map(({ icon, title, text, detail }) => <article className="feature" key={title}>
      <div className="feature-icon"><Icon name={icon} width={25} height={25} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      <span className="feature-detail">{detail}</span>
    </article>)}
  </div>;
}

import Icon from './Icon';
import type { Landing } from '../../content/landing-schema';

// Rendered at build time; no React runtime is sent to the browser.
export default function Features({ items }: { items: Landing['features']['items'] }) {
  return <div className="feature-grid">
    {items.map(({ icon, title, description, detail }, index) => <article className="feature" key={`${index}-${title}`}>
      <div className="feature-top"><Icon name={icon} width={24} height={24} /><span>{detail}</span></div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>)}
  </div>;
}

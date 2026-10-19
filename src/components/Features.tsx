import type { Landing } from '../../content/landing-schema';

// Rendered at build time; no React runtime is sent to the browser.
export default function Features({ items }: { items: Landing['features']['items'] }) {
  return <ol className="feature-manifest">
    {items.map(({ title, description, detail }, index) => <li className="feature" key={`${index}-${title}`}>
      <span className="feature-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="feature-detail">{detail}</span>
    </li>)}
  </ol>;
}

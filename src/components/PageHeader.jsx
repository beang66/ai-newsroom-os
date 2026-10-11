import { destinations } from "../data/navigation";

export default function PageHeader({ page, actions }) {
  const destination = destinations.find((item) => item.id === page);
  if (!destination) return null;
  return <header className="workspace-page-header">
    <span className="workspace-page-index" aria-hidden="true">{destination.number}</span>
    <div><h1 tabIndex={-1} data-testid="page-heading">{destination.label}</h1><p>{destination.description}</p></div>
    {actions && <div className="workspace-actions">{actions}</div>}
  </header>;
}

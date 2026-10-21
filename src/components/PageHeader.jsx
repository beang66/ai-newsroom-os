import { destinations } from "../data/navigation";

export default function PageHeader({ page, actions }) {
  const destination = destinations.find((item) => item.id === page);
  if (!destination) return null;
  return <header className="workspace-page-header">
    <div><h1 tabIndex={-1} data-testid="page-heading" className="text-xl md:text-2xl font-bold text-[#292929] tracking-tight">{destination.label}</h1>{destination.description && <p>{destination.description}</p>}</div>
    {actions && <div className="workspace-actions">{actions}</div>}
  </header>;
}

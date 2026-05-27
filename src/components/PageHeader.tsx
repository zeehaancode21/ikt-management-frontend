interface Props {
  title: string;
  description?: string;
}

export const PageHeader = ({ title, description }: Props) => (
  <div className="mb-6">
    <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
  </div>
);

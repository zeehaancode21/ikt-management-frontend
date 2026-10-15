// interface Props {
//   title: string;
//   description?: string;
// }

// export const PageHeader = ({ title, description }: Props) => (
//   <div className="mb-6">
//     <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
//     {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
//   </div>
// );
import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  /** Optional controls shown on the right, on the same line as the title. */
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: Props) => (
  <div className="mb-6 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="shrink-0">{actions}</div>}
  </div>
);
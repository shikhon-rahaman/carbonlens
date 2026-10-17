import type { LucideIcon } from "lucide-react";
import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  icon: Icon = FolderOpen,
  action
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-surface px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted text-primary">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function EmptyStateAction({
  children,
  onClick
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick} size="sm">
      {children}
    </Button>
  );
}

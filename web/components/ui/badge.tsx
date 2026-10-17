import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/10 text-primary",
        secondary: "border-border bg-secondary text-secondary-foreground",
        verified: "border-success/25 bg-success/10 text-success",
        rejected: "border-destructive/25 bg-destructive/10 text-destructive",
        duplicate: "border-warning/30 bg-warning/10 text-warning",
        outline: "border-border text-foreground"
      }
    },
    defaultVariants: { variant: "default" }
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ className, variant }))} {...props} />;
}

export function StatusBadge({ status }: { status: "verified" | "rejected" | "duplicate" }) {
  const labels = { verified: "Verified", rejected: "Rejected", duplicate: "Duplicate" };
  return (
    <Badge aria-label={`Project status: ${labels[status]}`} variant={status}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {labels[status]}
    </Badge>
  );
}

export { badgeVariants };

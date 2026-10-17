import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this information right now. Please try again.",
  onRetry
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col items-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center"
      role="alert"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry} size="sm" variant="outline">
          Try again
        </Button>
      )}
    </div>
  );
}

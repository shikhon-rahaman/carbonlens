import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function ProgressStepper({
  steps,
  currentStep
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <nav aria-label="Verification progress">
      <ol className="flex items-start">
        {steps.map((step, index) => {
          const complete = index < currentStep;
          const current = index === currentStep;
          return (
            <li
              aria-current={current ? "step" : undefined}
              className={cn("relative flex flex-1 flex-col items-center text-center")}
              key={step}
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute right-1/2 top-4 h-px w-full -translate-y-1/2",
                    complete ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 grid size-8 place-items-center rounded-full border text-xs font-semibold",
                  complete && "border-primary bg-primary text-primary-foreground",
                  current && "border-primary bg-surface text-primary ring-4 ring-primary/10",
                  !complete && !current && "border-border bg-surface text-muted-foreground"
                )}
              >
                {complete ? <Check aria-hidden="true" className="size-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  "mt-2 text-xs font-medium",
                  current ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

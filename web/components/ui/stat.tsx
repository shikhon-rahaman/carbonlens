import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Trend = "up" | "down" | "flat";

export function Stat({
  label,
  value,
  detail,
  trend
}: {
  label: string;
  value: string;
  detail?: string;
  trend?: Trend;
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
      {detail && (
        <p
          className={cn(
            "mt-2 flex items-center gap-1 text-xs text-muted-foreground",
            trend === "up" && "text-success",
            trend === "down" && "text-destructive"
          )}
        >
          {trend && <TrendIcon aria-hidden="true" className="size-3.5" />}
          {detail}
        </p>
      )}
    </Card>
  );
}

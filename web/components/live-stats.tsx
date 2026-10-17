"use client";

import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type RegistryStats } from "@/lib/api";

export function LiveStats() {
  const [stats, setStats] = useState<RegistryStats | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    api.stats().then(
      (response) => {
        if (active) setStats(response);
      },
      () => {
        if (active) setUnavailable(true);
      }
    );
    return () => { active = false; };
  }, []);

  const items = [
    { label: "Verified registrations", value: stats?.verified_count },
    { label: "Credits minted", value: stats?.credits_minted },
    { label: "Duplicate submissions blocked", value: stats?.duplicates_blocked }
  ];

  return (
    <div aria-label="Live registry statistics" className="grid gap-3 sm:grid-cols-3" role="region">
      {items.map((item) => (
        <Card className="p-5" key={item.label}>
          <p className="text-xs font-medium leading-5 text-muted-foreground">{item.label}</p>
          {item.value === undefined ? (
            <Skeleton aria-label={unavailable ? "Statistic unavailable" : "Loading statistic"} className="mt-3 h-8 w-24" />
          ) : (
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.04em]">
              {item.value.toLocaleString()}
            </p>
          )}
          {unavailable && (
            <p className="mt-2 text-xs text-muted-foreground">Registry statistics are unavailable.</p>
          )}
        </Card>
      ))}
    </div>
  );
}

import type { Metadata } from "next";

import { PageTransition } from "@/components/page-transition";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Responsible AI" };

export default function ResponsibleAiPage() {
  return (
    <PageTransition>
      <article className="section-shell max-w-4xl py-16 sm:py-24">
        <p className="eyebrow">RESPONSIBLE AI</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">
          Vegetation health is not carbon value.
        </h1>
        <Card className="mt-8 space-y-5 p-6 sm:p-8">
          <p className="leading-7 text-muted-foreground">
            CarbonLens calculates a vegetation-health indicator from structured
            satellite-derived measurements. It is not a measurement of carbon
            sequestration, credit quality, legal ownership, additionality, permanence, or
            project eligibility.
          </p>
          <p className="leading-7 text-muted-foreground">
            Cloud cover, seasonality, sensor availability, spatial resolution, biome
            differences, land-management practices, and incomplete observations can affect
            scores. Cached data may be older than live data.
          </p>
          <p className="leading-7 text-muted-foreground">
            Every result needs human review before any real-world decision. This is not a
            substitute for field audit, accredited verification, legal review, or community
            consultation.
          </p>
          <p className="leading-7 text-muted-foreground">
            If enabled, an optional language model explains only structured scores using a
            sanitized, length-limited name. Its output is untrusted text and never decides a
            score or registration.
          </p>
        </Card>
      </article>
    </PageTransition>
  );
}

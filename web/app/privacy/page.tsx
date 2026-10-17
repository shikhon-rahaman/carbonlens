import type { Metadata } from "next";

import { PageTransition } from "@/components/page-transition";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <PageTransition>
      <article className="section-shell max-w-4xl py-16 sm:py-24">
        <p className="eyebrow">PRIVACY</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Data, made visible</h1>
        <Card className="mt-8 space-y-5 p-6 sm:p-8">
          <p className="leading-7 text-muted-foreground">
            CarbonLens stores the project name, submitted project polygon, verification
            scores, and testnet transaction hashes needed to demonstrate the service. It
            does not create user accounts or intentionally collect personal data.
          </p>
          <p className="leading-7 text-muted-foreground">
            Project data is retained for the duration needed to operate and evaluate this
            demo. Maintainers may delete or aggregate local records when the demo is retired.
            The submitting browser may retain the project name, claimed area, and polygon in
            local storage so the submitter can see them on a shareable result page.
          </p>
          <p className="leading-7 text-muted-foreground">
            Evidence published to IPFS is public and immutable. Do not submit personal,
            confidential, or sensitive information in project names, polygons, or supporting
            data.
          </p>
          <p className="leading-7 text-muted-foreground">
            Satellite, blockchain RPC, IPFS, bot-protection, optional language-model, and
            database providers may process data as needed to operate the service. Their
            privacy practices apply to information they handle.
          </p>
          <p className="leading-7 text-muted-foreground">
            When a polygon map is opened, the browser requests map tiles from CARTO and
            OpenStreetMap. Those requests reveal the approximate map viewport to those
            providers. Public project APIs do not return polygon coordinates.
          </p>
        </Card>
      </article>
    </PageTransition>
  );
}

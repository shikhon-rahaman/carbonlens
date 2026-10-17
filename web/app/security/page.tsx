import type { Metadata } from "next";

import { PageTransition } from "@/components/page-transition";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <PageTransition>
      <article className="section-shell max-w-4xl py-16 sm:py-24">
        <p className="eyebrow">SECURITY.md</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Security & disclosure</h1>
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="text-lg font-semibold">Reporting a vulnerability</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Please report suspected vulnerabilities privately through the project’s GitHub
            Security tab using GitHub Security Advisories. Do not open a public issue or
            include secrets, private keys, personal information, or exploit details in
            public channels.
          </p>
          <p className="mt-4 leading-7 text-muted-foreground">
            CarbonLens is a testnet demonstration, not a production registry or regulated
            carbon-credit service. Do not submit real-world sensitive information.
          </p>
        </Card>
      </article>
    </PageTransition>
  );
}

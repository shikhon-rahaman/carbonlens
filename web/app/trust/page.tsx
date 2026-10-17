import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleAlert, Shield } from "lucide-react";

import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Trust, security & limitations",
  description: "Security controls, responsible AI principles, known limitations, and vulnerability reporting for CarbonLens."
};

const securityHighlights = [
  "Strict request schemas, bounded payloads, rate limits, and server-side Turnstile checks.",
  "Signing keys and provider credentials remain in the API environment, never in the browser bundle.",
  "The browser renders API text as text and applies a nonce-based Content Security Policy.",
  "Polygon overlap checks, idempotency, and a persisted daily cap reduce duplicate registration and gas-spend risk."
];

const limitations = [
  "A centralized verifier decides the score and submits any testnet attestation; the contract does not independently validate satellite analysis.",
  "NDVI is affected by clouds, seasons, biome differences, resolution, data gaps, and classification error.",
  "A vegetation score does not establish land ownership, carbon stock, additionality, permanence, biodiversity, or credit eligibility.",
  "IPFS content is public and can be difficult or impossible to remove after pinning.",
  "Availability depends on free-tier APIs, satellite providers, RPC services, and testnet infrastructure."
];

const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL;
const advisoryUrl = githubUrl ? `${githubUrl.replace(/\/+$/, "")}/security/advisories/new` : undefined;
const documentationUrl = githubUrl
  ? `${githubUrl.replace(/\/+$/, "")}/blob/main/docs`
  : undefined;

export default function TrustPage() {
  return (
    <PageTransition>
      <div className="section-shell max-w-5xl py-12 sm:py-16">
        <p className="eyebrow">Responsible by design, not by assertion</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Trust starts with clear boundaries.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
          CarbonLens is an experimental testnet demonstration. Controls reduce specific risks; they do not guarantee security, accuracy, or availability.
        </p>

        <div className="mt-9 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Shield aria-hidden="true" className="size-6 text-primary" />
              <CardTitle>Threat model highlights</CardTitle>
              <CardDescription>Safeguards currently implemented in the API and browser.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {securityHighlights.map((item) => (
                  <li className="flex gap-3 text-sm leading-6" key={item}>
                    <CheckCircle2 aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CircleAlert aria-hidden="true" className="size-6 text-warning" />
              <CardTitle>Known limitations</CardTitle>
              <CardDescription>Important risks and constraints that remain.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {limitations.map((item) => (
                  <li className="flex gap-3 text-sm leading-6" key={item}>
                    <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader>
            <CardTitle>Standards and review status</CardTitle>
            <CardDescription>No independent certification or external audit is claimed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>
              The security design uses OWASP ASVS concepts for input validation, browser security, and error handling, and STRIDE for threat identification. These are design references, not a claim of conformance or certification.
            </p>
            <p>
              The STRIDE threat model, privacy notes, scoring method, and frontend CSP rationale are documented in the source repository.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="sm" variant="outline"><Link href="/security">Frontend security notes <ArrowUpRight aria-hidden="true" /></Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/responsible-ai">Responsible AI <ArrowUpRight aria-hidden="true" /></Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/privacy">Privacy notes <ArrowUpRight aria-hidden="true" /></Link></Button>
            </div>
            {documentationUrl ? (
              <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-2">
                <li><a className="font-medium text-primary hover:underline" href={`${documentationUrl}/THREAT_MODEL.md`} rel="noreferrer" target="_blank">Threat model ↗</a></li>
                <li><a className="font-medium text-primary hover:underline" href={`${documentationUrl}/SCORING.md`} rel="noreferrer" target="_blank">Scoring method ↗</a></li>
                <li><a className="font-medium text-primary hover:underline" href={`${githubUrl!.replace(/\/+$/, "")}/blob/main/SECURITY.md`} rel="noreferrer" target="_blank">Security policy ↗</a></li>
              </ul>
            ) : (
              <p className="pt-2 text-xs">Threat model and scoring documentation are included in the source repository.</p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-5 border-primary/15 bg-primary/[0.035]">
          <CardHeader>
            <CardTitle>Report a vulnerability privately</CardTitle>
            <CardDescription className="text-foreground">Do not publish exploitable details or secrets in a public issue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6">
            <p>
              Use the repository’s GitHub Security Advisories tab. Please include reproducible steps and impact, but do not include real personal data, private keys, or credentials.
            </p>
            {advisoryUrl ? (
              <Button asChild size="sm">
                <a href={advisoryUrl} rel="noreferrer" target="_blank">Open private reporting <ArrowUpRight aria-hidden="true" /></a>
              </Button>
            ) : (
              <p>The private-reporting link is not configured in this deployment. Open the source repository’s Security tab to report.</p>
            )}
            <p>Expected acknowledgement: within 3 business days; initial assessment: within 7 business days, subject to maintainer availability.</p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}

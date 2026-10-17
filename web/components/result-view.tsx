"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis
} from "recharts";
import { ArrowUpRight, Check, Clipboard, Info } from "lucide-react";

import { ProjectMap } from "@/components/project-map";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { toast } from "@/components/ui/toast";
import type { GeoJSONFeature } from "@/lib/geojson";
import type { ProjectResult } from "@/lib/api";

function safeEvidenceHref(uri: string): string | undefined {
  if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  try {
    const url = new URL(uri);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function explorerHref(hash: string): string | undefined {
  const base = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL || "https://sepolia.etherscan.io";
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return undefined;
    return `${url.href.replace(/\/+$/, "")}/tx/${encodeURIComponent(hash)}`;
  } catch {
    return undefined;
  }
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard", label);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy unavailable", "Select and copy the value manually.");
    }
  }

  return (
    <Button aria-label={`Copy ${label}`} onClick={copy} size="icon" variant="ghost">
      {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
    </Button>
  );
}

const breakdownLabels = {
  vegetation: "Vegetation",
  stability: "Stability",
  consistency: "Claim consistency"
} as const;

export function ResultView({
  result,
  name,
  claimedHectares,
  geojson
}: {
  result: ProjectResult;
  name?: string;
  claimedHectares?: number;
  geojson?: GeoJSONFeature;
}) {
  const evidenceHref = safeEvidenceHref(result.evidence_uri);
  const transactionHref = result.tx_hash ? explorerHref(result.tx_hash) : undefined;
  const title = name || `Project ${result.project_id.slice(0, 8)}`;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div
          aria-live="polite"
          className={`border-b px-6 py-4 ${
            result.status === "verified"
              ? "border-success/20 bg-success/10"
              : result.status === "duplicate"
                ? "border-warning/20 bg-warning/10"
                : "border-destructive/20 bg-destructive/10"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <StatusBadge status={result.status} />
              <p className="mt-2 text-sm font-medium">
                {result.status === "verified"
                  ? "Registration completed on the configured test network."
                  : result.status === "duplicate"
                    ? "This region was already represented; no second registration was created."
                    : "The project did not meet the configured registration threshold."}
              </p>
            </div>
            <Badge variant="outline">
              {result.data_source === "live" ? "Live satellite data" : "Cached satellite data"}
            </Badge>
          </div>
        </div>
        <CardContent className="grid gap-7 p-6 md:grid-cols-[auto_1fr] md:items-center md:p-8">
          <ScoreGauge className="mx-auto size-40" label="Overall vegetation evidence score" score={result.score} size={160} />
          <div className="min-w-0">
            <p className="eyebrow">Verification result</p>
            <h1 className="mt-2 break-words text-3xl font-semibold tracking-[-0.05em]">{title}</h1>
            <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">{result.explanation}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant={result.confidence === "high" ? "verified" : "secondary"}>
                {result.confidence === "high" ? "Higher confidence" : "Lower confidence"}
              </Badge>
              {claimedHectares !== undefined && (
                <Badge variant="outline">{claimedHectares.toLocaleString()} ha claimed</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score breakdown</CardTitle>
            <CardDescription>Three components contribute to the combined score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {(Object.keys(breakdownLabels) as Array<keyof typeof breakdownLabels>).map((key) => {
              const value = result.breakdown[key];
              return (
                <div key={key}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span>{breakdownLabels[key]}</span>
                    <span className="font-semibold tabular-nums">{Math.round(value)} / 100</span>
                  </div>
                  <div
                    aria-label={`${breakdownLabels[key]} score`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={value}
                    className="h-2.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vegetation signal over time</CardTitle>
            <CardDescription>NDVI observations returned by the verification service.</CardDescription>
          </CardHeader>
          <CardContent>
            {result.ndvi_series.length ? (
              <>
                <div
                  aria-label="NDVI values over time; an accessible data table follows"
                  className="h-56 w-full"
                  role="img"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <AreaChart data={result.ndvi_series} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                      <defs>
                        <linearGradient id="ndvi-fill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                      <XAxis axisLine={false} dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis axisLine={false} domain={[-1, 1]} tick={{ fontSize: 11 }} tickLine={false} />
                      <ChartTooltip formatter={(value) => [Number(value).toFixed(3), "NDVI"]} />
                      <Area dataKey="value" fill="url(#ndvi-fill)" stroke="hsl(var(--primary))" strokeWidth={2} type="monotone" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <details className="mt-3 rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">View chart data as a table</summary>
                  <div className="mt-3 max-h-52 overflow-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">NDVI observations by date</caption>
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="py-2 pr-4 font-medium" scope="col">Date</th>
                          <th className="py-2 font-medium" scope="col">NDVI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.ndvi_series.map((point) => (
                          <tr className="border-b border-border/60 last:border-0" key={point.date}>
                            <td className="py-2 pr-4">{point.date}</td>
                            <td className="py-2 tabular-nums">{point.value.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                No NDVI observations were returned for this result.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {geojson && (
        <Card>
          <CardHeader>
            <CardTitle>Submitted polygon</CardTitle>
            <CardDescription>
              Geometry is stored only in this browser for your convenience; it is not included in public project records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectMap className="h-[320px] overflow-hidden rounded-xl" geojson={geojson} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Review flags</CardTitle>
            <CardDescription>Notes returned by the scoring service.</CardDescription>
          </CardHeader>
          <CardContent>
            {result.flags.length ? (
              <ul className="space-y-2">
                {result.flags.map((flag, index) => (
                  <li className="flex gap-2 rounded-lg bg-muted/70 p-3 text-sm leading-6" key={`${index}-${flag}`}>
                    <Info aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No scoring flags were reported.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evidence & provenance</CardTitle>
            <CardDescription>Shareable result identifiers and verification links.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">PROJECT ID</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all text-xs">{result.project_id || "Not assigned"}</code>
                {result.project_id && <CopyValue label="project ID" value={result.project_id} />}
              </div>
            </div>
            {result.evidence_hash && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">EVIDENCE HASH</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-xs">{result.evidence_hash}</code>
                  <CopyValue label="evidence hash" value={result.evidence_hash} />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {transactionHref && (
                <a className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-primary hover:underline" href={transactionHref} rel="noreferrer" target="_blank">
                  View transaction <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
              )}
              {evidenceHref && (
                <a className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-primary hover:underline" href={evidenceHref} rel="noreferrer" target="_blank">
                  View pinned evidence <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
              )}
              {!transactionHref && !evidenceHref && (
                <p className="text-sm text-muted-foreground">
                  No public transaction or evidence URL is available for this result.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/15 bg-primary/[0.035]">
        <CardHeader>
          <CardTitle>What this means — and what it doesn’t</CardTitle>
          <CardDescription>
            A vegetation signal helps review a land claim; it is not a complete environmental assessment.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <h2 className="font-semibold">What it means</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The score summarizes the available NDVI observations and the submitted area claim using the published scoring method.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">What it doesn’t mean</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              It does not prove land ownership, carbon stock, additionality, permanence, biodiversity, or eligibility for a credit.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

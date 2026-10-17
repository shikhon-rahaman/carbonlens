import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Leaf,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import Link from "next/link";

import { HowItWorks } from "@/components/how-it-works";
import { LiveStats } from "@/components/live-stats";
import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { Tooltip } from "@/components/ui/tooltip";

const chartPoints = [
  [0, 48],
  [28, 45],
  [56, 47],
  [84, 36],
  [112, 39],
  [140, 31],
  [168, 33],
  [196, 25],
  [224, 29],
  [252, 18],
  [280, 22],
  [308, 12]
]
  .map(([x, y]) => `${x},${y}`)
  .join(" ");

export default function HomePage() {
  return (
    <PageTransition>
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-48 -top-44 -z-10 size-[34rem] rounded-full bg-primary/5 blur-3xl"
        />
        <div className="section-shell grid min-h-[680px] items-center gap-14 py-20 lg:grid-cols-[1.04fr_0.96fr] lg:py-24">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1.5 text-xs font-semibold text-primary">
              <Sparkles aria-hidden="true" className="size-3.5" />
              Satellite evidence, clearly explained
            </div>
            <h1 className="text-balance mt-7 text-5xl font-semibold leading-[1.02] tracking-[-0.065em] sm:text-6xl lg:text-[4.35rem]">
              Land claims are hard to verify.
              <br />
              <span className="text-primary">Satellite evidence makes them inspectable.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              CarbonLens brings vegetation signals, transparent scoring, and evidence provenance into one careful review.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/verify">
                  Verify a land claim
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/projects">
                  Browse public projects
                  <ArrowDownRight aria-hidden="true" className="size-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                Evidence-first by design
              </span>
              <span className="inline-flex items-center gap-2">
                <Check aria-hidden="true" className="size-4 text-primary" />
                Transparent limitations
              </span>
              <Tooltip content="This is a testnet demonstration. No financial or carbon-credit claims are made.">
                <button
                  aria-label="About the testnet demonstration"
                  className="inline-flex items-center gap-1.5 rounded-sm"
                  type="button"
                >
                  <CircleHelp aria-hidden="true" className="size-4" />
                  Testnet demonstration
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[580px]" id="evidence">
            <div
              aria-hidden="true"
              className="absolute -left-8 top-14 -z-10 size-52 rounded-full bg-[hsl(var(--accent))] opacity-70 blur-3xl"
            />
            <Card className="overflow-hidden rounded-2xl border-border/80 shadow-float">
              <CardHeader className="flex-row items-start justify-between border-b border-border/70 px-6 py-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">ILLUSTRATIVE RESULT</p>
                  <p className="mt-1.5 text-base font-semibold tracking-tight">Atlantic forest sample</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                  Verified
                </span>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  <ScoreGauge className="size-[132px]" label="Overall project score" score={91} size={132} />
                  <div>
                    <p className="text-sm font-semibold">Strong vegetation signal</p>
                    <p className="mt-1.5 max-w-[230px] text-sm leading-6 text-muted-foreground">
                      Consistent observations across the available quarterly series.
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Live satellite data · 12 observations
                    </p>
                  </div>
                </div>

                <div className="mt-7 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/70 p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">VEGETATION</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">94</p>
                  </div>
                  <div className="rounded-lg bg-muted/70 p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">STABILITY</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">88</p>
                  </div>
                  <div className="rounded-lg bg-muted/70 p-3">
                    <p className="text-[11px] font-medium text-muted-foreground">CONSISTENCY</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">92</p>
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-border/70 bg-background p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">NDVI over time</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Quarterly median · 2023–25</p>
                    </div>
                    <span className="text-xs font-medium text-primary">Season-aware</span>
                  </div>
                  <svg
                    aria-label="Illustrative quarterly vegetation trend from 2023 to 2025"
                    className="mt-4 h-20 w-full overflow-visible"
                    preserveAspectRatio="none"
                    role="img"
                    viewBox="0 0 308 60"
                  >
                    <defs>
                      <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M ${chartPoints.replaceAll(" ", " L ")} L 308 60 L 0 60 Z`}
                      fill="url(#chart-fill)"
                    />
                    <polyline
                      fill="none"
                      points={chartPoints}
                      stroke="hsl(var(--primary))"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <div aria-hidden="true" className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>2023</span>
                    <span>2024</span>
                    <span>2025</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="absolute -bottom-5 -left-5 hidden rounded-xl border bg-surface-raised p-3 shadow-card sm:flex sm:items-center sm:gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Leaf aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold">Evidence hashed</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">0x7f3a…91c2</p>
              </div>
              <ArrowUpRight aria-hidden="true" className="ml-2 size-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Platform trust signals" className="border-y border-border/70 bg-surface">
        <div className="section-shell grid gap-8 py-7 sm:grid-cols-3 sm:gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Leaf aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">On-chain testnet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Transactions are publicly inspectable</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Open source</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Scoring method and limitations documented</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
              <CircleHelp aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Evidence, not a guarantee</p>
              <p className="mt-0.5 text-xs text-muted-foreground">A signal, not a carbon rating</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="registry-stats-title" className="section-shell py-14 sm:py-16">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Registry at a glance</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]" id="registry-stats-title">
              Live testnet activity
            </h2>
          </div>
          <Link className="text-sm font-semibold text-primary hover:underline" href="/projects">
            Browse project records <ArrowRight aria-hidden="true" className="inline size-4" />
          </Link>
        </div>
        <LiveStats />
      </section>

      <HowItWorks />

      <section className="section-shell py-24 sm:py-30" id="method">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="max-w-lg">
            <p className="eyebrow">A measured approach</p>
            <h2 className="text-balance mt-4 text-3xl font-semibold leading-tight tracking-[-0.05em] sm:text-4xl">
              A clear signal.
              <br />
              Never the whole story.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              A vegetation index can help make a land claim easier to examine. It cannot
              establish ownership, additionality, permanence, or the amount of carbon stored.
            </p>
            <Link
              className="mt-6 inline-flex items-center gap-2 rounded-sm text-sm font-semibold text-primary hover:underline"
              href="/responsible-ai"
            >
              Read our responsible-use principles
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Leaf aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-5 font-semibold">Observe over time</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Quarterly Sentinel-2 NDVI observations show vegetation patterns, with
                same-quarter comparisons helping account for seasonality.
              </p>
            </Card>
            <Card className="p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-5 font-semibold">Keep the evidence linked</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                A canonical evidence record is hashed so a reviewer can compare the
                published artifact with the verification result.
              </p>
            </Card>
            <Card className="p-6 sm:col-span-2">
              <div className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <CircleHelp aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h3 className="font-semibold">Interpret with care</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Cloud cover, seasonality, biome differences, resolution, and missing
                    observations can all shape a score. Results need human review and do not
                    replace field verification.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-primary text-primary-foreground" id="principles">
        <div className="section-shell grid gap-8 py-16 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/70">
              Built for careful review
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
              Better evidence starts with honest boundaries.
            </h2>
            <p className="mt-4 leading-7 text-primary-foreground/80">
              CarbonLens is a testnet demo for exploring vegetation evidence—not a regulated
              registry, independent audit, or carbon-credit valuation.
            </p>
          </div>
          <Button asChild className="w-fit" size="lg" variant="secondary">
            <Link href="/verify">
              Review a project
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </PageTransition>
  );
}

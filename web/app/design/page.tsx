"use client";

import { ArrowRight, Check, Leaf, Sparkles } from "lucide-react";
import Link from "next/link";

import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { EmptyState, EmptyStateAction } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

export default function DesignPage() {
  return (
    <PageTransition>
      <div className="section-shell py-14 sm:py-20">
        <div className="flex flex-col justify-between gap-6 border-b border-border pb-8 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Visual QA · Not in navigation</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em]">Design system</h1>
            <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
              CarbonLens interface primitives, semantic states, and accessible interaction
              patterns.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/">
              Back to home
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Buttons & feedback</CardTitle>
              <CardDescription>Clear hierarchy, restrained motion, readable states.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button>Primary action</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button disabled>Disabled</Button>
                <Button
                  onClick={() => toast.success("Your preferences are saved.", "This is a sample toast.")}
                  variant="destructive"
                >
                  Show toast
                </Button>
                <Tooltip content="Satellite data is used to estimate observed vegetation health.">
                  <Button aria-label="Show scoring information" size="icon" variant="outline">
                    <Sparkles aria-hidden="true" />
                  </Button>
                </Tooltip>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge>Evidence attached</Badge>
                <Badge variant="secondary">Cached data</Badge>
                <Badge variant="outline">Under review</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verification status</CardTitle>
              <CardDescription>Semantic color is paired with a readable label.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <StatusBadge status="verified" />
              <StatusBadge status="rejected" />
              <StatusBadge status="duplicate" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Score gauge</CardTitle>
              <CardDescription>
                The score is available as text to assistive technology and without color.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-8">
              <ScoreGauge label="Example score" score={86} />
              <ScoreGauge label="Moderate example score" score={63} size={128} />
              <ScoreGauge label="Low example score" score={38} size={112} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verification progress</CardTitle>
              <CardDescription>Progress is conveyed in order and with text.</CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ProgressStepper
                currentStep={2}
                steps={["Project", "Evidence", "Review", "Complete"]}
              />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <p className="eyebrow">Summary metrics</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat detail="Across 12 observations" label="Vegetation score" value="86 / 100" trend="up" />
              <Stat detail="Compared with prior year" label="Quarterly change" value="−2.4%" trend="down" />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Loading state</CardTitle>
              <CardDescription>Skeletons preserve layout while content is loading.</CardDescription>
            </CardHeader>
            <CardContent>
              <div aria-label="Loading project summary" role="status">
                <span className="sr-only">Loading project summary</span>
                <div className="flex items-center gap-4">
                  <Skeleton className="size-14 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
                <Skeleton className="mt-5 h-20 w-full" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Empty state</CardTitle>
              <CardDescription>Explain what belongs here and give a next step.</CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                action={
                  <EmptyStateAction onClick={() => toast.info("No projects yet.")}>
                    Explore the demo
                  </EmptyStateAction>
                }
                description="Project results will appear here after a region has been reviewed."
                icon={Leaf}
                title="Nothing here just yet"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error state</CardTitle>
              <CardDescription>Offer an understandable recovery path.</CardDescription>
            </CardHeader>
            <CardContent>
              <ErrorState
                description="The service is taking a moment. Your project data has not been changed."
                onRetry={() => toast.info("Retry requested.")}
                title="We couldn't load this result"
              />
            </CardContent>
          </Card>
        </div>

        <section aria-labelledby="type-heading" className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight" id="type-heading">
            Type & semantic palette
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <p className="text-4xl font-semibold tracking-[-0.055em]">Evidence before claims.</p>
              <p className="mt-4 leading-7 text-muted-foreground">
                Geist with optical sizing, tight display tracking, and comfortable reading
                rhythm for long-form detail.
              </p>
              <p className="mt-4 font-mono text-xs text-muted-foreground">
                0x4a…e91b · 2025-10-01 · NDVI 0.82
              </p>
            </Card>
            <Card className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3">
              {[
                ["Forest", "bg-primary"],
                ["Success", "bg-success"],
                ["Caution", "bg-warning"],
                ["Attention", "bg-destructive"],
                ["Warm surface", "bg-accent"],
                ["Quiet surface", "bg-muted"]
              ].map(([label, color]) => (
                <div className="flex items-center gap-2.5" key={label}>
                  <span aria-hidden="true" className={`size-7 rounded-lg ${color}`} />
                  <span className="text-xs font-medium">{label}</span>
                </div>
              ))}
            </Card>
          </div>
        </section>

        <div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
          <Check aria-hidden="true" className="size-4 text-success" />
          Interactive focus states, dark theme, reduced motion, and keyboard access are built in.
        </div>
      </div>
    </PageTransition>
  );
}

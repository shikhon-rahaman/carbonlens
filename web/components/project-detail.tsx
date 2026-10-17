"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Share2 } from "lucide-react";

import { ResultView } from "@/components/result-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type ProjectResult } from "@/lib/api";
import { getProjectMetadata, type LocalProjectMetadata } from "@/lib/project-metadata";
import { toast } from "@/components/ui/toast";

export function ProjectDetail({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectResult | null>(null);
  const [metadata, setMetadata] = useState<LocalProjectMetadata>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const record = await api.project(projectId);
      setProject(record);
      setMetadata(getProjectMetadata(projectId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Shareable project link copied.");
    } catch {
      toast.error("Copy unavailable", "Copy the page address from your browser.");
    }
  }

  return (
    <div className="section-shell max-w-5xl py-10 sm:py-14">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost">
          <Link href="/projects"><ArrowLeft aria-hidden="true" /> All projects</Link>
        </Button>
        <Button onClick={share} variant="outline">
          <Share2 aria-hidden="true" /> Copy share link
        </Button>
      </div>
      <div aria-live="polite">
        {loading ? (
          <div className="space-y-5">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            description="This project could not be found or the registry is temporarily unavailable."
            onRetry={() => void load()}
            title="Project details unavailable"
          />
        ) : project ? (
          <ResultView
            claimedHectares={metadata?.claimed_hectares}
            geojson={metadata?.geojson}
            name={metadata?.name}
            result={project}
          />
        ) : (
          <EmptyState description="No result was returned for this project." title="Project not found" />
        )}
      </div>
      {!loading && project && !metadata && (
        <Card className="mt-6 border-warning/20 bg-warning/5">
          <CardContent className="p-4 text-sm leading-6">
            This shareable record does not include project names, claimed area, or polygon coordinates. These private submission details are available only in the browser that submitted the project.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

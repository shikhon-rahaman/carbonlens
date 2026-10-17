"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Map, MapPin, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ProjectMap } from "@/components/project-map";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type ProjectResult } from "@/lib/api";
import { getProjectMetadata, type LocalProjectMetadata } from "@/lib/project-metadata";

const PAGE_SIZE = 20;
type FilterValue = "all" | ProjectResult["status"];

function isFilterValue(value: string): value is FilterValue {
  return value === "all" || value === "verified" || value === "rejected" || value === "duplicate";
}

export function ProjectsBrowser() {
  const [projects, setProjects] = useState<ProjectResult[]>([]);
  const [metadata, setMetadata] = useState<Record<string, LocalProjectMetadata>>({});
  const [filter, setFilter] = useState<FilterValue>("all");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mapProject, setMapProject] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.projects(PAGE_SIZE, offset);
      setProjects(response.projects);
      setTotal(response.total);
      setMetadata(
        Object.fromEntries(
          response.projects
            .map((project) => [project.project_id, getProjectMetadata(project.project_id)] as const)
            .filter((entry): entry is readonly [string, LocalProjectMetadata] => Boolean(entry[1]))
        )
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { void load(); }, [load]);

  const filteredProjects = useMemo(
    () => projects.filter((project) => filter === "all" || project.status === filter),
    [filter, projects]
  );
  const hasNext = offset + projects.length < total;

  return (
    <div className="section-shell py-12 sm:py-16">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Public registry</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Projects</h1>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
            Browse public verification results. Exact polygon geometry is not exposed by the API.
          </p>
        </div>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="project-filter">
          Filter by status
          <select
            className="h-10 rounded-md border border-input bg-background px-3"
            id="project-filter"
            onChange={(event) => {
              if (isFilterValue(event.target.value)) setFilter(event.target.value);
            }}
            value={filter}
          >
            <option value="all">All statuses</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
          </select>
        </label>
      </div>

      <div aria-live="polite" className="mt-8">
        {loading ? (
          <div aria-label="Loading project results" className="space-y-3" role="status">
            {[0, 1, 2].map((item) => <Skeleton className="h-32 w-full" key={item} />)}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => void load()} title="Projects could not be loaded" />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            description={projects.length ? "No projects match this status filter." : "No public project results are available yet."}
            title={projects.length ? "No matching results" : "The registry is quiet"}
          />
        ) : (
          <div className="space-y-3">
            {filteredProjects.map((project) => {
              const local = metadata[project.project_id];
              const isMapOpen = mapProject === project.project_id;
              return (
                <Card key={project.project_id}>
                  <CardContent className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={project.status} />
                        <Badge variant="outline">{project.data_source === "live" ? "Live data" : "Cached data"}</Badge>
                      </div>
                      <Link
                        className="mt-3 block break-all text-base font-semibold hover:text-primary hover:underline"
                        href={`/projects/${encodeURIComponent(project.project_id)}`}
                      >
                        {local?.name || `Project ${project.project_id.slice(0, 12)}`}
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Score {project.score}/100 · {local ? `${local.claimed_hectares.toLocaleString()} ha claimed` : "Area not included in public API"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-2xl font-semibold tabular-nums">{project.score}</span>
                      {local && (
                        <Button
                          aria-expanded={isMapOpen}
                          onClick={() => setMapProject(isMapOpen ? null : project.project_id)}
                          size="sm"
                          variant="outline"
                        >
                          <Map aria-hidden="true" /> {isMapOpen ? "Hide map" : "Show polygon"}
                        </Button>
                      )}
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/projects/${encodeURIComponent(project.project_id)}`}>
                          Details <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                  {isMapOpen && local && (
                    <div className="border-t border-border p-4">
                      <ProjectMap className="h-[280px] overflow-hidden rounded-xl" geojson={local.geojson} />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {!loading && !error && projects.length > 0 && (
        <nav aria-label="Project pagination" className="mt-7 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}–{offset + projects.length} of {total} results
          </p>
          <div className="flex gap-2">
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} size="sm" variant="outline">
              <ArrowLeft aria-hidden="true" /> Previous
            </Button>
            <Button disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)} size="sm" variant="outline">
              Next <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </nav>
      )}
      {!loading && !error && projects.length > 0 && !Object.keys(metadata).length && (
        <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          The API intentionally omits polygon coordinates. Geometry appears only in this browser after your own submission.
        </p>
      )}
      {!loading && !error && projects.length > 0 && <Button className="mt-5" onClick={() => void load()} variant="ghost"><RefreshCw aria-hidden="true" /> Refresh</Button>}
    </div>
  );
}

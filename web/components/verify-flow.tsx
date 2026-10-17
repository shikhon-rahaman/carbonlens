"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, LoaderCircle, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, type ProjectResult } from "@/lib/api";
import { GeoJSONInputError, parseGeoJSONText } from "@/lib/geojson";
import { saveProjectMetadata } from "@/lib/project-metadata";
import { toast } from "@/components/ui/toast";

const demoSites = [
  {
    label: "Healthy forest",
    scenario: "healthy",
    description: "Illustrative vegetation sample",
    feature: {
      type: "Feature",
      properties: { name: "Healthy forest sample" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-60, -3],
          [-59.994, -3],
          [-59.994, -2.994],
          [-60, -2.994],
          [-60, -3]
        ]]
      }
    }
  },
  {
    label: "Deforested area",
    scenario: "deforested",
    description: "Illustrative lower-vegetation sample",
    feature: {
      type: "Feature",
      properties: { name: "Deforested sample" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-60.1, -3.1],
          [-60.092, -3.1],
          [-60.092, -3.092],
          [-60.1, -3.092],
          [-60.1, -3.1]
        ]]
      }
    }
  },
  {
    label: "Overlapping area",
    description: "Intersects the healthy sample",
    feature: {
      type: "Feature",
      properties: { name: "Overlapping sample" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-59.997, -3],
          [-59.991, -3],
          [-59.991, -2.994],
          [-59.997, -2.994],
          [-59.997, -3]
        ]]
      }
    }
  }
] as const;

const verificationStages = [
  "Checking registry",
  "Fetching satellite data",
  "Scoring",
  "Writing to blockchain"
];

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const cachedDemoMode = process.env.NEXT_PUBLIC_CACHED_DEMO_MODE === "true";
const Turnstile = dynamic(
  () => import("@marsidev/react-turnstile").then((module) => module.Turnstile),
  { ssr: false }
);
const ResultView = dynamic(
  () => import("@/components/result-view").then((module) => module.ResultView),
  {
    ssr: false,
    loading: () => (
      <div aria-label="Loading verification result" className="space-y-3" role="status">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
);

export function VerifyFlow() {
  const router = useRouter();
  const controller = useRef<AbortController | null>(null);
  const [step, setStep] = useState(0);
  const previousStep = useRef(step);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [hectares, setHectares] = useState("");
  const [geojsonText, setGeojsonText] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [demoScenario, setDemoScenario] = useState<"healthy" | "deforested" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<ProjectResult | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const parsedFeature = useMemo(() => {
    try {
      return geojsonText ? parseGeoJSONText(geojsonText) : undefined;
    } catch {
      return undefined;
    }
  }, [geojsonText]);

  useEffect(() => {
    if (previousStep.current !== step) {
      stepHeading.current?.focus();
      previousStep.current = step;
    }
  }, [step]);

  function chooseDemo(index: number) {
    const site = demoSites[index];
    setGeojsonText(JSON.stringify(site.feature, null, 2));
    setName(site.feature.properties.name);
    setHectares("40");
    setDemoScenario("scenario" in site ? site.scenario : null);
    setError("");
  }

  function moveToDetails() {
    try {
      parseGeoJSONText(geojsonText);
      setError("");
      setStep(1);
    } catch (cause) {
      setError(cause instanceof GeoJSONInputError ? cause.message : "Check the polygon and try again.");
    }
  }

  function moveToTurnstile() {
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Enter a project name.");
      return;
    }
    if (new TextEncoder().encode(cleanName).length > 64) {
      setError("Project names must be 64 UTF-8 bytes or fewer.");
      return;
    }
    const amount = Number(hectares);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000) {
      setError("Enter an area greater than 0 and no more than 50,000 hectares.");
      return;
    }
    setError("");
    setStep(2);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    let geojson;
    try {
      geojson = parseGeoJSONText(geojsonText);
    } catch (cause) {
      setStep(0);
      setError(cause instanceof GeoJSONInputError ? cause.message : "Check the polygon and try again.");
      return;
    }

    const developmentBypass =
      (process.env.NODE_ENV === "development" && !turnstileSiteKey) || cachedDemoMode;
    const token = developmentBypass ? "local-development-bypass" : turnstileToken;
    if (!token) {
      setError("Complete the bot check before submitting.");
      return;
    }

    const abortController = new AbortController();
    controller.current = abortController;
    setBusy(true);
    setError("");
    setProgressMessage("Request submitted. The API does not stream its internal stages.");
    try {
      const result = await api.verify(
        {
          name: name.trim(),
          claimed_hectares: Number(hectares),
          geojson,
          turnstile_token: token,
          ...(demoScenario ? { demo_scenario: demoScenario } : {})
        },
        abortController.signal
      );
      setAccepted(result);
      if (result.project_id && result.status !== "duplicate") {
        try {
          saveProjectMetadata(result.project_id, {
            name: name.trim(),
            claimed_hectares: Number(hectares),
            geojson
          });
        } catch {
          toast.error("Result saved; local map details could not be stored.");
        }
      }
      setProgressMessage("Verification response received.");
      if (result.project_id && result.status !== "duplicate") {
        router.push(`/projects/${encodeURIComponent(result.project_id)}`);
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "aborted") {
        setProgressMessage("Stopped waiting in this browser. The API may still finish processing.");
        setError("The browser stopped waiting for a result; this does not guarantee the server canceled the request.");
      } else {
        setProgressMessage("");
        setError(cause instanceof Error ? cause.message : "The verification request failed.");
      }
    } finally {
      setBusy(false);
      controller.current = null;
      setTurnstileToken("");
    }
  }

  function stopWaiting() {
    controller.current?.abort();
  }

  return (
    <div className="section-shell max-w-5xl py-12 sm:py-16">
      <div className="max-w-2xl">
        <p className="eyebrow">Guided verification</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Review a land claim
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          Submit a polygon and claimed area for a testnet demonstration. No result proves ownership or carbon storage.
        </p>
      </div>

      <div className="mt-9">
        <ol aria-label="Verification form steps" className="grid grid-cols-3 gap-3">
          {["Location", "Project details", "Bot check & submit"].map((label, index) => (
            <li
              aria-current={step === index ? "step" : undefined}
              className={`rounded-lg border px-3 py-3 text-center text-sm font-medium ${
                step === index ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
              }`}
              key={label}
            >
              <span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-muted text-xs">{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      <form className="mt-6 space-y-6" noValidate onSubmit={submit}>
        {step === 0 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold tracking-tight" ref={stepHeading} tabIndex={-1}>Step 1 · Choose a location</h2>
              <CardDescription>Paste a GeoJSON Polygon or Feature, or use a clearly labeled demo site.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {demoSites.map((site, index) => (
                  <button
                    className="min-h-24 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/60"
                    key={site.label}
                    onClick={() => chooseDemo(index)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <MapPin aria-hidden="true" className="size-4 text-primary" />
                      {site.label}
                    </span>
                    <span className="mt-2 block text-sm leading-5 text-muted-foreground">{site.description}</span>
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="geojson">GeoJSON polygon</label>
                <textarea
                  autoCapitalize="off"
                  autoComplete="off"
                  className="min-h-52 w-full rounded-lg border border-input bg-background px-3 py-3 font-mono text-xs leading-5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id="geojson"
                  maxLength={256 * 1024}
                  onChange={(event) => {
                    setGeojsonText(event.target.value);
                    setDemoScenario(null);
                  }}
                  placeholder='{"type":"Feature","geometry":{"type":"Polygon","coordinates":[...]}}'
                  spellCheck={false}
                  value={geojsonText}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Polygon coordinates use longitude, latitude order. The API accepts up to 256 KB.
                  {parsedFeature ? " Polygon shape validated locally." : geojsonText ? " Review the GeoJSON before continuing." : ""}
                </p>
              </div>
              <div className="flex justify-end">
                <Button disabled={!geojsonText} onClick={moveToDetails} type="button">
                  Continue <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold tracking-tight" ref={stepHeading} tabIndex={-1}>Step 2 · Project details</h2>
              <CardDescription>These values are sent to the API and validated again on the server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="project-name">Project name</label>
                <input
                  autoComplete="organization"
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id="project-name"
                  maxLength={64}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
                <p className="mt-1 text-xs text-muted-foreground">Up to 64 UTF-8 bytes.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold" htmlFor="claimed-hectares">Claimed area (hectares)</label>
                <input
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
                  id="claimed-hectares"
                  max="50000"
                  min="0.01"
                  onChange={(event) => setHectares(event.target.value)}
                  required
                  step="any"
                  type="number"
                  value={hectares}
                />
                <p className="mt-1 text-xs text-muted-foreground">Greater than 0 and no more than 50,000.</p>
              </div>
              <div className="flex flex-wrap justify-between gap-3">
                <Button onClick={() => { setError(""); setStep(0); }} type="button" variant="outline">
                  <ArrowLeft aria-hidden="true" /> Back
                </Button>
                <Button onClick={moveToTurnstile} type="button">
                  Continue <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold tracking-tight" ref={stepHeading} tabIndex={-1}>Step 3 · Bot check and submit</h2>
              <CardDescription>Turnstile is verified by the API before it runs any verification work.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <p className="font-semibold">{name.trim()}</p>
                <p className="mt-1 text-sm text-muted-foreground">{Number(hectares).toLocaleString()} claimed hectares</p>
              </div>
              {cachedDemoMode ? (
                <div className="flex gap-3 rounded-lg border border-warning/25 bg-warning/10 p-4 text-sm leading-6">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
                  <p>Local cached demo mode uses reviewed sample satellite data and skips Turnstile. Successful registrations still require a real local testnet transaction.</p>
                </div>
              ) : turnstileSiteKey ? (
                <Turnstile
                  onError={() => {
                    setTurnstileToken("");
                    setError("The bot check could not load. Check your connection and try again.");
                  }}
                  onExpire={() => setTurnstileToken("")}
                  onSuccess={(token) => { setTurnstileToken(token); setError(""); }}
                  options={{ action: "verify", theme: "auto", appearance: "interaction-only" }}
                  siteKey={turnstileSiteKey}
                />
              ) : process.env.NODE_ENV === "development" ? (
                <div className="flex gap-3 rounded-lg border border-warning/25 bg-warning/10 p-4 text-sm leading-6">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
                  <p>The browser sends a development placeholder token. The API accepts it only with ENV=development and TURNSTILE_DEV_BYPASS=true.</p>
                </div>
              ) : (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6">
                  Turnstile is not configured. Verification is unavailable until the public site key is set.
                </p>
              )}
              <div className="flex flex-wrap justify-between gap-3">
                <Button disabled={busy} onClick={() => { setError(""); setStep(1); }} type="button" variant="outline">
                  <ArrowLeft aria-hidden="true" /> Back
                </Button>
                <Button
                  disabled={
                    busy ||
                    (!turnstileToken &&
                      process.env.NODE_ENV !== "development" &&
                      !cachedDemoMode)
                  }
                  type="submit"
                >
                  {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}
                  {busy ? "Submitting…" : "Submit for verification"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <p aria-live="assertive" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6 text-destructive" role="alert">
            {error}
          </p>
        )}
      </form>

      {(busy || progressMessage) && (
        <Card aria-live="polite" className="mt-6">
          <CardHeader>
            <CardTitle>{busy ? "Verification request in progress" : "Verification request status"}</CardTitle>
            <CardDescription>
              {progressMessage || "The browser receives the result when the API finishes."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <ProgressStepper currentStep={-1} steps={verificationStages} />
            <p className="text-xs leading-5 text-muted-foreground">
              Intermediate API stages are not streamed, so this interface does not estimate completion or show simulated progress.
            </p>
            {busy && (
              <Button onClick={stopWaiting} type="button" variant="outline">
                Stop waiting
              </Button>
            )}
            {!busy && accepted && (!accepted.project_id || accepted.status === "duplicate") && (
              <ResultView result={accepted} name={name} claimedHectares={Number(hectares)} geojson={parsedFeature} />
            )}
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Review how results should be interpreted on the <Link className="font-medium text-primary hover:underline" href="/trust">trust page</Link>.
      </p>
    </div>
  );
}

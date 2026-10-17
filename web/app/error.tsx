"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application route failed.", error.digest ? { digest: error.digest } : {});
  }, [error]);

  return (
    <main className="section-shell grid min-h-[55vh] place-items-center py-16 text-center" id="main-content" tabIndex={-1}>
      <div className="max-w-md">
        <p className="eyebrow">Temporary issue</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">This page could not be loaded.</h1>
        <p className="mt-3 leading-6 text-muted-foreground">No internal error details are shown here. Try again or return later.</p>
        <Button className="mt-6" onClick={() => reset()}>Try again</Button>
      </div>
    </main>
  );
}

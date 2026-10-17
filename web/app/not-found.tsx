import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

import { PageTransition } from "@/components/page-transition";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageTransition>
      <section className="section-shell grid min-h-[55vh] place-items-center py-16 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-primary">
            <SearchX aria-hidden="true" className="size-6" />
          </span>
          <p className="mt-5 eyebrow">404 · Page not found</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">This page isn’t in the registry.</h1>
          <p className="mt-3 leading-6 text-foreground">The address may be outdated, or this project may no longer be available.</p>
          <Button asChild className="mt-6"><Link href="/"><ArrowLeft aria-hidden="true" /> Return home</Link></Button>
        </div>
      </section>
    </PageTransition>
  );
}

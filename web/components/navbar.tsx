import Link from "next/link";
import { ArrowRight, Leaf } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Projects", href: "/projects" },
  { label: "Trust", href: "/trust" }
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="section-shell flex h-[76px] items-center justify-between gap-3">
        <Link
          aria-label="CarbonLens home"
          className="group inline-flex items-center gap-2.5 rounded-md"
          href="/"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform duration-fast ease-calm group-hover:-rotate-6">
            <Leaf aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.045em]">carbonlens</span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-6 lg:flex">
          {navigation.map((item) => (
            <Link
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <span className="hidden items-center gap-2 rounded-full border border-warning/25 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning sm:inline-flex">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
            Testnet demo
          </span>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/verify">
              <span className="hidden sm:inline">Verify a site</span>
              <span className="sm:hidden">Verify</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

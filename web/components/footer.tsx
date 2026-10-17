import { ArrowUpRight, Leaf } from "lucide-react";
import Link from "next/link";

const explorerOrigin = process.env.NEXT_PUBLIC_EXPLORER_BASE_URL;
const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const contractUrl =
  explorerOrigin && contractAddress
    ? `${explorerOrigin.replace(/\/+$/, "")}/address/${encodeURIComponent(contractAddress)}`
    : "https://sepolia.etherscan.io";

const footerLinks = [
  { label: "SECURITY.md", href: "/security", external: false },
  { label: "Privacy", href: "/privacy", external: false },
  { label: "Responsible AI", href: "/responsible-ai", external: false },
  { label: "Trust & security", href: "/trust", external: false },
  {
    label: "GitHub",
    href: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com",
    external: true
  }
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="section-shell py-10 sm:py-12">
        <div className="flex flex-col justify-between gap-9 md:flex-row md:items-start">
          <div className="max-w-sm">
            <Link className="inline-flex items-center gap-2.5" href="/">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Leaf aria-hidden="true" className="size-4" />
              </span>
              <span className="font-semibold tracking-[-0.04em]">carbonlens</span>
            </Link>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Satellite-derived vegetation evidence, made more transparent. A testnet
              demonstration—not a carbon credit rating.
            </p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-3">
            {footerLinks.map((link) => (
              link.external ? (
                <a
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  href={link.href}
                  key={link.label}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  href={link.href}
                  key={link.label}
                >
                  {link.label}
                </Link>
              )
            ))}
            <a
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              href={contractUrl}
              rel="noreferrer"
              target="_blank"
            >
              Contract explorer
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-border/80 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CarbonLens. Evidence before claims.</p>
          <p>Built for careful review. No financial or environmental guarantees.</p>
        </div>
      </div>
    </footer>
  );
}

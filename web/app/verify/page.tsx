import type { Metadata } from "next";

import { PageTransition } from "@/components/page-transition";
import { VerifyFlow } from "@/components/verify-flow";

export const metadata: Metadata = {
  title: "Verify a land claim",
  description: "Submit a GeoJSON polygon for transparent satellite-derived vegetation evidence."
};

export default function VerifyPage() {
  return <PageTransition><VerifyFlow /></PageTransition>;
}

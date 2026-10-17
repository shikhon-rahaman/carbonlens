import type { Metadata } from "next";

import { PageTransition } from "@/components/page-transition";
import { ProjectsBrowser } from "@/components/projects-browser";

export const metadata: Metadata = {
  title: "Public projects",
  description: "Browse public CarbonLens project verification records."
};

export default function ProjectsPage() {
  return <PageTransition><ProjectsBrowser /></PageTransition>;
}

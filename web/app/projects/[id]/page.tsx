import type { Metadata } from "next";

import { PageTransition } from "@/components/page-transition";
import { ProjectDetail } from "@/components/project-detail";

export const metadata: Metadata = {
  title: "Project result",
  description: "Review a shareable CarbonLens verification result."
};

export default async function ProjectDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PageTransition><ProjectDetail projectId={id} /></PageTransition>;
}

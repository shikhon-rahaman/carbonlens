"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, FileCheck2, Satellite, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    icon: FileCheck2,
    title: "Submit a polygon",
    detail: "Describe the claimed region with GeoJSON and a name."
  },
  {
    icon: Satellite,
    title: "Compare satellite signals",
    detail: "Review NDVI observations and transparent score components."
  },
  {
    icon: ShieldCheck,
    title: "Inspect the evidence",
    detail: "Follow result provenance and the testnet transaction, when available."
  }
];

export function HowItWorks() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="section-shell py-20 sm:py-24" id="how-it-works">
      <div className="max-w-xl">
        <p className="eyebrow">A transparent sequence</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
          From land claim to inspectable evidence.
        </h2>
      </div>
      <ol className="mt-9 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.li
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              key={step.title}
              transition={{ delay: reduceMotion ? 0 : index * 0.1, duration: 0.3 }}
              viewport={{ once: true, amount: 0.25 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <Card className="h-full p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </Card>
            </motion.li>
          );
        })}
      </ol>
      <Button asChild className="mt-7" variant="outline">
        <Link href="/verify">Start a verification <ArrowRight aria-hidden="true" /></Link>
      </Button>
    </section>
  );
}

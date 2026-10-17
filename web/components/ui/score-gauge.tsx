"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";

import { cn } from "@/lib/utils";

function scoreColor(score: number): string {
  if (score >= 75) return "hsl(var(--success))";
  if (score >= 50) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

export function ScoreGauge({
  score,
  label = "Project score",
  className,
  size = 160
}: {
  score: number;
  label?: string;
  className?: string;
  size?: number;
}) {
  const normalizedScore = Math.max(0, Math.min(100, score));
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = scoreColor(normalizedScore);

  return (
    <div
      aria-label={`${label}: ${normalizedScore} out of 100`}
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      role="img"
    >
      <svg
        aria-hidden="true"
        className="-rotate-90"
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <motion.circle
          animate={{ strokeDashoffset: circumference * (1 - normalizedScore / 100) }}
          cx={size / 2}
          cy={size / 2}
          fill="none"
          initial={
            reduceMotion
              ? false
              : { strokeDashoffset: circumference }
          }
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeLinecap="round"
          strokeWidth={stroke}
          transition={{ duration: reduceMotion ? 0 : 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-4xl font-semibold tabular-nums tracking-[-0.06em]">
          {normalizedScore}
        </span>
        <span className="mt-0.5 text-xs font-medium text-muted-foreground" id={titleId}>
          out of 100
        </span>
      </div>
      <span className="sr-only">{label}: {normalizedScore} out of 100</span>
    </div>
  );
}

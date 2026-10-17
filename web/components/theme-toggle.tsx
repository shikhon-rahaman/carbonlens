"use client";

import { Laptop2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button aria-label="Change color theme" className="size-10" size="icon" variant="ghost">
        <span aria-hidden="true" className="size-4" />
      </Button>
    );
  }

  const Icon = theme === "system" ? Laptop2 : resolvedTheme === "dark" ? Moon : Sun;
  const nextTheme = theme === "system" ? "light" : resolvedTheme === "light" ? "dark" : "system";

  return (
    <Button
      aria-label={`Change color theme, currently ${theme ?? "system"}`}
      className="size-10"
      onClick={() => setTheme(nextTheme)}
      size="icon"
      title={`Switch to ${nextTheme} theme`}
      variant="ghost"
    >
      <Icon aria-hidden="true" className="size-[18px]" />
    </Button>
  );
}

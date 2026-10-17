"use client";

import { ThemeProvider } from "next-themes";

import { ToastViewport } from "@/components/ui/toast";

export function Providers({
  children,
  nonce
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
      <ToastViewport />
    </ThemeProvider>
  );
}

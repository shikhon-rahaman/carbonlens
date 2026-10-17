"use client";

import { Check, Info, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ToastVariant = "success" | "error" | "info";
type ToastMessage = {
  id: number;
  variant: ToastVariant;
  message: string;
  description?: string;
};

const toastEventName = "carbonlens:toast";
let nextToastId = 0;

function isToastMessage(value: unknown): value is ToastMessage {
  return typeof value === "object" && value !== null &&
    "id" in value && typeof value.id === "number" &&
    "variant" in value && (value.variant === "success" || value.variant === "error" || value.variant === "info") &&
    "message" in value && typeof value.message === "string" &&
    (!("description" in value) || typeof value.description === "string");
}

function publishToast(variant: ToastVariant, message: string, description?: string) {
  if (typeof window === "undefined") return;

  const detail: ToastMessage = { id: ++nextToastId, variant, message };
  if (description !== undefined) detail.description = description;
  window.dispatchEvent(new CustomEvent(toastEventName, { detail }));
}

export const toast = {
  success: (message: string, description?: string) => publishToast("success", message, description),
  error: (message: string, description?: string) => publishToast("error", message, description),
  info: (message: string, description?: string) => publishToast("info", message, description)
};

function ToastNotice({
  notification,
  onDismiss
}: {
  notification: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(notification.id), 6000);
    return () => window.clearTimeout(timeout);
  }, [notification.id, onDismiss]);

  const Icon = notification.variant === "success"
    ? Check
    : notification.variant === "error"
      ? XCircle
      : Info;
  const tone = notification.variant === "error"
    ? "border-destructive/30 text-destructive"
    : notification.variant === "success"
      ? "border-success/30 text-success"
      : "border-border text-primary";

  return (
    <li className="pointer-events-auto">
      <div
        className={`flex items-start gap-3 rounded-lg border bg-surface-raised p-4 shadow-float ${tone}`}
        role={notification.variant === "error" ? "alert" : "status"}
      >
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{notification.message}</p>
          {notification.description && (
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{notification.description}</p>
          )}
        </div>
        <button
          aria-label="Dismiss notification"
          className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onDismiss(notification.id)}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </li>
  );
}

export function ToastViewport() {
  const [notifications, setNotifications] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function receiveToast(event: Event) {
      if (!(event instanceof CustomEvent) || !isToastMessage(event.detail)) return;
      setNotifications((current) => [...current, event.detail].slice(-4));
    }

    window.addEventListener(toastEventName, receiveToast);
    return () => window.removeEventListener(toastEventName, receiveToast);
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  if (notifications.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-md">
      <ol aria-label="Notifications" className="flex flex-col gap-2">
        {notifications.map((notification) => (
          <ToastNotice key={notification.id} notification={notification} onDismiss={dismiss} />
        ))}
      </ol>
    </div>
  );
}

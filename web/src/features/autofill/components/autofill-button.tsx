"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { startAutofillAction } from "@/features/autofill/actions";

/** Set on the page by the extension's bridge script, so the app knows it is installed. */
const markerAttribute = "data-job-ai-autofill";

/**
 * Starts autofill: the server opens an apply session, and the extension opens the
 * posting in a new tab and fills the form there (ADR 0005). Nothing is submitted.
 */
export function AutofillButton({ jobId }: { jobId: string }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // The bridge script runs at document_idle, which can be just after hydration.
    const check = () => setInstalled(document.documentElement.hasAttribute(markerAttribute));
    check();
    const timer = window.setTimeout(check, 800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "job-ai-extension") return;
      if (event.data.type === "autofill-opened")
        setMessage("Opened the form in a new tab. Review everything, then submit it yourself.");
      if (event.data.type === "autofill-error") setMessage(String(event.data.message ?? ""));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const start = () =>
    startTransition(async () => {
      setMessage(null);
      const result = await startAutofillAction(jobId);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      window.postMessage(
        {
          source: "job-ai-app",
          type: "autofill",
          ticket: result.ticket,
          applyUrl: result.applyUrl,
          apiBase: window.location.origin,
        },
        window.location.origin,
      );
    });

  if (installed === false) {
    return (
      <p className="text-sm text-muted-foreground">
        Autofill needs the Job Search browser extension.{" "}
        <Link href="/autofill" className="underline underline-offset-2">
          Install it
        </Link>
        , then reload this page.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button type="button" onClick={start} disabled={pending || installed === null}>
          {pending ? "Opening…" : "Autofill the application"}
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

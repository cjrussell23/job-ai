/**
 * Runs on the app's own pages. It tells the page the extension is installed and passes
 * "start autofill" from the page to the background worker (ADR 0005).
 */

document.documentElement.setAttribute("data-job-ai-autofill", chrome.runtime.getManifest().version);

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data as {
    source?: string;
    type?: string;
    ticket?: unknown;
    applyUrl?: unknown;
  };
  if (data?.source !== "job-ai-app" || data.type !== "autofill") return;
  if (typeof data.ticket !== "string" || typeof data.applyUrl !== "string") return;
  let url: URL;
  try {
    url = new URL(data.applyUrl);
  } catch {
    return;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  chrome.runtime.sendMessage(
    { from: "bridge", type: "autofill", ticket: data.ticket, applyUrl: url.toString() },
    (reply: { ok: boolean; error?: string } | undefined) => {
      window.postMessage(
        reply?.ok
          ? { source: "job-ai-extension", type: "autofill-opened" }
          : {
              source: "job-ai-extension",
              type: "autofill-error",
              message: reply?.error ?? "The extension didn't answer. Reload it and try again.",
            },
        window.location.origin,
      );
    },
  );
});

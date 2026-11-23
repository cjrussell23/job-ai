import type { BridgeRequest, FillerReplies, FillerRequest, Reply } from "./messages";

/**
 * The extension's background worker (ADR 0005). It keeps the apply ticket for each tab
 * autofill opened, fetches what the filler needs from the app with that ticket, and
 * injects the filler into those tabs only. It never sees job-site passwords.
 */

// Replaced at download time with the address of the app that served the extension.
const appOrigin = "__APP_ORIGIN__";

type TabSession = { ticket: string; createdAt: number };
const ticketLifetimeMs = 2 * 60 * 60 * 1000;

async function sessions(): Promise<Record<string, TabSession>> {
  const stored = await chrome.storage.session.get("tabs");
  return (stored.tabs as Record<string, TabSession> | undefined) ?? {};
}

async function saveSessions(tabs: Record<string, TabSession>) {
  await chrome.storage.session.set({ tabs });
}

async function sessionFor(tabId: number | undefined): Promise<TabSession | undefined> {
  if (tabId === undefined) return undefined;
  const session = (await sessions())[String(tabId)];
  if (!session || Date.now() - session.createdAt > ticketLifetimeMs) return undefined;
  return session;
}

async function track(tabId: number, session: TabSession) {
  const tabs = await sessions();
  tabs[String(tabId)] = session;
  await saveSessions(tabs);
}

async function untrack(tabId: number) {
  const tabs = await sessions();
  delete tabs[String(tabId)];
  await saveSessions(tabs);
}

async function inject(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["filler.js"],
    });
  } catch {
    // A page the browser won't let extensions touch (the Web Store, chrome:// pages).
  }
}

async function api(session: TabSession, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${appOrigin}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session.ticket}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    credentials: "omit",
    cache: "no-store",
  });
}

async function errorOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `The app answered ${response.status}.`;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleFiller(
  request: FillerRequest,
  session: TabSession,
  tabId: number,
): Promise<Reply<FillerReplies[keyof FillerReplies]>> {
  switch (request.type) {
    case "packet": {
      const response = await api(session, "/api/apply/packet");
      if (!response.ok) return { ok: false, error: await errorOf(response) };
      return { ok: true, data: await response.json() };
    }
    case "document": {
      const response = await api(session, `/api/apply/document?kind=${request.kind}`);
      if (!response.ok) return { ok: false, error: await errorOf(response) };
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "resume.pdf";
      return {
        ok: true,
        data: {
          base64: toBase64(await response.arrayBuffer()),
          fileName,
          type: response.headers.get("content-type") ?? "application/pdf",
        },
      };
    }
    case "answers": {
      const started = await api(session, "/api/apply/answers", {
        method: "POST",
        body: JSON.stringify(request.questions),
      });
      if (!started.ok) return { ok: false, error: await errorOf(started) };
      // The worker answers in the background; ask again until it's done.
      for (let attempt = 0; attempt < 60; attempt++) {
        await wait(2000);
        const response = await api(session, "/api/apply/answers");
        if (!response.ok) return { ok: false, error: await errorOf(response) };
        const body = (await response.json()) as {
          state: string;
          answers: FillerReplies["answers"];
        };
        if (body.state === "ready") return { ok: true, data: body.answers };
        if (body.state === "failed")
          return {
            ok: false,
            error: "The AI couldn't answer these questions. Fill them in yourself.",
          };
      }
      return { ok: false, error: "The AI took too long. Fill the remaining questions yourself." };
    }
    case "finish": {
      const response = await api(session, "/api/apply/finish", {
        method: "POST",
        body: JSON.stringify({
          submitted: request.submitted,
          filledCount: request.filledCount,
          save: request.save,
        }),
      });
      if (!response.ok) return { ok: false, error: await errorOf(response) };
      if (request.submitted) await untrack(tabId);
      return { ok: true, data: await response.json() };
    }
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const request = message as { from?: string } & (FillerRequest | BridgeRequest);
  void (async () => {
    // The app's own page asks to start autofill through the bridge script.
    if (request.from === "bridge") {
      if (sender.origin !== appOrigin || request.type !== "autofill") {
        sendResponse({ ok: false, error: "Not from the app." });
        return;
      }
      const tab = await chrome.tabs.create({ url: request.applyUrl, active: true });
      if (tab.id !== undefined)
        await track(tab.id, { ticket: request.ticket, createdAt: Date.now() });
      sendResponse({ ok: true, data: null });
      return;
    }
    const tabId = sender.tab?.id;
    const session = await sessionFor(tabId);
    if (!session || tabId === undefined) {
      sendResponse({
        ok: false,
        error: "This tab isn't an autofill tab any more. Start again from the job page.",
      });
      return;
    }
    try {
      sendResponse(await handleFiller(request as FillerRequest, session, tabId));
    } catch {
      sendResponse({
        ok: false,
        error: "Couldn't reach the app. Check your connection and try again.",
      });
    }
  })();
  return true;
});

// Inject into autofill tabs each time a page finishes loading, including after sign-in
// redirects and multi-page forms.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  void sessionFor(tabId).then((session) => {
    if (session) void inject(tabId);
  });
});

// A job board's "Apply on company site" often opens a new tab; it inherits the session.
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined || tab.openerTabId === undefined) return;
  const id = tab.id;
  void sessionFor(tab.openerTabId).then((session) => {
    if (session) void track(id, session);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => void untrack(tabId));

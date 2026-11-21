import "server-only";
import { type Browser, chromium } from "playwright";

let browser: Promise<Browser> | undefined;

/** One shared headless Chromium, started on first use and restarted if it dies. */
async function sharedBrowser(): Promise<Browser> {
  browser ??= chromium.launch({ args: ["--no-sandbox"] }).then((b) => {
    b.on("disconnected", () => {
      browser = undefined;
    });
    return b;
  });
  return browser;
}

/** Renders a self-contained HTML page to a Letter-size PDF. */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const context = await (await sharedBrowser()).newContext();
  try {
    const page = await context.newPage();
    // The HTML is ours and self-contained; block anything that would reach the network.
    await page.route("**/*", (route) =>
      route.request().url().startsWith("data:") ? route.continue() : route.abort(),
    );
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close();
  }
}

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Browser, chromium } from "playwright";
import type { DocumentBody } from "./body";
import { fontFile, fontPath, fonts } from "./fonts";
import { type Layout, resolvedStyle } from "./layout";
import { pdfDecorations, renderDocument } from "./render";

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

const fontCache = new Map<string, Buffer>();

/** A bundled resume font, read from its Fontsource package; null for anything else. */
export async function readFontFile(name: string): Promise<Buffer | null> {
  const found = fontFile(name);
  if (!found) return null;
  const cached = fontCache.get(found.file);
  if (cached) return cached;
  const data = await readFile(
    join(process.cwd(), "node_modules", "@fontsource", found.pkg, "files", found.file),
  );
  fontCache.set(found.file, data);
  return data;
}

// The document is loaded at this made-up address so its font paths resolve; every request
// is answered here and nothing reaches the network.
const origin = "https://resume.local";

export type PdfDecorations = { headerTemplate?: string; footerTemplate?: string };

/** Renders a self-contained HTML page to a Letter-size PDF. */
export async function htmlToPdf(
  html: string,
  decorations: PdfDecorations = {},
): Promise<Uint8Array> {
  const context = await (await sharedBrowser()).newContext();
  try {
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("data:")) return route.continue();
      if (url === `${origin}/`) return route.fulfill({ contentType: "text/html", body: html });
      if (url.startsWith(`${origin}${fontPath}`)) {
        const data = await readFontFile(url.slice(`${origin}${fontPath}`.length));
        if (data) return route.fulfill({ contentType: "font/woff2", body: data });
      }
      return route.abort();
    });
    await page.goto(`${origin}/`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const decorated = !!(decorations.headerTemplate || decorations.footerTemplate);
    return await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: decorated,
      headerTemplate: decorations.headerTemplate ?? "<span></span>",
      footerTemplate: decorations.footerTemplate ?? "<span></span>",
    });
  } finally {
    await context.close();
  }
}

/** A resume or cover letter as a PDF, with the repeated header and page numbers its layout asks for. */
export async function documentPdf(body: DocumentBody, layout: Layout): Promise<Uint8Array> {
  const r = resolvedStyle(layout);
  const fontData = new Map<string, string>();
  if (layout.repeatHeader || layout.pageNumbers) {
    for (const weight of ["400", "700"])
      for (const style of ["normal", "italic"]) {
        const file = `${fonts[r.font].pkg}-latin-${weight}-${style}.woff2`;
        const data = await readFontFile(file);
        if (data) fontData.set(file, `data:font/woff2;base64,${data.toString("base64")}`);
      }
  }
  if (fontData.size === 0) return htmlToPdf(renderDocument(body, { layout }));
  const fontSource = (file: string) => fontData.get(file) ?? "";
  return htmlToPdf(
    renderDocument(body, { layout, fontSource }),
    pdfDecorations(body, layout, fontSource),
  );
}

/** Pages in a PDF Chromium produced: one "/Type /Page" object per page. */
export function pdfPageCount(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString("latin1");
  return (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

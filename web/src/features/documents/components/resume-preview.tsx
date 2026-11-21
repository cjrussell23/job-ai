"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { densityStyles, type Layout } from "@/features/documents/layout";
import { type Atom, paginate } from "@/features/documents/paginate";

const pxPerIn = 96;
const pageWidthPx = 8.5 * pxPerIn;

type Props = {
  html: string;
  layout: Layout;
  /** Reports the layout each time the preview is drawn: pages and lines past the target. */
  onMeasure: (m: { pages: number; overflowLines: number }) => void;
};

/**
 * The resume as it will print, scaled to fit, with dashed lines where pages break.
 * The page count is an estimate: the PDF keeps each entry whole, which can push a
 * page break slightly earlier than shown.
 */
export function ResumePreview({ html, layout, onMeasure }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(11 * pxPerIn);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / pageWidthPx));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const measure = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const style = densityStyles[layout.density];
    const marginPx = style.marginIn.y * pxPerIn;
    const pageContentPx = 11 * pxPerIn - 2 * marginPx;
    for (const old of doc.querySelectorAll("[data-page-break]")) old.remove();
    const bodyTop = doc.body.getBoundingClientRect().top + marginPx;
    // The same units the print styles keep whole: the header, headings, entry heads, bullets, paragraphs.
    const atoms: Atom[] = [...doc.querySelectorAll("header, h2, .entry-head, li, p")].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top - bodyTop,
        bottom: rect.bottom - bodyTop,
        keepWithNext: el.matches("h2, .entry-head"),
        breakBefore: el.matches(".page-break"),
      };
    });
    const result = paginate(atoms, pageContentPx);
    // Draw each page boundary inside the document so it scrolls and scales with it.
    result.breaks.forEach((at, index) => {
      const line = doc.createElement("div");
      line.dataset.pageBreak = "";
      line.textContent = `Page ${index + 2}`;
      line.setAttribute(
        "style",
        `position:absolute;left:0;right:0;top:${marginPx + at - 4}px;border-top:2px dashed #e11d48;font:600 10px sans-serif;color:#e11d48;padding:2px 6px;text-align:right;pointer-events:none`,
      );
      doc.body.appendChild(line);
    });
    doc.body.style.position = "relative";
    setHeight(Math.max(doc.body.scrollHeight, 11 * pxPerIn));
    const linePx = (style.fontPt * style.lineHeight * pxPerIn) / 72;
    onMeasure({
      pages: result.pages,
      overflowLines: Math.ceil(result.overflowPast(layout.pages) / linePx),
    });
  }, [layout, onMeasure]);

  // The first document can finish loading before React attaches onLoad (it is rendered
  // on the server), so measure whatever is already loaded too.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.body?.childElementCount) measure();
  }, [measure]);

  return (
    <div ref={box} className="w-full">
      <div
        className="overflow-hidden rounded-md border bg-white shadow-sm"
        style={{ height: height * scale }}
      >
        <iframe
          ref={frame}
          title="Resume preview"
          srcDoc={html}
          onLoad={measure}
          className="origin-top-left border-0"
          style={{ width: pageWidthPx, height, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}

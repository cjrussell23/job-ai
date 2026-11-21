"use client";

import { useEffect, useRef, useState } from "react";
import { densityStyles, type Layout } from "@/features/documents/layout";

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

  const measure = () => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const marginPx = densityStyles[layout.density].marginIn.y * pxPerIn;
    const pageContentPx = 11 * pxPerIn - 2 * marginPx;
    const contentPx = doc.body.scrollHeight - 2 * marginPx;
    const pages = Math.max(1, Math.ceil(contentPx / pageContentPx));
    // Draw each page boundary inside the document so it scrolls and scales with it.
    for (const old of doc.querySelectorAll("[data-page-break]")) old.remove();
    for (let page = 1; page < pages; page++) {
      const line = doc.createElement("div");
      line.dataset.pageBreak = "";
      line.textContent = `Page ${page + 1}`;
      line.setAttribute(
        "style",
        `position:absolute;left:0;right:0;top:${marginPx + page * pageContentPx}px;border-top:2px dashed #e11d48;font:600 10px sans-serif;color:#e11d48;padding:2px 6px;text-align:right;pointer-events:none`,
      );
      doc.body.appendChild(line);
    }
    doc.body.style.position = "relative";
    setHeight(Math.max(doc.body.scrollHeight, 11 * pxPerIn));
    const style = densityStyles[layout.density];
    const linePx = (style.fontPt * style.lineHeight * pxPerIn) / 72;
    const overflowLines = Math.max(
      0,
      Math.ceil((contentPx - layout.pages * pageContentPx) / linePx),
    );
    onMeasure({ pages, overflowLines });
  };

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

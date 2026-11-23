"use client";

import { fontKeys, fonts } from "@/features/documents/fonts";
import {
  densityStyles,
  type Layout,
  resolvedStyle,
  templateDefaults,
} from "@/features/documents/layout";

const marginPresets = [
  { key: "narrow", label: "Narrow (0.5 in)", value: { y: 0.5, x: 0.5 } },
  { key: "normal", label: "Normal (0.75 in)", value: { y: 0.75, x: 0.75 } },
  { key: "wide", label: "Wide (1 in)", value: { y: 1, x: 1 } },
] as const;

const sizes = [9, 9.5, 10, 10.5, 11, 11.5, 12];

const clampInches = (n: number) => Math.min(1.5, Math.max(0.3, Math.round(n * 100) / 100));

/** Font, size, margins, colour, and what prints on every page. */
export function StyleControls({
  layout,
  update,
}: {
  layout: Layout;
  update: (patch: Partial<Layout>) => void;
}) {
  const resolved = resolvedStyle(layout);
  const template = templateDefaults[layout.template];
  const spacing = densityStyles[layout.density];
  const preset = layout.margins
    ? (marginPresets.find((p) => p.value.y === layout.margins?.y && p.value.x === layout.margins?.x)
        ?.key ?? "custom")
    : "auto";
  const select = "h-9 rounded-md border bg-background px-2";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Font</span>
          <select
            value={layout.font}
            onChange={(e) => update({ font: e.currentTarget.value as Layout["font"] })}
            className={select}
          >
            <option value="template">Template's font ({fonts[template.font].label})</option>
            {fontKeys.map((k) => (
              <option key={k} value={k}>
                {fonts[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Text size</span>
          <select
            value={layout.fontSize ?? ""}
            onChange={(e) =>
              update({ fontSize: e.currentTarget.value ? Number(e.currentTarget.value) : null })
            }
            className={select}
          >
            <option value="">From spacing ({spacing.fontPt} pt)</option>
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n} pt
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Margins</span>
          <select
            value={preset}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v === "auto") update({ margins: null });
              else if (v === "custom") update({ margins: { ...resolved.marginIn } });
              else update({ margins: marginPresets.find((p) => p.key === v)?.value ?? null });
            }}
            className={select}
          >
            <option value="auto">
              From spacing ({spacing.marginIn.y} in top, {spacing.marginIn.x} in sides)
            </option>
            {marginPresets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom</option>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="font-medium">Colour of the name and headings</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={resolved.accent}
              onChange={(e) => update({ accent: e.currentTarget.value })}
              aria-label="Accent colour"
              className="h-9 w-12 cursor-pointer rounded-md border bg-background p-1"
            />
            {layout.accent && (
              <button
                type="button"
                onClick={() => update({ accent: null })}
                className="text-xs text-muted-foreground underline underline-offset-2"
              >
                Use the template's colour
              </button>
            )}
          </div>
        </div>
      </div>
      {preset === "custom" && layout.margins && (
        <div className="flex flex-wrap gap-4">
          {(["y", "x"] as const).map((side) => (
            <label key={side} className="flex items-center gap-2">
              {side === "y" ? "Top and bottom" : "Left and right"}
              <input
                type="number"
                min={0.3}
                max={1.5}
                step={0.05}
                value={layout.margins?.[side] ?? 0.75}
                onChange={(e) => {
                  const n = Number(e.currentTarget.value);
                  if (Number.isFinite(n) && layout.margins)
                    update({ margins: { ...layout.margins, [side]: clampInches(n) } });
                }}
                className="h-8 w-20 rounded-md border bg-background px-2"
              />
              in
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={layout.repeatHeader}
            onChange={(e) => update({ repeatHeader: e.currentTarget.checked })}
          />
          Name and contact details on every page
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={layout.pageNumbers}
            onChange={(e) => update({ pageNumbers: e.currentTarget.checked })}
          />
          Page numbers
        </label>
      </div>
    </div>
  );
}

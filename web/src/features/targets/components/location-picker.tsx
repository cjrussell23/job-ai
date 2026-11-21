"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Country,
  countries,
  type Place,
  type ProvinceCode,
  parsePlace,
  placeLabel,
  provinces,
} from "@/lib/places";

type Row = {
  key: number;
  kind: Place["kind"];
  city: string;
  province: ProvinceCode | "";
  country: Country;
};

const selectClass = "h-9 rounded-md border bg-transparent px-2 text-sm";

function toRow(text: string, key: number): Row {
  const place = parsePlace(text);
  const base: Row = { key, kind: "city", city: "", province: "AB", country: "Canada" };
  if (!place) return { ...base, city: text };
  if (place.kind === "city") return { ...base, city: place.city, province: place.province ?? "" };
  if (place.kind === "province") return { ...base, kind: "province", province: place.province };
  return { ...base, kind: "country", country: place.country };
}

function toText(row: Row): string {
  if (row.kind === "city") {
    return row.city.trim()
      ? placeLabel({ kind: "city", city: row.city.trim(), province: row.province || null })
      : "";
  }
  if (row.kind === "province") {
    return row.province ? placeLabel({ kind: "province", province: row.province }) : "";
  }
  return row.country;
}

/** Where to look: each row is a city (with its province), a province or territory, or a country. */
export function LocationPicker({ initial }: { initial: string[] }) {
  const start = initial.length ? initial : ["Calgary, AB"];
  const [rows, setRows] = useState<Row[]>(() => start.map(toRow));
  const [nextKey, setNextKey] = useState(start.length);
  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={row.key} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="location" value={toText(row)} />
          <select
            aria-label={`Location ${index + 1} type`}
            value={row.kind}
            onChange={(e) => update(row.key, { kind: e.currentTarget.value as Place["kind"] })}
            className={selectClass}
          >
            <option value="city">City</option>
            <option value="province">Province or territory</option>
            <option value="country">Country</option>
          </select>
          {row.kind === "city" && (
            <>
              <Input
                aria-label={`Location ${index + 1} city`}
                value={row.city}
                onChange={(e) => update(row.key, { city: e.currentTarget.value })}
                placeholder="e.g. Calgary"
                className="w-40"
              />
              <select
                aria-label={`Location ${index + 1} province`}
                value={row.province}
                onChange={(e) =>
                  update(row.key, { province: e.currentTarget.value as ProvinceCode | "" })
                }
                className={selectClass}
              >
                <option value="">Any province</option>
                {provinces.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code}
                  </option>
                ))}
              </select>
            </>
          )}
          {row.kind === "province" && (
            <select
              aria-label={`Location ${index + 1} province`}
              value={row.province || "AB"}
              onChange={(e) => update(row.key, { province: e.currentTarget.value as ProvinceCode })}
              className={selectClass}
            >
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {row.kind === "country" && (
            <select
              aria-label={`Location ${index + 1} country`}
              value={row.country}
              onChange={(e) => update(row.key, { country: e.currentTarget.value as Country })}
              className={selectClass}
            >
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remove location ${index + 1}`}
            onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      {rows.length < 10 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => {
            setRows([
              ...rows,
              { key: nextKey, kind: "city", city: "", province: "AB", country: "Canada" },
            ]);
            setNextKey(nextKey + 1);
          }}
        >
          <Plus className="size-4" /> Add a location
        </Button>
      )}
    </div>
  );
}

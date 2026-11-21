"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Advice,
  bulletAdvice,
  bulletCountAdvice,
  bulletRange,
  pageAdvice,
  skillsAdvice,
} from "@/features/documents/guidance";
import {
  type Density,
  densities,
  densityLabels,
  type Layout,
  type SectionKey,
  sectionLabels,
} from "@/features/documents/layout";
import { renderResume } from "@/features/documents/render";
import { type BuilderState, saveStandingResumeAction } from "@/features/documents/standing-actions";
import {
  type BuildableItem,
  buildStandingBody,
  isWorkProject,
} from "@/features/documents/standing-body";
import { ResumePreview } from "./resume-preview";

type Props = {
  id: string | null;
  name: string;
  items: BuildableItem[];
  picked: string[];
  layout: Layout;
  header: { name: string; contact: string; links: { label: string; url: string }[] };
  recommendedPages: number;
  yearsOfExperience: number;
};

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const dates = (i: BuildableItem) => [i.startDate, i.endDate].filter(Boolean).join(" – ");

function AdviceText({ advice }: { advice: Advice | null }) {
  if (!advice) return null;
  return (
    <span
      className={
        advice.status === "warn"
          ? "text-xs text-amber-700 dark:text-amber-400"
          : "text-xs text-muted-foreground"
      }
    >
      {advice.message}
    </span>
  );
}

/**
 * Picks profile items for a standing resume and lays it out, with a live preview.
 * Wording is changed in the profile, not here (rule 1).
 */
export function ResumeBuilder(props: Props) {
  const { items } = props;
  const [state, action, pending] = useActionState<BuilderState, FormData>(
    saveStandingResumeAction,
    {},
  );
  const [chosen, setChosen] = useState(() => new Set(props.picked));
  const [layout, setLayout] = useState<Layout>(props.layout);
  const [pages, setPages] = useState(1);

  const toggle = (itemId: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(itemId);
      else next.delete(itemId);
      // Picking or dropping a role or project takes its bullets with it.
      for (const bullet of items.filter((i) => i.parentId === itemId)) {
        if (on) next.add(bullet.id);
        else next.delete(bullet.id);
      }
      return next;
    });

  const move = (index: number, by: -1 | 1) =>
    setLayout((current) => {
      const order = [...current.order];
      const [key] = order.splice(index, 1);
      if (key) order.splice(index + by, 0, key);
      return { ...current, order };
    });

  const employers = useMemo(
    () => new Set(items.filter((i) => i.type === "role").map((i) => norm(i.organization))),
    [items],
  );
  const roles = items.filter((i) => i.type === "role");
  const topFor: Record<Exclude<SectionKey, "skills">, BuildableItem[]> = {
    experience: roles,
    workProjects: items.filter((i) => i.type === "project" && isWorkProject(i, employers)),
    personalProjects: items.filter((i) => i.type === "project" && !isWorkProject(i, employers)),
    education: items.filter((i) => i.type === "certification"),
  };
  const skills = items.filter((i) => i.type === "skill");
  const pickedSkills = skills.filter((s) => chosen.has(s.id)).length;

  const html = useMemo(
    () =>
      renderResume(buildStandingBody(items, chosen, props.header, layout), {
        layout,
        preview: true,
      }),
    [items, chosen, props.header, layout],
  );

  const box = (item: BuildableItem, disabled = false) => (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        name="item"
        value={item.id}
        checked={chosen.has(item.id)}
        disabled={disabled}
        onChange={(event) => toggle(item.id, event.currentTarget.checked)}
        className="mt-1"
      />
      <span className="flex flex-col">
        <span>
          <span className={item.type === "bullet" ? "" : "font-medium"}>
            {item.type === "bullet" ? item.content : item.title || "(untitled)"}
          </span>
          {item.type !== "bullet" && (
            <span className="text-muted-foreground">
              {" "}
              · {[item.organization, dates(item)].filter(Boolean).join(", ")}
            </span>
          )}
          {item.visibility === "always" && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              always include
            </span>
          )}
        </span>
        {item.type === "bullet" && chosen.has(item.id) && (
          <AdviceText advice={bulletAdvice(item.content)} />
        )}
      </span>
    </label>
  );

  const entry = (item: BuildableItem) => {
    const bullets = items.filter((b) => b.parentId === item.id);
    const pickedBullets = bullets.filter((b) => chosen.has(b.id)).length;
    const advice =
      chosen.has(item.id) && (item.type === "role" || item.type === "project")
        ? bulletCountAdvice(
            pickedBullets,
            bulletRange({
              type: item.type,
              startDate: item.startDate,
              endDate: item.endDate,
              rank: roles.indexOf(item),
            }),
          )
        : null;
    return (
      <div key={item.id} className="flex flex-col gap-1">
        {box(item)}
        {advice && (
          <div className="pl-6">
            <AdviceText advice={advice} />
          </div>
        )}
        {bullets.map((bullet) => (
          <div key={bullet.id} className="pl-6">
            {box(bullet, !chosen.has(item.id))}
          </div>
        ))}
      </div>
    );
  };

  const pageCheck = pageAdvice(pages, layout.pages);

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {props.id && <input type="hidden" name="id" value={props.id} />}
      <input type="hidden" name="layout" value={JSON.stringify(layout)} />

      <div className="flex flex-col gap-6">
        <div className="flex max-w-sm flex-col gap-1 text-sm">
          <label htmlFor="resume-name" className="font-medium">
            Name
          </label>
          <Input
            id="resume-name"
            name="name"
            defaultValue={props.name}
            required
            maxLength={100}
            placeholder="e.g. Data roles"
          />
        </div>

        <fieldset className="flex flex-col gap-4 rounded-lg border p-4 text-sm">
          <legend className="px-1 text-sm font-semibold">Layout</legend>
          <div className="flex flex-col gap-1">
            <label htmlFor="resume-pages" className="font-medium">
              Length
            </label>
            <select
              id="resume-pages"
              value={layout.pages}
              onChange={(e) =>
                setLayout({ ...layout, pages: Number(e.currentTarget.value) as Layout["pages"] })
              }
              className="h-9 w-40 rounded-md border bg-background px-2"
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} page{n === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              With about {props.yearsOfExperience} years of experience, {props.recommendedPages}{" "}
              page{props.recommendedPages === 1 ? " is" : "s are"} typical. Two pages are fine for
              senior roles when every line earns its place.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium">Spacing</span>
            <div className="flex gap-4">
              {densities.map((d: Density) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="density-choice"
                    checked={layout.density === d}
                    onChange={() => setLayout({ ...layout, density: d })}
                  />
                  {densityLabels[d]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium">Section order</span>
            <ol className="flex flex-col gap-1">
              {layout.order.map((key, index) => (
                <li key={key} className="flex items-center gap-2">
                  <span className="w-5 text-muted-foreground">{index + 1}.</span>
                  <span className="flex-1">{sectionLabels[key]}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${sectionLabels[key]} up`}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    disabled={index === layout.order.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${sectionLabels[key]} down`}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        </fieldset>

        {layout.order.map((key) => {
          if (key === "skills") {
            if (skills.length === 0) return null;
            return (
              <fieldset key={key} className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 text-sm font-semibold">{sectionLabels.skills}</legend>
                <AdviceText advice={skillsAdvice(pickedSkills)} />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                  {skills.map((s) => (
                    <div key={s.id}>{box(s)}</div>
                  ))}
                </div>
              </fieldset>
            );
          }
          const top = topFor[key];
          if (top.length === 0) return null;
          return (
            <fieldset key={key} className="flex flex-col gap-3 text-sm">
              <legend className="mb-1 text-sm font-semibold">{sectionLabels[key]}</legend>
              {top.map(entry)}
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {props.id ? "Save resume" : "Create resume"}
          </Button>
          <AdviceText advice={pageCheck} />
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
        </div>
        <ResumePreview html={html} layout={layout} onPages={setPages} />
        <p className="text-xs text-muted-foreground">
          Page breaks are estimated; the PDF keeps each entry whole, so a break can land a little
          earlier.
        </p>
      </div>
    </form>
  );
}

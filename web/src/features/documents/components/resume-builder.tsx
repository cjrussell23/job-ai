"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Advice,
  bulletCountAdvice,
  bulletRange,
  type FitCandidate,
  fitSuggestions,
  pageAdvice,
  skillsAdvice,
  yearOfDate,
} from "@/features/documents/guidance";
import {
  densities,
  densityLabels,
  type Layout,
  type SectionKey,
  sectionLabels,
  templateLabels,
  templates,
} from "@/features/documents/layout";
import { renderResume } from "@/features/documents/render";
import { scoreResume } from "@/features/documents/score";
import {
  type BuilderState,
  exactPagesAction,
  saveStandingResumeAction,
} from "@/features/documents/standing-actions";
import {
  type BuildableItem,
  buildStandingBody,
  bulletText,
  inResumeOrder,
  isWorkProject,
} from "@/features/documents/standing-body";
import { ResumePreview } from "./resume-preview";
import { ScoreCard } from "./score-card";
import { StyleControls } from "./style-controls";

type Props = {
  id: string | null;
  name: string;
  items: BuildableItem[];
  picked: string[];
  layout: Layout;
  header: {
    name: string;
    contact: string;
    parts: { kind: "email" | "phone" | "location"; text: string }[];
    links: { label: string; url: string }[];
  };
  recommendedPages: number;
  /** AI feedback on the saved version, rendered on the server. */
  feedback?: React.ReactNode;
  yearsOfExperience: number;
};

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
const dates = (i: BuildableItem) => [i.startDate, i.endDate].filter(Boolean).join(" – ");

function AdviceList({ advice }: { advice: (Advice | null)[] }) {
  const shown = advice.filter((a): a is Advice => a !== null);
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-col">
      {shown.map((a) => (
        <span
          key={a.message}
          className={
            a.status === "warn"
              ? "text-xs text-amber-700 dark:text-amber-400"
              : "text-xs text-muted-foreground"
          }
        >
          {a.message}
        </span>
      ))}
    </span>
  );
}

function MoveButtons(props: {
  label: string;
  first: boolean;
  last: boolean;
  onMove: (by: -1 | 1) => void;
}) {
  return (
    <span className="ml-auto flex shrink-0">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-6"
        disabled={props.first}
        onClick={() => props.onMove(-1)}
        aria-label={`Move ${props.label} up`}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-6"
        disabled={props.last}
        onClick={() => props.onMove(1)}
        aria-label={`Move ${props.label} down`}
      >
        <ArrowDown className="size-3.5" />
      </Button>
    </span>
  );
}

/**
 * Picks profile items for a standing resume and lays it out, with a live preview.
 * Wording only ever comes from the profile (rule 1): a role's title is one of its own
 * titles, and a bullet is its full or short version.
 */
export function ResumeBuilder(props: Props) {
  const { items } = props;
  const [state, action, pending] = useActionState<BuilderState, FormData>(
    saveStandingResumeAction,
    {},
  );
  const [chosen, setChosen] = useState(() => new Set(props.picked));
  const [layout, setLayout] = useState<Layout>(props.layout);
  const [measure, setMeasure] = useState({ pages: 1, overflowLines: 0 });
  const [exact, setExact] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const now = useMemo(() => new Date(), []);

  const update = (patch: Partial<Layout>) => {
    setExact(null);
    setLayout((current) => ({ ...current, ...patch }));
  };

  const toggle = (itemId: string, on: boolean) => {
    setExact(null);
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
  };

  const ordered = (list: BuildableItem[]) => inResumeOrder(list, layout.itemOrder);

  /** Moves one item among its siblings for this resume only; the profile order is untouched. */
  const moveItem = (siblings: BuildableItem[], index: number, by: -1 | 1) => {
    const ids = siblings.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    if (!id) return;
    ids.splice(index + by, 0, id);
    update({ itemOrder: [...ids, ...layout.itemOrder.filter((x) => !ids.includes(x))] });
  };

  const moveSection = (index: number, by: -1 | 1) => {
    const order = [...layout.order];
    const [key] = order.splice(index, 1);
    if (key) order.splice(index + by, 0, key);
    update({ order });
  };

  const employers = useMemo(
    () => new Set(items.filter((i) => i.type === "role").map((i) => norm(i.organization))),
    [items],
  );
  const roles = items.filter((i) => i.type === "role");
  const topFor: Record<Exclude<SectionKey, "skills">, BuildableItem[]> = {
    experience: ordered(roles),
    workProjects: ordered(items.filter((i) => i.type === "project" && isWorkProject(i, employers))),
    personalProjects: ordered(
      items.filter((i) => i.type === "project" && !isWorkProject(i, employers)),
    ),
    education: ordered(items.filter((i) => i.type === "certification")),
  };
  const skills = ordered(items.filter((i) => i.type === "skill"));
  const summaries = items.filter((i) => i.type === "summary");
  const pickedSkills = skills.filter((s) => chosen.has(s.id)).length;

  const html = useMemo(
    () =>
      renderResume(buildStandingBody(items, chosen, props.header, layout), {
        layout,
        preview: true,
      }),
    [items, chosen, props.header, layout],
  );

  // Bullets that could go to bring the resume back to its target length.
  const fit = useMemo(() => {
    if (measure.overflowLines <= 0) return [];
    const candidates: FitCandidate[] = [];
    for (const parent of items.filter((i) => chosen.has(i.id))) {
      if (parent.type !== "role" && parent.type !== "project") continue;
      const bullets = items.filter((b) => b.parentId === parent.id && chosen.has(b.id));
      const range = bulletRange(
        {
          type: parent.type,
          startDate: parent.startDate,
          endDate: parent.endDate,
          rank: roles.indexOf(parent),
        },
        now,
      );
      const ended = yearOfDate(parent.endDate, now) ?? yearOfDate(parent.startDate, now);
      for (const b of bullets) {
        candidates.push({
          id: b.id,
          text: bulletText(b, layout),
          excess: Math.max(0, bullets.length - range.max),
          age: ended === null ? 0 : now.getFullYear() - ended,
        });
      }
    }
    return fitSuggestions(candidates, measure.overflowLines);
  }, [measure.overflowLines, items, chosen, layout, roles, now]);

  const checkExact = () =>
    startCheck(async () => {
      const result = await exactPagesAction([...chosen], layout);
      setExact(
        "pages" in result
          ? `The PDF is exactly ${result.pages} page${result.pages === 1 ? "" : "s"}.`
          : result.error,
      );
    });

  const box = (item: BuildableItem, disabled = false) => (
    <label className="flex min-w-0 items-start gap-2">
      <input
        type="checkbox"
        name="item"
        value={item.id}
        checked={chosen.has(item.id)}
        disabled={disabled}
        onChange={(event) => toggle(item.id, event.currentTarget.checked)}
        className="mt-1"
      />
      <span className="min-w-0">
        <span className={item.type === "bullet" ? "" : "font-medium"}>
          {item.type === "bullet" ? bulletText(item, layout) : item.title || "(untitled)"}
        </span>
        {item.type !== "bullet" && item.type !== "skill" && (
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
    </label>
  );

  const bulletRow = (
    bullet: BuildableItem,
    parent: BuildableItem,
    siblings: BuildableItem[],
    index: number,
  ) => {
    const on = chosen.has(bullet.id);
    const isShort = layout.short.includes(bullet.id);
    return (
      <div key={bullet.id} className="flex flex-col gap-0.5 pl-6">
        <div className="flex items-start gap-1">
          {box(bullet, !chosen.has(parent.id))}
          <MoveButtons
            label="bullet"
            first={index === 0}
            last={index === siblings.length - 1}
            onMove={(by) => moveItem(siblings, index, by)}
          />
        </div>
        {on && (
          <div className="flex flex-col gap-0.5 pl-6">
            {bullet.shortContent && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isShort}
                  onChange={(e) =>
                    update({
                      short: e.currentTarget.checked
                        ? [...layout.short, bullet.id]
                        : layout.short.filter((x) => x !== bullet.id),
                    })
                  }
                />
                Use the short version
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  const entry = (item: BuildableItem, siblings: BuildableItem[], index: number) => {
    const bullets = ordered(items.filter((b) => b.parentId === item.id));
    const picked = bullets.filter((b) => chosen.has(b.id));
    const on = chosen.has(item.id);
    const isEntry = item.type === "role" || item.type === "project";
    const titles = [item.title, ...item.alternateTitles];
    return (
      <div key={item.id} className="flex flex-col gap-1 rounded-md border p-2">
        <div className="flex items-start gap-1">
          {box(item)}
          <MoveButtons
            label={item.title}
            first={index === 0}
            last={index === siblings.length - 1}
            onMove={(by) => moveItem(siblings, index, by)}
          />
        </div>
        {on && item.type === "role" && item.alternateTitles.length > 0 && (
          <div className="flex items-center gap-2 pl-6 text-xs">
            <label htmlFor={`title-${item.id}`} className="text-muted-foreground">
              Title shown
            </label>
            <select
              id={`title-${item.id}`}
              value={layout.titles[item.id] ?? item.title}
              onChange={(e) =>
                update({ titles: { ...layout.titles, [item.id]: e.currentTarget.value } })
              }
              className="h-7 rounded-md border bg-background px-1"
            >
              {titles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
        {on && isEntry && (
          <div className="pl-6">
            <AdviceList
              advice={[
                bulletCountAdvice(
                  picked.length,
                  bulletRange(
                    {
                      type: item.type as "role" | "project",
                      startDate: item.startDate,
                      endDate: item.endDate,
                      rank: roles.indexOf(item),
                    },
                    now,
                  ),
                ),
              ]}
            />
          </div>
        )}
        {bullets.map((b, i) => bulletRow(b, item, bullets, i))}
      </div>
    );
  };

  const pageCheck = pageAdvice(measure.pages, layout.pages);

  const score = scoreResume({
    pages: measure.pages,
    targetPages: layout.pages,
    entries: items
      .filter((i) => (i.type === "role" || i.type === "project") && chosen.has(i.id))
      .map((i) => ({
        kind: i.type as "role" | "project",
        bullets: items
          .filter((b) => b.parentId === i.id && chosen.has(b.id))
          .map((b) => bulletText(b, layout)),
        range: bulletRange(
          {
            type: i.type as "role" | "project",
            startDate: i.startDate,
            endDate: i.endDate,
            rank: roles.indexOf(i),
          },
          now,
        ),
      })),
    contact: {
      email: props.header.parts.some((p) => p.kind === "email"),
      phone: props.header.parts.some((p) => p.kind === "phone"),
      location: props.header.parts.some((p) => p.kind === "location"),
      links: props.header.links.length,
    },
    hasSummary: layout.summaryId !== null,
    skills: pickedSkills,
  });

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
            placeholder="e.g. Developer roles"
          />
        </div>

        <fieldset className="flex flex-col gap-4 rounded-lg border p-4 text-sm">
          <legend className="px-1 text-sm font-semibold">Layout</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="resume-pages" className="font-medium">
                Length
              </label>
              <select
                id="resume-pages"
                value={layout.pages}
                onChange={(e) =>
                  update({ pages: Number(e.currentTarget.value) as Layout["pages"] })
                }
                className="h-9 rounded-md border bg-background px-2"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n} page{n === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="resume-template" className="font-medium">
                Template
              </label>
              <select
                id="resume-template"
                value={layout.template}
                onChange={(e) => update({ template: e.currentTarget.value as Layout["template"] })}
                className="h-9 rounded-md border bg-background px-2"
              >
                {templates.map((t) => (
                  <option key={t} value={t}>
                    {templateLabels[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            With about {props.yearsOfExperience} years of experience, {props.recommendedPages} page
            {props.recommendedPages === 1 ? " is" : "s are"} typical. Two pages are fine for senior
            roles when every line earns its place.
          </span>
          <div className="flex flex-col gap-1">
            <span className="font-medium">Spacing</span>
            <div className="flex flex-wrap gap-4">
              {densities.map((d) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="density-choice"
                    checked={layout.density === d}
                    onChange={() => update({ density: d })}
                  />
                  {densityLabels[d]}
                </label>
              ))}
            </div>
          </div>
          <StyleControls layout={layout} update={update} />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={layout.groupRoles}
                onChange={(e) => update({ groupRoles: e.currentTarget.checked })}
              />
              Group titles at the same employer
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={layout.showDates}
                onChange={(e) => update({ showDates: e.currentTarget.checked })}
              />
              Show dates
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium">Header</span>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5">
                Links show as
                <select
                  value={layout.headerLinks}
                  onChange={(e) =>
                    update({ headerLinks: e.currentTarget.value as Layout["headerLinks"] })
                  }
                  className="h-8 rounded-md border bg-background px-1"
                >
                  <option value="address">their address</option>
                  <option value="label">a label, e.g. LinkedIn</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={layout.headerIcons}
                  onChange={(e) => update({ headerIcons: e.currentTarget.checked })}
                />
                Icons for contact details and links
              </label>
            </div>
            <span className="text-xs text-muted-foreground">
              Labels stay clickable in the PDF. Applicant tracking systems read the text, so a label
              hides the address from them; keep addresses for online applications.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium">Sections</span>
            <span className="text-xs text-muted-foreground">
              Type over a heading to rename it on this resume, e.g. "Work projects" to "Company
              projects". Reorder sections with the arrows, or start one on a new page. Otherwise
              pages break between bullets, never inside one or straight after a heading.
            </span>
            <ol className="flex flex-col gap-1">
              {layout.order.map((key, index) => (
                <li key={key} className="flex items-center gap-2">
                  <span className="w-5 text-muted-foreground">{index + 1}.</span>
                  <Input
                    value={layout.headings[key] ?? ""}
                    placeholder={`${sectionLabels[key]} (type to rename)`}
                    aria-label={`Heading for ${sectionLabels[key]}`}
                    maxLength={60}
                    onChange={(e) =>
                      update({ headings: { ...layout.headings, [key]: e.currentTarget.value } })
                    }
                    className="h-8"
                  />
                  <label
                    className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
                    title="Start this section on a new page"
                  >
                    <input
                      type="checkbox"
                      checked={layout.breakBefore.includes(key)}
                      onChange={(e) =>
                        update({
                          breakBefore: e.currentTarget.checked
                            ? [...layout.breakBefore, key]
                            : layout.breakBefore.filter((k) => k !== key),
                        })
                      }
                    />
                    New page
                  </label>
                  <MoveButtons
                    label={sectionLabels[key]}
                    first={index === 0}
                    last={index === layout.order.length - 1}
                    onMove={(by) => moveSection(index, by)}
                  />
                </li>
              ))}
            </ol>
          </div>
        </fieldset>

        {summaries.length > 0 && (
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 text-sm font-semibold">Summary</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="summary-choice"
                checked={layout.summaryId === null}
                onChange={() => update({ summaryId: null })}
              />
              No summary
            </label>
            {summaries.map((s) => (
              <label key={s.id} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="summary-choice"
                  className="mt-1"
                  checked={layout.summaryId === s.id}
                  onChange={() => update({ summaryId: s.id })}
                />
                <span>
                  <span className="font-medium">{s.title || "Summary"}</span>
                  <span className="block text-muted-foreground">{s.content}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {layout.order.map((key) => {
          const heading = layout.headings[key] || sectionLabels[key];
          if (key === "skills") {
            if (skills.length === 0) return null;
            return (
              <fieldset key={key} className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 text-sm font-semibold">{heading}</legend>
                <AdviceList advice={[skillsAdvice(pickedSkills)]} />
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
            <fieldset key={key} className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 text-sm font-semibold">{heading}</legend>
              {top.map((item, i) => entry(item, top, i))}
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {props.id ? "Save resume" : "Create resume"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={checkExact}
            disabled={checking}
          >
            {checking ? "Checking…" : "Check exact pages"}
          </Button>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
        </div>
        <AdviceList advice={[pageCheck, exact ? { status: "good", message: exact } : null]} />
        {fit.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            <p className="font-medium">
              To fit {layout.pages === 1 ? "one page" : `${layout.pages} pages`}, drop these:
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-xs">
              {fit.map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ul>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => {
                setExact(null);
                setChosen((current) => {
                  const next = new Set(current);
                  for (const c of fit) next.delete(c.id);
                  return next;
                });
              }}
            >
              Drop these {fit.length}
            </Button>
          </div>
        )}
        <ScoreCard score={score} />
        {props.feedback}
        <ResumePreview html={html} layout={layout} onMeasure={setMeasure} />
        <p className="text-xs text-muted-foreground">
          Page breaks are estimated; use "Check exact pages" for the real PDF.
        </p>
      </div>
    </form>
  );
}

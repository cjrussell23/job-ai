"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type BuilderState, saveStandingResumeAction } from "@/features/documents/standing-actions";

export type BuilderItem = {
  id: string;
  type: "role" | "project" | "certification" | "skill" | "bullet";
  parentId: string | null;
  label: string;
  detail: string;
};

type Props = { id: string | null; name: string; items: BuilderItem[]; picked: string[] };

const sections = [
  { type: "role", heading: "Experience" },
  { type: "project", heading: "Projects" },
  { type: "certification", heading: "Education and certifications" },
  { type: "skill", heading: "Skills" },
] as const;

/** Picks profile items for a standing resume. Wording is changed in the profile, not here. */
export function ResumeBuilder({ id, name, items, picked }: Props) {
  const [state, action, pending] = useActionState<BuilderState, FormData>(
    saveStandingResumeAction,
    {},
  );
  const [chosen, setChosen] = useState(() => new Set(picked));
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

  const box = (item: BuilderItem, disabled = false) => (
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
      <span>
        <span className={item.type === "bullet" ? "" : "font-medium"}>{item.label}</span>
        {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
      </span>
    </label>
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      {id && <input type="hidden" name="id" value={id} />}
      <div className="flex max-w-sm flex-col gap-1 text-sm">
        <label htmlFor="resume-name" className="font-medium">
          Name
        </label>
        <Input
          id="resume-name"
          name="name"
          defaultValue={name}
          required
          maxLength={100}
          placeholder="e.g. Data roles"
        />
      </div>
      {sections.map((section) => {
        const top = items.filter((i) => i.type === section.type);
        if (top.length === 0) return null;
        return (
          <fieldset key={section.type} className="flex flex-col gap-2 text-sm">
            <legend className="mb-2 text-sm font-semibold">{section.heading}</legend>
            {top.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                {box(item)}
                {items
                  .filter((b) => b.parentId === item.id)
                  .map((bullet) => (
                    <div key={bullet.id} className="pl-6">
                      {box(bullet, !chosen.has(item.id))}
                    </div>
                  ))}
              </div>
            ))}
          </fieldset>
        );
      })}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {id ? "Save resume" : "Create resume"}
        </Button>
        <span className="text-sm text-muted-foreground">
          {chosen.size} item{chosen.size === 1 ? "" : "s"} picked
        </span>
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
      </div>
    </form>
  );
}

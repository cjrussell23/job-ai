"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveEditsAction, saveLineToProfileAction } from "@/features/documents/actions";
import type { DocumentBody, Line } from "@/features/documents/body";

const originLabels: Record<Line["origin"], string> = {
  profile: "From your profile",
  reworded: "Reworded from your profile",
  edited: "Edited by you",
  user_written: "Written by you",
};

/** A new line typed by the member. The server gives it a real id and marks it user-written. */
const blankLine = (): Line => ({
  id: `new-${Math.random().toString(36).slice(2)}`,
  text: "",
  sources: [],
  origin: "user_written",
});

type Props = { documentId: string; body: DocumentBody; saved: DocumentBody };

function LineEditor({
  line,
  documentId,
  savedIds,
  onChange,
  onRemove,
  rows = 2,
}: {
  line: Line;
  documentId: string;
  savedIds: Set<string>;
  onChange: (text: string) => void;
  onRemove: () => void;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <Textarea
          value={line.text}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Remove line"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{originLabels[line.origin]}</Badge>
        {line.origin === "user_written" && savedIds.has(line.id) && (
          <form action={saveLineToProfileAction}>
            <input type="hidden" name="documentId" value={documentId} />
            <input type="hidden" name="lineId" value={line.id} />
            <Button type="submit" variant="link" size="sm" className="h-auto px-0 text-xs">
              Save to my profile
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function DocumentEditor({ documentId, body: initial, saved }: Props) {
  const [body, setBody] = useState<DocumentBody>(initial);
  const [message, setMessage] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(body) !== JSON.stringify(saved);
  const savedIds = new Set(
    saved.kind === "cover_letter"
      ? saved.paragraphs.map((l) => l.id)
      : [
          ...saved.summary,
          ...saved.skills,
          ...saved.sections.flatMap((s) => s.entries.flatMap((e) => e.lines)),
        ].map((l) => l.id),
  );

  const save = () =>
    startTransition(async () => {
      const cleaned = JSON.parse(JSON.stringify(body)) as DocumentBody;
      const keep = (lines: Line[]) => lines.filter((l) => l.text.trim() !== "");
      if (cleaned.kind === "cover_letter") cleaned.paragraphs = keep(cleaned.paragraphs);
      else {
        cleaned.summary = keep(cleaned.summary);
        cleaned.skills = keep(cleaned.skills);
        for (const section of cleaned.sections)
          for (const entry of section.entries) entry.lines = keep(entry.lines);
      }
      setMessage(await saveEditsAction(documentId, cleaned));
    });

  const editLines = (lines: Line[], update: (next: Line[]) => void) => ({
    change: (index: number, text: string) =>
      update(lines.map((l, i) => (i === index ? { ...l, text } : l))),
    remove: (index: number) => update(lines.filter((_, i) => i !== index)),
    add: () => update([...lines, blankLine()]),
  });

  const lineList = (
    lines: Line[],
    update: (next: Line[]) => void,
    rows?: number,
    addLabel = "Add a line",
  ) => {
    const edit = editLines(lines, update);
    return (
      <div className="flex flex-col gap-3">
        {lines.map((line, i) => (
          <LineEditor
            key={line.id}
            line={line}
            documentId={documentId}
            savedIds={savedIds}
            onChange={(text) => edit.change(i, text)}
            onRemove={() => edit.remove(i)}
            rows={rows}
          />
        ))}
        <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={edit.add}>
          <Plus /> {addLabel}
        </Button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {body.kind === "cover_letter" ? (
        <>
          <Input
            value={body.greeting}
            onChange={(e) => setBody({ ...body, greeting: e.target.value })}
            aria-label="Greeting"
          />
          {lineList(
            body.paragraphs,
            (paragraphs) => setBody({ ...body, paragraphs }),
            5,
            "Add a paragraph",
          )}
          <Input
            value={body.closing}
            onChange={(e) => setBody({ ...body, closing: e.target.value })}
            aria-label="Closing"
          />
        </>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Summary</h3>
            {lineList(
              body.summary,
              (summary) => setBody({ ...body, summary }),
              2,
              "Add a summary line",
            )}
          </section>
          {body.sections.map((section, si) => (
            <section key={section.id} className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{section.heading}</h3>
              {section.entries.map((entry, ei) => (
                <div key={entry.id} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm">
                      <span className="font-medium">{entry.title}</span>
                      {entry.subtitle && (
                        <span className="text-muted-foreground"> · {entry.subtitle}</span>
                      )}
                      {entry.dates && (
                        <span className="text-muted-foreground"> · {entry.dates}</span>
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setBody({
                          ...body,
                          sections: body.sections.map((s, i) =>
                            i === si ? { ...s, entries: s.entries.filter((_, j) => j !== ei) } : s,
                          ),
                        })
                      }
                    >
                      Remove entry
                    </Button>
                  </div>
                  {lineList(entry.lines, (lines) =>
                    setBody({
                      ...body,
                      sections: body.sections.map((s, i) =>
                        i === si
                          ? {
                              ...s,
                              entries: s.entries.map((e, j) => (j === ei ? { ...e, lines } : e)),
                            }
                          : s,
                      ),
                    }),
                  )}
                </div>
              ))}
            </section>
          ))}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Skills</h3>
            {lineList(
              body.skills,
              (skills) => setBody({ ...body, skills }),
              2,
              "Add a skills line",
            )}
          </section>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        {message.message && !dirty && (
          <span className="text-sm text-muted-foreground">{message.message}</span>
        )}
        {message.error && (
          <span role="alert" className="text-sm text-destructive">
            {message.error}
          </span>
        )}
      </div>
    </div>
  );
}

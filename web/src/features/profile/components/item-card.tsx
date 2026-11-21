"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteItemAction, moveItemAction } from "@/features/profile/actions";
import { visibilityLabels } from "@/features/profile/item-fields";
import type { ProfileItem } from "@/features/profile/profile";
import {
  type Advice,
  bulletAdvice,
  bulletStrength,
  entryStrength,
} from "@/features/profile/strength";
import { ItemForm } from "./item-form";

type Props = {
  item: ProfileItem;
  /** For a role or project, its bullets' wording, to check them as a set. */
  bulletTexts?: string[];
  children?: React.ReactNode;
};

function AdviceNotes({ advice }: { advice: Advice[] }) {
  if (advice.length === 0) return null;
  return (
    <ul className="flex flex-col pl-4">
      {advice.map((a) => (
        <li
          key={a.message}
          className={
            a.status === "warn"
              ? "text-xs text-amber-700 dark:text-amber-400"
              : "text-xs text-muted-foreground"
          }
        >
          {a.message}
        </li>
      ))}
    </ul>
  );
}

export function ItemCard({ item, bulletTexts, children }: Props) {
  const [editing, setEditing] = useState(false);
  const dates = [item.startDate, item.endDate].filter(Boolean).join(" – ");
  const isBullet = item.type === "bullet";

  return (
    <div className={isBullet ? "py-1" : "rounded-lg border p-4"}>
      {editing ? (
        <ItemForm type={item.type} item={item} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {isBullet ? (
              <>
                <p className="text-sm before:mr-2 before:content-['•']">{item.content}</p>
                {item.shortContent && (
                  <p className="pl-4 text-xs text-muted-foreground">Short: {item.shortContent}</p>
                )}
                <AdviceNotes
                  advice={[
                    ...[bulletAdvice(item.content)].filter((a): a is Advice => a !== null),
                    ...bulletStrength(item.content),
                  ]}
                />
              </>
            ) : (
              <>
                <p className="font-medium">
                  {item.title || item.content.slice(0, 80)}
                  {item.organization && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {item.organization}
                    </span>
                  )}
                </p>
                {item.alternateTitles.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Also: {item.alternateTitles.join(", ")}
                  </p>
                )}
                {dates && <p className="text-sm text-muted-foreground">{dates}</p>}
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground underline underline-offset-2"
                  >
                    {item.url.replace(/^https?:\/\/(www\.)?/i, "")}
                  </a>
                )}
                {item.title && item.content && (
                  <p className="whitespace-pre-line text-sm">{item.content}</p>
                )}
                {bulletTexts && <AdviceNotes advice={entryStrength(bulletTexts)} />}
              </>
            )}
            {item.visibility !== "auto" && (
              <Badge variant="outline" className="w-fit">
                {visibilityLabels[item.visibility]}
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <form action={moveItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="direction" value="up" />
              <Button type="submit" variant="ghost" size="icon" aria-label="Move up">
                <ArrowUp />
              </Button>
            </form>
            <form action={moveItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="direction" value="down" />
              <Button type="submit" variant="ghost" size="icon" aria-label="Move down">
                <ArrowDown />
              </Button>
            </form>
            <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <form action={deleteItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <Button type="submit" variant="ghost" size="icon" aria-label="Delete">
                <Trash2 />
              </Button>
            </form>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

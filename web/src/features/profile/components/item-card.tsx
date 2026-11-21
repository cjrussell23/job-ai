"use client";

import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteItemAction, moveItemAction } from "@/features/profile/actions";
import { visibilityLabels } from "@/features/profile/item-fields";
import type { ProfileItem } from "@/features/profile/profile";
import { ItemForm } from "./item-form";

type Props = { item: ProfileItem; children?: React.ReactNode };

export function ItemCard({ item, children }: Props) {
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
              <p className="text-sm before:mr-2 before:content-['•']">{item.content}</p>
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
                {dates && <p className="text-sm text-muted-foreground">{dates}</p>}
                {item.title && item.content && (
                  <p className="whitespace-pre-line text-sm">{item.content}</p>
                )}
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

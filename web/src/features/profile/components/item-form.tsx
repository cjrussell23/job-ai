"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createItemAction, type FormState, updateItemAction } from "@/features/profile/actions";
import { itemFields, visibilityLabels } from "@/features/profile/item-fields";
import type { ItemType, ProfileItem } from "@/features/profile/profile";

type Props = {
  type: ItemType;
  /** Present when editing an existing item. */
  item?: ProfileItem;
  parentId?: string;
  onDone?: () => void;
};

export function ItemForm({ type, item, parentId, onDone }: Props) {
  const fields = itemFields[type];
  const [state, action, pending] = useActionState<FormState, FormData>(
    item ? updateItemAction : createItemAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const idPrefix = item?.id ?? `new-${type}-${parentId ?? "top"}`;

  useEffect(() => {
    if (state.message) {
      if (!item) formRef.current?.reset();
      onDone?.();
    }
  }, [state, item, onDone]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="type" value={type} />
      {item && <input type="hidden" name="id" value={item.id} />}
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.title && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-title`}>{fields.title}</Label>
            <Input id={`${idPrefix}-title`} name="title" defaultValue={item?.title} required />
          </div>
        )}
        {fields.organization && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-org`}>{fields.organization}</Label>
            <Input id={`${idPrefix}-org`} name="organization" defaultValue={item?.organization} />
          </div>
        )}
        {fields.dates && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-start`}>From</Label>
              <Input
                id={`${idPrefix}-start`}
                name="startDate"
                placeholder="e.g. 2021-03"
                defaultValue={item?.startDate}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-end`}>To</Label>
              <Input
                id={`${idPrefix}-end`}
                name="endDate"
                placeholder="e.g. Present"
                defaultValue={item?.endDate}
              />
            </div>
          </>
        )}
      </div>
      {fields.alternateTitles && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-alt`}>{fields.alternateTitles}</Label>
          <Textarea
            id={`${idPrefix}-alt`}
            name="alternateTitles"
            defaultValue={item?.alternateTitles.join("\n")}
            rows={2}
            placeholder="e.g. your official title, if it differs"
          />
        </div>
      )}
      {fields.url && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-url`}>{fields.url}</Label>
          <Input
            id={`${idPrefix}-url`}
            name="url"
            defaultValue={item?.url}
            placeholder="e.g. mysite.com"
          />
        </div>
      )}
      {fields.content && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-content`}>{fields.content}</Label>
          <Textarea
            id={`${idPrefix}-content`}
            name="content"
            defaultValue={item?.content}
            required={type === "bullet" || type === "note" || type === "summary"}
            rows={type === "bullet" ? 2 : 4}
          />
        </div>
      )}
      {fields.shortContent && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-short`}>{fields.shortContent}</Label>
          <Textarea
            id={`${idPrefix}-short`}
            name="shortContent"
            defaultValue={item?.shortContent}
            rows={1}
          />
        </div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-visibility`}>Use in applications</Label>
          <select
            id={`${idPrefix}-visibility`}
            name="visibility"
            defaultValue={item?.visibility ?? "auto"}
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {Object.entries(visibilityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {item ? "Save" : `Add ${fields.label.toLowerCase()}`}
        </Button>
        {onDone && item && (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

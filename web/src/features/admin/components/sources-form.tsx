"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ActionState, sourcesAction } from "@/features/admin/actions";
import { sourceCatalogue } from "@/features/sources/catalogue";

export function SourcesForm({ enabled }: { enabled: Record<string, boolean> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sourcesAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {sourceCatalogue.map((source) => (
          <li key={source.id} className="flex items-center gap-2 text-sm">
            {source.status === "available" ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name={`source.${source.id}`}
                  defaultChecked={enabled[source.id] !== false}
                  className="size-4"
                />
                {source.label}
              </label>
            ) : (
              <span className="flex items-center gap-2 pl-6 text-muted-foreground">
                {source.label}
                <Badge variant="outline">Coming soon</Badge>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          Save sources
        </Button>
        {state.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

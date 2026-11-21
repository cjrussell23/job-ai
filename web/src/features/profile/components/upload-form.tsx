"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type FormState, uploadResumeAction } from "@/features/profile/actions";

export function UploadForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadResumeAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Input
          name="resume"
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf"
          required
          className="max-w-sm"
          aria-label="Resume file"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading…" : "Upload resume"}
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}

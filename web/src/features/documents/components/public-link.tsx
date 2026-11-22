import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shareStandingResumeAction, unshareStandingResumeAction } from "../standing-actions";

/** Turns a standing resume's public link on or off, and shows the link when it is on. */
export function PublicLink({ id, token }: { id: string; token: string | null }) {
  const base = `${process.env.BETTER_AUTH_URL ?? ""}/api/public/resumes/${token}`;
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="font-medium">Public link</h2>
      {token ? (
        <>
          <p className="text-sm text-muted-foreground">
            Anyone with these links can read this resume, contact details included, for example your
            portfolio site. Saving the resume updates them within a few minutes.
          </p>
          <label htmlFor="public-json" className="text-sm">
            Data (JSON)
          </label>
          <Input id="public-json" readOnly value={base} />
          <label htmlFor="public-pdf" className="text-sm">
            PDF
          </label>
          <Input id="public-pdf" readOnly value={`${base}/pdf`} />
          <form action={unshareStandingResumeAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="outline">
              Stop sharing
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Share this resume through a private link, so a site such as your portfolio can show it
            and offer the PDF. Only people or sites you give the link to can see it, and you can
            stop sharing at any time.
          </p>
          <form action={shareStandingResumeAction}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="outline">
              Create public link
            </Button>
          </form>
        </>
      )}
    </section>
  );
}

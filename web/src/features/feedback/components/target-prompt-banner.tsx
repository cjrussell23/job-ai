import Link from "next/link";

type Props = { reason: "pay" | "location"; count: number; targetName: string };

/** Repeated feedback suggests a firm limit; the member decides on the targets page. */
export function TargetPromptBanner({ reason, count, targetName }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4 text-sm">
      <p className="flex-1">
        You turned down {count} {targetName} jobs for {reason} this month. Make {reason} a firm
        limit, so jobs that miss it are hidden?
      </p>
      <Link href="/targets" className="font-medium underline underline-offset-2">
        Edit the job target
      </Link>
    </div>
  );
}

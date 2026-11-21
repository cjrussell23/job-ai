import { Badge } from "@/components/ui/badge";
import { sourceCatalogue } from "@/features/sources/catalogue";

/** Where the daily search looks, for members. */
export function SourceList({ enabled }: { enabled: Record<string, boolean> }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {sourceCatalogue
        .filter((s) => s.status === "coming_soon" || enabled[s.id] !== false)
        .map((source) => (
          <li key={source.id}>
            <Badge variant={source.status === "available" ? "secondary" : "outline"}>
              {source.label}
              {source.status === "coming_soon" && " · coming soon"}
            </Badge>
          </li>
        ))}
    </ul>
  );
}

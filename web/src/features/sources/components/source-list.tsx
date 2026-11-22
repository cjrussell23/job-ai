import { Badge } from "@/components/ui/badge";
import { isComingSoon, sourceCatalogue } from "@/features/sources/catalogue";

/** Where the daily search looks, for members. */
export function SourceList({ enabled }: { enabled: Record<string, boolean> }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {sourceCatalogue
        .filter((s) => isComingSoon(s) || enabled[s.id] !== false)
        .map((source) => (
          <li key={source.id}>
            <Badge variant={isComingSoon(source) ? "outline" : "secondary"}>
              {source.label}
              {isComingSoon(source) && " · coming soon"}
            </Badge>
          </li>
        ))}
    </ul>
  );
}

import { getSettings } from "@/features/admin/settings";
import type { AvailableSourceId } from "./catalogue";
import type { SourceImplementation } from "./source";

/** Implementations register here as they are built; a missing one is simply skipped. */
const implementations: Partial<Record<AvailableSourceId, SourceImplementation>> = {};

export function registerSource(id: AvailableSourceId, implementation: SourceImplementation) {
  implementations[id] = implementation;
}

/** Sources that are built and switched on in the admin dashboard. */
export async function enabledSources(): Promise<[AvailableSourceId, SourceImplementation][]> {
  const { sourcesEnabled } = await getSettings();
  return (Object.entries(implementations) as [AvailableSourceId, SourceImplementation][]).filter(
    ([id]) => sourcesEnabled[id] !== false,
  );
}

import { Badge } from "@/components/ui/badge";
import { computeDaysHeld, isStale } from "@/lib/staleness";

/**
 * Informational (not warning) flag for a pick that's been open a long time
 * with neither its target nor invalidation price ever hit. Renders nothing
 * for picks that aren't stale yet — see `src/lib/staleness.ts` for the
 * threshold and rationale (this is visibility, never an auto-close signal).
 */
export function StaleBadge({ createdAt }: { createdAt: string }) {
  if (!isStale(createdAt)) return null;

  const days = computeDaysHeld(createdAt);

  return (
    <Badge
      variant="outline"
      className="text-muted-foreground font-normal"
      title="Open for over 45 days with neither target nor invalidation hit — flagged for visibility, not auto-closed."
    >
      Held {days}d
    </Badge>
  );
}

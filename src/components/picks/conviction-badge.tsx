import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ConvictionBadge({ score }: { score: number }) {
  const colorClass =
    score >= 8
      ? "bg-emerald-600 hover:bg-emerald-600 text-white"
      : score >= 5
        ? "bg-amber-500 hover:bg-amber-500 text-white"
        : "bg-slate-400 hover:bg-slate-400 text-white";

  return <Badge className={cn(colorClass, "font-mono")}>{score}/10</Badge>;
}

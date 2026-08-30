import * as React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, ICONS } from "@/components/ui/icons";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  change?: {
    value: string | number;
    type: "increase" | "decrease";
  };
  icon?: string;
  className?: string;
  /** For a value that carries a state, e.g. a verified profile in green. */
  valueClassName?: string;
}

export function StatCard({ title, value, description, change, icon, className, valueClassName }: StatCardProps) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6 shadow-sm", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {Icon && (
          <div className="h-9 w-9 rounded-lg bg-primary-50 text-primary flex items-center justify-center">
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("text-2xl font-bold tracking-tight text-foreground", valueClassName)}>{value}</span>
        {change && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full",
              change.type === "increase"
                ? "bg-secondary-50 text-secondary-700"
                : "bg-danger-50 text-danger-700"
            )}
          >
            {change.type === "increase" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change.value}
          </span>
        )}
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "secondary" | "outline";

const variants: Record<Variant, string> = {
  default: "bg-primary-50 text-primary-700 border border-primary-200",
  success: "bg-secondary-50 text-secondary-700 border border-secondary-200",
  warning: "bg-accent-50 text-accent-700 border border-accent-200",
  danger: "bg-red-50 text-red-700 border border-red-200",
  info: "bg-primary-50 text-primary-700 border border-primary-200",
  secondary: "bg-gray-100 text-gray-700 border border-gray-200",
  outline: "bg-transparent text-foreground border border-border",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = "default", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium",
        variants[variant],
        className
      )}
      {...rest}
    />
  );
}

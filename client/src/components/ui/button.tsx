"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader } from "./icons";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "link";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-on-brand hover:bg-primary-700 active:bg-primary-800 shadow-sm",
  secondary:
    "bg-secondary text-on-brand hover:bg-secondary-600 active:bg-secondary-700 shadow-sm",
  ghost:
    "bg-transparent text-foreground hover:bg-muted",
  outline:
    "bg-transparent text-foreground border border-border hover:bg-muted",
  danger:
    "bg-danger text-on-brand hover:opacity-90 shadow-sm",
  link:
    "bg-transparent text-primary hover:underline px-0",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-md",
  md: "h-10 px-4 text-sm rounded-md",
  lg: "h-12 px-6 text-base rounded-lg",
  icon: "h-10 w-10 rounded-md",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth,
      disabled,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          variants[variant],
          variant === "link" ? "" : sizes[size],
          fullWidth && "w-full",
          className
        )}
        {...rest}
      >
        {loading ? <Loader size={16} className="animate-spin" /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";

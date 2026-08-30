"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, MoreVertical } from "./icons";

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className={cn("flex items-center gap-1", className)}>
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>
      {Array.from({ length: totalPages }).map((_, i) => (
        <button
          key={i}
          onClick={() => onPageChange(i + 1)}
          className={cn(
            "h-9 w-9 inline-flex items-center justify-center rounded-md text-sm",
            page === i + 1
              ? "bg-primary text-white"
              : "border border-border text-foreground hover:bg-muted"
          )}
        >
          {i + 1}
        </button>
      ))}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

/** Generic table with consistent IdleX styling. */
export function Table({ className, ...rest }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className={cn("w-full text-sm text-left", className)} {...rest} />
    </div>
  );
}

export function Th({ className, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-3 font-semibold text-muted-foreground bg-panel text-xs uppercase tracking-wider",
        className
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 border-t border-border", className)} {...rest} />;
}

export function DropdownMenu({
  trigger,
  children,
  align = "right",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}>{trigger}</button>
      {open && (
        <div
          className={cn(
            "absolute z-30 mt-2 min-w-45 rounded-md border border-border bg-card shadow-lg p-1",
            align === "right" ? "right-0" : "left-0"
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  danger,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-muted",
        danger ? "text-danger" : "text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

export { MoreVertical };

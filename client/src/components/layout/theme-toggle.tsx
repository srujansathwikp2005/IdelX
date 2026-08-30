"use client";

import * as React from "react";

import { Monitor, Moon, Sun } from "@/components/ui/icons";

import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Auto", Icon: Monitor },
] as const;

/**
 * Light / Dark / Auto, laid out as the segmented control the app shows under
 * Appearance. Three states rather than a switch, because "follow the phone"
 * is a real answer and a two-way toggle cannot express it.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // The stored choice is only known in the browser, so the server renders no
  // selection and the client fills it in. Marking one active before that
  // would be a guess, and React would report the correction as a hydration
  // mismatch.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              active
                ? "bg-card text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}

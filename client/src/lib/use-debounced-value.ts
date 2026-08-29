"use client";

import { useEffect, useState } from "react";

/**
 * Holds back a fast-changing value until it settles.
 *
 * An admin search box drives the request URL directly, so without this every
 * keystroke is a round trip — eight requests to type "balaji", seven of them
 * already stale by the time they land.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    // Cleared on every change, so the timer only fires once typing stops.
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return settled;
}

import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The IdleX mark — the same artwork the Android app ships as its launcher
 * icon and header logo, rather than the "iX" monogram the web had stood in
 * with. Four places drew that monogram their own way, so the site, the
 * dashboard and the admin panel each looked like a different product.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/idlex-mark.png"
      alt=""
      width={size}
      height={size}
      // The mark carries its own violet blob, so it needs no tile behind it
      // and reads on a white header and a dark footer alike.
      className={cn("shrink-0 object-contain", className)}
      priority
    />
  );
}

/** The mark and the wordmark together, as they appear in the app's header. */
export function BrandLockup({
  size = 32,
  suffix,
  className,
  wordmarkClassName,
}: {
  size?: number;
  /** Follows the wordmark in plain weight, as in "IdleX Admin". */
  suffix?: string;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark size={size} />
      <span className={cn("text-lg font-bold tracking-tight", wordmarkClassName)}>
        Idle<span className="text-primary">X</span>
        {suffix && <span className="font-medium"> {suffix}</span>}
      </span>
    </span>
  );
}

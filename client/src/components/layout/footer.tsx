"use client";

import * as React from "react";
import Link from "next/link";
import { FOOTER_NAV, SITE_CONFIG } from "@/config/site";
import { BrandMark } from "./brand";

export function Footer() {
  return (
    <footer className="relative mt-16 overflow-hidden bg-inverse text-inverse-foreground">
      {/* Ambient glow, echoes the hero blobs — quiet here, not competing with content */}
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-linear-to-tr from-primary/10 to-primary-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-linear-to-bl from-primary-500/10 to-transparent blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <div className="mb-3 flex items-center gap-2 group w-fit">
              <BrandMark
                size={32}
                className="transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3"
              />
              <span className="text-lg font-bold text-white">IdleX</span>
            </div>
            <p className="max-w-sm text-sm text-inverse-foreground/70">{SITE_CONFIG.description}</p>
            <p className="mt-4 text-xs text-inverse-foreground/55">
              Copyright 2026 {SITE_CONFIG.name}. All rights reserved.
            </p>
          </div>

          {Object.entries(FOOTER_NAV).map(([title, items]) => (
            <div key={title}>
              <h4 className="mb-3 text-sm font-semibold text-white">{title}</h4>
              <ul className="space-y-2 text-sm">
                {items.map((item) => (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="group relative text-inverse-foreground/70 transition-colors duration-200 hover:text-white"
                    >
                      {item.label}
                      <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-linear-to-r from-primary to-primary-400 transition-all duration-300 group-hover:w-full" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Thin gradient rule instead of a flat border — same accent language as the rest of the site */}
        <div className="mt-10 h-px w-full bg-linear-to-r from-transparent via-white/10 to-transparent" />
        <p className="mt-6 text-center text-xs text-inverse-foreground/65">
          Made for people who'd rather borrow than buy.
        </p>
      </div>
    </footer>
  );
}
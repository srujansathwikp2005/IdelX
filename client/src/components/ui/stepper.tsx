"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "./icons";

export interface StepperStep {
  id: string;
  title: string;
  description?: string;
}

export function Stepper({
  steps,
  current,
  className,
}: {
  steps: StepperStep[];
  current: number; // index of active step
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <ol className="flex items-center w-full">
        {steps.map((step, i) => {
          const isCompleted = i < current;
          const isActive = i === current;
          const isLast = i === steps.length - 1;
          return (
            <li
              key={step.id}
              className={cn("flex items-center", isLast ? "flex-none" : "flex-1")}
            >
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-medium",
                    isCompleted && "bg-primary border-primary text-white",
                    isActive && "border-primary text-primary bg-primary-50",
                    !isCompleted && !isActive && "border-gray-300 text-gray-400 bg-card"
                  )}
                >
                  {isCompleted ? <Check size={16} /> : i + 1}
                </div>
                <div className="mt-2 text-center hidden sm:block">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      isActive ? "text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{step.description}</p>
                  )}
                </div>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2",
                    isCompleted ? "bg-primary" : "bg-gray-200"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

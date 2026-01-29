"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/header";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();
  const { menuPosition } = config.layout;

  const getLayoutClasses = () => {
    switch (menuPosition) {
      case "left":
        return "grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]";
      case "right":
        return "grid min-h-screen w-full md:grid-cols-[1fr_220px] lg:grid-cols-[1fr_280px]";
      case "top":
        return "flex flex-col min-h-screen w-full";
      case "bottom":
        return "flex flex-col min-h-screen w-full";
      default:
        return "grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]";
    }
  };

  return (
    <div className={cn("transition-all duration-300 ease-in-out", getLayoutClasses())}>
      <AppSidebar
        side={menuPosition}
        className={cn(
          menuPosition === "right" && "md:col-start-2",
          menuPosition === "bottom" && "order-last mt-auto",
          (menuPosition === "top" || menuPosition === "bottom") && "w-full z-20"
        )}
      />

      <div className={cn(
        "flex flex-col min-w-0 transition-all duration-300",
        menuPosition === "right" && "md:col-start-1 md:row-start-1",
        menuPosition === "bottom" && "order-first flex-1"
      )}>
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/40 transition-all duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}

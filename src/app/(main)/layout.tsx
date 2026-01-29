"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/sidebar";
import { NavigationBar } from "@/components/layout/navigation-bar";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

export default function MainLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();
  const position = config.layout.menuPosition;

  const isVertical = position === "left" || position === "right";
  const isHorizontal = position === "top" || position === "bottom";

  if (isHorizontal) {
    return (
      <div className="flex flex-col min-h-screen w-full">
        {position === "top" && <NavigationBar position="top" />}

        <main className="flex-1 bg-background/20 backdrop-blur-sm overflow-auto">
          {children}
        </main>

        {position === "bottom" && <NavigationBar position="bottom" />}
      </div>
    )
  }

  return (
    <div className={cn(
      "grid min-h-screen w-full",
      position === "right"
        ? "md:grid-cols-[1fr_220px] lg:grid-cols-[1fr_280px]"
        : "md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]"
    )}>
      {position === "left" && <AppSidebar side="left" />}

      <div className="flex flex-col min-w-0">
        <main className="flex flex-1 flex-col bg-background/20 backdrop-blur-sm">
          {children}
        </main>
      </div>

      {position === "right" && <AppSidebar side="right" />}
    </div>
  );
}

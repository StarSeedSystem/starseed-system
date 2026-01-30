"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/sidebar";
import { AppHeader } from "@/components/layout/header";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();
  const { menuPosition } = config.layout;

  const getBaseLayout = () => {
    // Mobile is always flex-col. Desktop changes based on preference.
    return "flex flex-col md:block min-h-screen transition-all duration-300 ease-in-out";
  };

  const getDesktopClasses = () => {
    switch (menuPosition) {
      case "left":
        return "md:grid md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]";
      case "right":
        return "md:grid md:grid-cols-[1fr_220px] lg:grid-cols-[1fr_280px]";
      case "top":
      case "bottom":
        return "md:flex md:flex-col";
      default:
        return "md:grid md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]";
    }
  };

  const isBottomMobile = menuPosition === "bottom" || menuPosition === "right";

  return (
    <div className={cn(getBaseLayout(), getDesktopClasses())}>
      <AppSidebar
        side={menuPosition}
        className={cn(
          // Mobile: Order based on position
          isBottomMobile && "order-last mt-auto",

          // Desktop: Specific adjustments
          menuPosition === "right" && "md:col-start-2 md:order-none md:mt-0",
          menuPosition === "bottom" && "md:order-last md:mt-auto",
          (menuPosition === "top" || menuPosition === "bottom") && "w-full z-20"
        )}
      />

      <div className={cn(
        "flex flex-col min-w-0 transition-all duration-300 flex-1",
        // Desktop Grid Positioning
        menuPosition === "right" && "md:col-start-1 md:row-start-1",
        // Desktop Flex Positioning
        menuPosition === "bottom" && "md:order-first"
      )}>
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/40 transition-all duration-300">
          {children}
        </main>
      </div>
    </div>
  );
}

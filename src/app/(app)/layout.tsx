"use client";

import type { ReactNode } from "react";
import { useState, useMemo } from "react";
// import { AppSidebar } from "@/components/layout/sidebar"; // Removed
import { AppHeader } from "@/components/layout/header";
import { FloatingMenuButton } from "@/components/layout/floating-menu-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";

// Removed MobileMenu import as per user request to remove "the button and the menu"
// import { MobileMenu } from "@/components/layout/mobile-menu"; 

export default function AppLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();

  return (
    <div className="flex flex-col min-h-screen transition-all duration-300 ease-in-out">
      {/* AppSidebar removed */}

      <div className="flex flex-col min-w-0 transition-all duration-300 flex-1">
        {/* Keeping Header for now, but checking if it contains the menu button */}
        <AppHeader />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/40 transition-all duration-300">
          {children}
        </main>
      </div>

      {/* Floating Action Button - Removed as part of cleanup if it triggers the old menu */}
      {/* 
      <div className={cn(
        showOnDesktop ? "" : "md:hidden"
      )}>
        <FloatingMenuButton
          isOpen={fabMenuOpen}
          onToggle={() => setFabMenuOpen(!fabMenuOpen)}
        />
      </div>
      */}
    </div>
  );
}

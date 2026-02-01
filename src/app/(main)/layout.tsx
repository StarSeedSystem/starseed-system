"use client";

import type { ReactNode } from "react";
// import { AppSidebar } from "@/components/layout/sidebar"; // Removed Sidebar
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

export default function MainLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();

  return (
    <div className="flex min-h-screen w-full flex-col transition-all duration-300 bg-background">
      {/* MIDDLE AREA (Content Only) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* CENTER CONTENT */}
        <div className="flex flex-col flex-1 min-w-0 relative h-full">
          {/* Main Page Content */}
          <main className="flex-1 overflow-y-auto bg-background/20 backdrop-blur-sm scrollbar-hide">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

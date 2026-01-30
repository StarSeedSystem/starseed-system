"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/sidebar";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { NavigationBar } from "@/components/layout/navigation-bar";
import { useAppearance } from "@/context/appearance-context";
import { cn } from "@/lib/utils";
import { Menu, PanelRight } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function MainLayout({ children }: { children: ReactNode }) {
  const { config } = useAppearance();
  const position = config.layout.menuPosition;
  const showRightSidebar = true;

  // Layout Strategy:
  // We use a hierarchical Flex structure:
  // Root (Flex Col)
  //  -> Top Bar (AppSidebar if 'top')
  //  -> Middle Area (Flex Row, flex-1)
  //      -> Left Column (AppSidebar if 'left', RightSidebar if 'right')
  //      -> Content Area (flex-1)
  //      -> Right Column (RightSidebar if 'left'/'top'/'bottom', AppSidebar if 'right')
  //  -> Bottom Bar (AppSidebar if 'bottom')

  return (
    <div className="flex min-h-screen w-full flex-col transition-all duration-300 bg-background">

      {/* TOP CONFIGURATION */}
      {position === "top" && (
        <AppSidebar side="top" className="hidden md:flex w-full border-b z-40 relative" />
      )}

      {/* MIDDLE AREA (Contains Sidebars + Content) */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* LEFT COLUMN */}
        {/* If Menu is Left -> App Sidebar */}
        {position === "left" && (
          <AppSidebar side="left" className="hidden md:flex border-r w-[220px] shrink-0" />
        )}
        {/* If Menu is Right -> Secondary Sidebar swaps to Left for balance */}
        {position === "right" && showRightSidebar && (
          <RightSidebar className="hidden xl:flex border-r w-[250px] shrink-0" />
        )}

        {/* CENTER CONTENT */}
        <div className="flex flex-col flex-1 min-w-0 relative h-full">
          {/* Mobile Header (Visible only on md- screens) */}
          {/* Note: In 'top'/'bottom' modes on desktop, we might want to hide mobile triggers differently, 
                but 'md:hidden' handles it well since AppSidebar is 'hidden md:flex' */}
          <header className="md:hidden h-14 border-b flex items-center justify-between px-4 bg-background/80 backdrop-blur-md sticky top-0 z-50">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[250px]">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <AppSidebar side="left" className="border-none w-full h-full" />
              </SheetContent>
            </Sheet>

            <span className="font-bold text-sm tracking-widest uppercase">StarSeed</span>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <PanelRight className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 w-[280px]">
                <SheetTitle className="sr-only">Control Panel</SheetTitle>
                <RightSidebar className="flex border-none w-full h-full bg-transparent" />
              </SheetContent>
            </Sheet>
          </header>

          {/* Main Page Content */}
          <main className="flex-1 overflow-y-auto bg-background/20 backdrop-blur-sm scrollbar-hide">
            {children}
          </main>
        </div>

        {/* RIGHT COLUMN */}
        {/* If Menu is Left/Top/Bottom -> Secondary Sidebar is here */}
        {position !== "right" && showRightSidebar && (
          <RightSidebar className="hidden xl:flex border-l w-[250px] shrink-0" />
        )}
        {/* If Menu is Right -> App Sidebar is here */}
        {position === "right" && (
          <AppSidebar side="right" className="hidden md:flex border-l w-[220px] shrink-0" />
        )}

      </div>

      {/* BOTTOM CONFIGURATION */}
      {position === "bottom" && (
        <AppSidebar side="bottom" className="hidden md:flex w-full border-t z-40 relative" />
      )}
    </div>
  );
}

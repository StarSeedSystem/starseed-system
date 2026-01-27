import type { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/sidebar";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full md:grid-cols-[1fr]">
      {/* 
        The sidebar is hidden on desktop for the messages view
        but we can keep the component here if other pages under (main) need it.
        For now, messages is the only one.
      */}
      {/* <AppSidebar /> */}
      <div className="flex flex-col">
        <main className="flex flex-1 flex-col bg-muted/40">
          {children}
        </main>
      </div>
    </div>
  );
}

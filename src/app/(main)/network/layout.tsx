// src/app/(main)/network/layout.tsx
import { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NetworkNavigation } from "./_components/navigation";

export default function NetworkLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">The Network</h1>
        <p className="text-muted-foreground">
          The heart of the system for governance, education, and culture.
        </p>
      </div>
      <NetworkNavigation />
      <div className="mt-4">
        {children}
      </div>
    </div>
  );
}
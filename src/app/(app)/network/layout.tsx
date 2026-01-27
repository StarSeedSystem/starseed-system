// src/app/(app)/network/layout.tsx
'use client';
import { ReactNode } from "react";
import { NetworkNavigation } from "./_components/navigation";

export default function NetworkLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">La Red</h1>
        <p className="text-muted-foreground">
          El corazón del sistema para la gobernanza, educación y cultura.
        </p>
      </div>
      <NetworkNavigation />
      <div className="mt-4">
        {children}
      </div>
    </div>
  );
}

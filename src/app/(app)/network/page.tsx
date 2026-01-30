// src/app/(app)/network/page.tsx
'use client'

import { NetworkNavigation } from "./_components/navigation";
import { HolographicGraph } from "@/components/network/holographic-graph";

export default function NetworkPage() {
  return (
    <div className="container py-8 space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold font-headline">Red StarSeed</h1>
        <p className="text-muted-foreground">Explora las conexiones vivas de nuestra sociedad ontocrática.</p>
      </div>

      <NetworkNavigation />

      <div className="mt-8">
        <HolographicGraph />
      </div>
    </div>
  );
}

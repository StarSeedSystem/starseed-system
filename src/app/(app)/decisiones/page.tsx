"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Landmark, Waypoints } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GovernancePanel from "@/components/governance/governance-panel";
import GovNotifications from "@/components/governance/notifications-panel";
import LiquidDelegationPanel from "@/components/governance/liquid-delegation-panel";
import { parseProposalParams } from "@/lib/governance/links";

// Lee los parámetros de la URL (deep-link de propuesta prefilled) y monta el
// panel de gobernanza con el contexto + borrador correspondiente. Se aísla en
// su propio componente cliente para poder envolverlo en <Suspense> (Next exige
// un límite de Suspense alrededor de useSearchParams para no romper el
// prerender estático). Sin parámetros, el panel se comporta igual que siempre.
function DecisionesPanel() {
  const searchParams = useSearchParams();
  const { open, initial, scope, scopeRef } = parseProposalParams(searchParams);

  return (
    <GovernancePanel
      scope={scope}
      scopeRef={scopeRef}
      initialProposal={initial}
      autoOpen={open}
    />
  );
}

export default function DecisionesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-emerald-50">Decisiones · Ontocracia</h1>
        <p className="mb-6 mt-1 text-sm text-white/50">
          Motor de comandos democráticos para todo StarSeed: una decisión sólo se ejecuta cuando se cumple el formato
          democrático (tiempo, participación mínima y umbral). Los votos son siempre públicos y cada decisión aprobada
          puede ejecutar un comando procedimental. Tu voz también puedes delegarla — de forma revocable — en la
          pestaña "Delegación Líquida".
        </p>

        <Tabs defaultValue="decisiones" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="decisiones" className="gap-1.5 px-2 py-2 text-[clamp(0.7rem,2.2vw,0.875rem)] sm:px-5">
              <Landmark className="h-4 w-4 shrink-0" /> Decisiones
            </TabsTrigger>
            <TabsTrigger value="delegacion" className="gap-1.5 px-2 py-2 text-[clamp(0.7rem,2.2vw,0.875rem)] sm:px-5">
              <Waypoints className="h-4 w-4 shrink-0" /> Delegación Líquida
            </TabsTrigger>
          </TabsList>

          <TabsContent value="decisiones" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
            <div className="space-y-6">
              <Suspense fallback={null}>
                <DecisionesPanel />
              </Suspense>
              <GovNotifications />
            </div>
          </TabsContent>

          <TabsContent value="delegacion" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
            <LiquidDelegationPanel />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import GovernancePanel from "@/components/governance/governance-panel";
import GovNotifications from "@/components/governance/notifications-panel";
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
          puede ejecutar un comando procedimental.
        </p>
        <div className="space-y-6">
          <Suspense fallback={null}>
            <DecisionesPanel />
          </Suspense>
          <GovNotifications />
        </div>
      </div>
    </main>
  );
}

"use client";

import GovernancePanel from "@/components/governance/governance-panel";
import GovNotifications from "@/components/governance/notifications-panel";

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
          <GovernancePanel />
          <GovNotifications />
        </div>
      </div>
    </main>
  );
}

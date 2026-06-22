"use client";
import { VaultsPanel } from "@/components/exocortex/vaults-panel";

export default function BaulesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">Baúles de memorias</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">Agrupa memorias de todo tipo y conexiones en baúles: multi-selección, exportar/importar, configurar y conectar.</p>
        <VaultsPanel />
      </div>
    </main>
  );
}

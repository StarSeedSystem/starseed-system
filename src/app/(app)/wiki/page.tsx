"use client";
import OKFPanel from "@/components/exocortex/okf-panel";

export default function WikiPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">Wiki neuronal · OKF</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">Open Knowledge Format: Astraura mantiene una wiki viva e interconectada de tus memorias — redacta, enlaza con [[wikilinks]] y archiva por ti. Ingesta · Consulta · Lint.</p>
        <OKFPanel />
      </div>
    </main>
  );
}

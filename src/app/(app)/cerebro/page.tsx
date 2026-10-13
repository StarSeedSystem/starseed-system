"use client";

import CerebroHub from "@/components/cerebro/cerebro-hub";

export default function CerebroPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-cyan-50">Cerebro</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Tus cerebros, <span className="text-cyan-300">privados</span> (tu cuenta y tus perfiles) y{" "}
          <span className="text-emerald-300">públicos</span> (tus grupos, comunidades y páginas). Cada uno con sus
          memorias, habilidades, contexto, neuronas, personalidades, conectores y procesos activos; y con opciones para
          fusionarlo con otros o vincularlo por telepatía.
        </p>
        <CerebroHub />
      </div>
    </main>
  );
}

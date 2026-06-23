"use client";

// src/app/(app)/pizarras/page.tsx
// StarSeed · Pizarras — Hub de centros de trabajo infinitos. Agrupa varias
// pizarras (lienzos) en centros de trabajo: guardar, exportar, compartir y
// almacenar en bibliotecas/carpetas, con vista libre, mapa mental o cerebro,
// junto a tus dashboards.

import WorkCenters from "@/components/canvas/work-centers";

export default function PizarrasPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">Pizarras · Centros de trabajo</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Centros infinitos que agrupan varias pizarras: guarda, exporta, comparte y almacena en bibliotecas y carpetas. Míralos como mapa mental o vista cerebro, junto a tus dashboards.
        </p>
        <WorkCenters />
      </div>
    </main>
  );
}

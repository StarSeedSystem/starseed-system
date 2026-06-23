"use client";

import FuncionesIndex from "@/components/funciones/funciones-index";

export default function FuncionesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-fuchsia-50">Funciones StarSeed</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Catálogo unificado de todos los módulos del sistema, agrupados y enlazados — todo
          descubrible y en su lugar, integrado con Astraura.
        </p>
        <FuncionesIndex />
      </div>
    </main>
  );
}

"use client";

/**
 * /laboratorio — LABORATORIO DE ASTRAURA (Ola 237).
 * ============================================================================
 * El laboratorio del genoma de nueve capas fásicas: del núcleo (ternario
 * 1,58 bits) al contexto. Aquí se inspeccionan genomas, versiones y nodos;
 * NADA de lo que ocurre en esta página escribe en el OS sin confirmación
 * del usuario (regla del área, ver memory/laboratorio-astraura.md).
 *
 * El componente vive en `components/laboratorio/laboratorio-astraura.tsx` y
 * usa 3D, por lo que se carga con `ssr:false` (de lo contrario el build/SSR
 * falla). Registro de navegación: dock-config.ts, dock-defaults.ts y
 * app-catalog.ts (regla dorada del CLAUDE.md §11).
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const Laboratorio = dynamic(
  () => import("@/components/laboratorio/laboratorio-astraura").then((m) => m.LaboratorioAstraura),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Abriendo el laboratorio…
      </div>
    ),
  },
);

export default function LaboratorioPage() {
  return (
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold">Laboratorio de Astraura</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          El genoma de nueve capas fásicas, del núcleo ternario al contexto.
          Nada de lo que veas aquí escribe en el OS sin tu confirmación.
        </p>
      </header>
      <div className="min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Laboratorio />
      </div>
    </section>
  );
}

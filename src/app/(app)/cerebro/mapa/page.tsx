"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// El Canvas / three.js solo puede ejecutarse en el navegador, por lo que el
// componente se carga con ssr:false (de lo contrario el build/SSR falla).
const MindMap = dynamic(
  () => import("@/components/cerebro-mapa/brain-mindmap-3d"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Tejiendo tu mapa mental 3D…
      </div>
    ),
  },
);

export default function CerebroMapaPage() {
  return (
    // El layout (app) ya aporta header + padding; aquí ocupamos casi toda la
    // altura disponible. min-h asegura tamaño aunque el contenedor flex no lo dé.
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-bold text-amber-50">
          Mapa mental 3D · Cerebros, memorias y archivos
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Tus <span className="text-amber-300">cerebros</span> como núcleos, sus{" "}
          <span className="text-violet-300">archivos de memoria</span> (soul · memory · dream ·
          skills · apis) como ramas, y tus <span className="text-cyan-300">memorias</span> como
          satélites conectados. Rota, haz zoom y haz clic en cualquier nodo para inspeccionarlo y
          ajustar su fuente, configuración de servidor y sincronización — en vivo.
        </p>
      </header>
      <div className="min-h-[60vh] flex-1">
        <MindMap className="h-full w-full" />
      </div>
    </section>
  );
}

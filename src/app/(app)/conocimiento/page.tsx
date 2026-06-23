"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// La vista "Red 3D" usa @react-three/fiber + three.js, que solo corren en el
// navegador. Por eso el componente se carga con ssr:false (de lo contrario el
// build/SSR falla al intentar evaluar el Canvas en el servidor).
const KnowledgeNetwork = dynamic(
  () => import("@/components/knowledge/knowledge-network"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] w-full items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando la red de
        conocimiento…
      </div>
    ),
  },
);

export default function ConocimientoPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-amber-50">Red de Conocimiento</h1>
        <p className="mb-6 mt-1 text-sm text-white/50">
          Categorías jerárquicas, temas vinculados a varias ramas y sus vínculos
          de ubicación. Explóralo en tres vistas: Lista (árbol), Mapa Conceptual
          2D y Red 3D (galaxia navegable).
        </p>
        <KnowledgeNetwork />
      </div>
    </main>
  );
}

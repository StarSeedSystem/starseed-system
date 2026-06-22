"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// El Canvas / three.js solo puede ejecutarse en el navegador, por lo que el
// componente se carga con ssr:false (de lo contrario el build/SSR falla).
const Mesh = dynamic(() => import("@/components/brains/brain-mesh-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-white/60">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparando la red 3D…
    </div>
  ),
});

export default function Red3DPage() {
  return (
    // El layout (app) ya aporta header + padding; aquí ocupamos casi toda la
    // altura disponible. min-h asegura tamaño aunque el contenedor flex no lo dé.
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-bold text-amber-50">
          Red 3D · Cerebros, servidores y datos
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Explora cómo se interconectan tus cerebros, servidores, almacenes de datos y baúles como
          un grafo 3D interactivo. Rota, haz zoom, cambia de vista, enfoca un nodo y pide a Astraura
          que organice o explique tu red.
        </p>
      </header>
      <div className="min-h-[60vh] flex-1">
        <Mesh className="h-full w-full" />
      </div>
    </section>
  );
}

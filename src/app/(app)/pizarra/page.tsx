"use client";

// src/app/(app)/pizarra/page.tsx
// StarSeed · Pizarra — Lienzo universal de creación. Tablero que conecta
// archivos, baúles, memorias, apps, enlaces, widgets y el navegador, con
// publicación democrática o inmediata.

import CanvasBoard from "@/components/canvas/canvas-board";

export default function PizarraPage() {
  return (
    <main className="flex flex-col h-[calc(100vh-4rem)] px-4 py-6 md:px-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-amber-50">Pizarra · Lienzo universal</h1>
        <p className="text-sm text-white/50 mt-1">
          Un tablero que conecta cualquier archivo, baúl, memoria, app, enlace, programa, widget o ventana del navegador. Arrastra, posiciona y redimensiona bloques; comparte el lienzo y publícalo como post — de forma inmediata o mediante una propuesta democrática.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <CanvasBoard />
      </div>
    </main>
  );
}

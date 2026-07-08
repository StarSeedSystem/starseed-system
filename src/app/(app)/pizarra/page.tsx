"use client";

// src/app/(app)/pizarra/page.tsx
// StarSeed · Pizarra — Lienzo universal de creación. Tablero que conecta
// archivos, baúles, memorias, apps, enlaces, widgets y el navegador, con
// publicación democrática o inmediata.
//
// Aurora · acción `abrir_pizarra {id}`: la URL puede traer `?canvas=<id>` para
// abrir un lienzo concreto. Se lee con useSearchParams() (envuelto en Suspense
// para evitar el bailout de prerender estático) y se pasa como `canvasId` a
// <CanvasBoard/>.
//
// `?board-space=<id>` (SOP §11, Adenda 65): abre una PIZARRA COMPARTIDA
// (os_spaces kind='board') en modo colaborativo en vez de un lienzo personal.
//
// `?engine=tldraw|starseed` (Adenda tldraw): fuerza el MOTOR de la pizarra —
// manda siempre sobre la preferencia recordada por pizarra (embeds/enlaces
// compartidos deben abrir con el motor correcto de forma determinista). Sin
// este parámetro, <CanvasBoard/> usa la preferencia local de esa pizarra
// (por defecto "Lienzo StarSeed", ver src/lib/canvas/board-engine.ts).

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CanvasBoard from "@/components/canvas/canvas-board";
import type { BoardEngine } from "@/lib/canvas/board-engine";

// Evita el bailout de prerender estático (este árbol lee Supabase en cliente).
export const dynamic = "force-dynamic";

function PizarraBoard() {
  const params = useSearchParams();
  const canvasId = params.get("canvas") ?? undefined;
  const boardSpaceId = params.get("board-space") ?? null;
  const engineRaw = params.get("engine");
  const engineParam: BoardEngine | null = engineRaw === "tldraw" || engineRaw === "starseed" ? engineRaw : null;
  return <CanvasBoard canvasId={canvasId} boardSpaceId={boardSpaceId} engineParam={engineParam} />;
}

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
        <Suspense fallback={<div className="h-full w-full" />}>
          <PizarraBoard />
        </Suspense>
      </div>
    </main>
  );
}

"use client";

/**
 * /mundo-avatares — MUNDO DE LOS AVATARES (Ola 234).
 * ============================================================================
 * La escena 3D viva de la red: cada avatar se representa por su identidad
 * visual (procedural si no hay GLB propio) y se mueve con el MISMO motor de
 * gesto que en perfil, chat o biblioteca. Toca un habitante para centrarlo.
 *
 * El componente vive en `components/avatares/mundo-avatares.tsx` y es "use
 * client" + R3F, por lo que aquí se carga con `ssr:false` (de lo contrario el
 * build/SSR falla). Sin WebGL o con prefers-reduced-motion, MundoAvatares se
 * degrada solo al panel de crónica, nunca deja una pantalla en blanco.
 */

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const Mundo = dynamic(
  () => import("@/components/avatares/mundo-avatares").then((m) => m.MundoAvatares),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-white/60">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Poblando el mundo…
      </div>
    ),
  },
);

export default function MundoAvataresPage() {
  return (
    // El layout (app) ya aporta header + padding; aquí ocupamos casi toda la
    // altura disponible para que la escena 3D respire.
    <section className="flex min-h-[78vh] flex-1 flex-col">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold">Mundo de los avatares</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          La escena viva de la red: cada avatar con su propio gesto, moviéndose
          en libertad según su personalidad. Toca un habitante para centrarlo.
        </p>
      </header>
      <div className="min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Mundo />
      </div>
    </section>
  );
}
"use client";

/**
 * /mundo-avatares — MUNDO DE LOS AVATARES (Ola 234; Ola 1025U · U1 con la idea de la oficina de Hermes3D).
 * ============================================================================
 * Los agentes de tu cuenta, de tus grupos y de tus páginas viven aquí, se
 * conocen y se cruzan en escenarios (tantos como quieras, privados, de un grupo
 * o públicos). Cada agente se mueve con el MISMO motor de gesto que en perfil,
 * chat o biblioteca y lleva la chapa «Bot de IA». Toca uno para abrir su ficha.
 * Si tu aparato tiene visor, puedes entrar en VR o AR.
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
        <h1 className="font-headline text-2xl font-semibold">Mundo de los avatares</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los agentes de tu cuenta, tus grupos y tus páginas viven aquí, se
          conocen y se cruzan. Toca uno para abrir su ficha. Es una simulación
          de juego con agentes reales: sus paseos no son actividad real.
        </p>
      </header>
      <div className="min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Mundo />
      </div>
    </section>
  );
}
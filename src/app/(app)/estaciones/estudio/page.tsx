"use client";

/*
 * /estaciones/estudio (Ola 1010E · ES1010P) — página del estudio de producción
 * en directo de StarSeed OS. Monta la mesa (EstudioProduccion) con cabecera,
 * contexto y enlaces de navegación. Sin dependencias nuevas; los permisos
 * (cámara, micrófono, pantalla) se piden solo al pulsar un botón.
 */

import { EstudioProduccion } from "@/components/estaciones/estudio-produccion";

export default function EstacionesEstudioPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black/80 to-black/40 p-4 md:p-6">
      <header className="mx-auto max-w-6xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Estudio de producción en directo</h1>
        <p className="text-sm text-white/60">Mesa de producción autoadaptable: escenas, fuentes, rótulos, asistente IA y salidas.</p>
      </header>
      <section className="mx-auto mt-4 max-w-6xl">
        <EstudioProduccion />
      </section>
    </main>
  );
}

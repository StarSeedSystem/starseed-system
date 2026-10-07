"use client";

/*
 * /estaciones/estudio (Ola 1010E · ES1010P) — página del estudio de producción
 * en directo (§10 del contrato): monta la mesa ya probada (EstudioProduccion)
 * bajo el mismo contenedor del directorio de estaciones y deja un regreso
 * visible a /estaciones. Sin lógica propia: el permiso de cámara, micro y
 * pantalla se pide solo al pulsar, dentro del componente.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EstudioProduccion } from "@/components/estaciones/estudio-produccion";

const CHIP_VOLVER =
  "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 " +
  "text-xs transition-colors " +
  "border-white/10 bg-black/30 text-white/70 hover:border-white/25";

export default function EstacionesEstudioPage() {
  return (
    <main className="mx-auto w-full max-w-6xl" aria-label="Estudio de producción en directo">
      <nav aria-label="Volver a Estaciones" className="px-4 pt-6">
        <Link href="/estaciones" className={CHIP_VOLVER}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a Estaciones
        </Link>
      </nav>
      <EstudioProduccion />
    </main>
  );
}

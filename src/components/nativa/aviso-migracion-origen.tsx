"use client";

/*
 * AvisoMigracionOrigen — «Tus datos de la versión anterior ya están aquí» (APP1107B · T4, 2026-11-07).
 * Contrato: architecture/apps-autonomas-sin-internet.md §2.1 · lógica: src/lib/nativa/migracion-origen.ts.
 *
 * Global (layout raíz), diminuto. Solo en la app de escritorio servida por su servidor local: lee el
 * marcador que dejó la página de migración y lo cuenta una vez (o dice por qué no se pudo). Al
 * cerrarlo queda «visto» en esta neurona.
 */

import { useEffect, useState } from "react";
import { ArchiveRestore, X } from "lucide-react";
import { esServidorLocal } from "@/lib/nativa/sin-conexion";
import {
  CLAVE_MARCADOR_MIGRACION,
  decidirAvisoMigracion,
  leerMarcadorMigracion,
  marcarVisto,
  type AvisoMigracion,
} from "@/lib/nativa/migracion-origen";

const COLOR: Record<AvisoMigracion["tono"], string> = {
  ok: "text-emerald-300",
  aviso: "text-amber-300",
  error: "text-rose-300",
};

export function AvisoMigracionOrigen() {
  const [aviso, setAviso] = useState<AvisoMigracion | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const enLocal = esServidorLocal(window.location);
      const marcador = leerMarcadorMigracion(window.localStorage.getItem(CLAVE_MARCADOR_MIGRACION));
      const a = decidirAvisoMigracion(marcador, enLocal);
      if (a.mostrar) setAviso(a);
    } catch {
      // Sin localStorage (modo privado): no hay nada que contar.
    }
  }, []);

  if (!aviso) return null;
  const cerrar = () => {
    try {
      const nuevo = marcarVisto(window.localStorage.getItem(CLAVE_MARCADOR_MIGRACION));
      if (nuevo) window.localStorage.setItem(CLAVE_MARCADOR_MIGRACION, nuevo);
    } catch {
      // Se vuelve a ver la próxima vez: nada grave.
    }
    setAviso(null);
  };
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="aviso-migracion-origen"
      className="pointer-events-auto fixed bottom-24 left-1/2 z-[9989] flex w-[min(34rem,92vw)] -translate-x-1/2 items-start gap-2.5 rounded-2xl border border-white/10 bg-black/70 px-3.5 py-2.5 text-xs text-white/90 shadow-lg backdrop-blur-md"
    >
      <ArchiveRestore aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${COLOR[aviso.tono]}`} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-white">{aviso.titulo}</p>
        <p className="mt-0.5 leading-relaxed text-white/70">{aviso.detalle}</p>
      </div>
      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar el aviso de los datos de la versión anterior"
        className="cursor-pointer rounded-full p-0.5 text-white/60 transition-colors duration-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
      >
        <X aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

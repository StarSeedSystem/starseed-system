"use client";

/*
 * DetalleEstacion (Ola 1010H · ES1010Hb) — aplica ReproductorEstacion en la página
 * de detalle por fin: reproductor grande, título, descripción, licencia y
 * espectadores. Carga de os_estaciones con reserva en las fuentes internas.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Share2 } from "lucide-react";
import { obtenerEstacion } from "@/lib/estaciones/datos";
import { estacionesInternas } from "@/lib/estaciones/internas";
import { ETIQUETA_LICENCIA, ETIQUETA_TIPO, type Estacion } from "@/lib/estaciones/tipos";
import { ReproductorEstacion } from "./reproductor-estacion";

export function DetalleEstacion({ id }: { id: string }) {
  const [estacion, setEstacion] = useState<Estacion | null | undefined>();
  const [compartida, setCompartida] = useState(false);

  useEffect(() => {
    let vivo = true;
    obtenerEstacion(id)
      .then((e) => e ?? estacionesInternas().catch(() => [] as Estacion[]).then((l) => l.find((x) => x.id === id) ?? null))
      .then((e) => { if (vivo) setEstacion(e); })
      .catch(() => { if (vivo) setEstacion(null); });
    return () => { vivo = false; };
  }, [id]);

  const compartir = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCompartida(true);
      setTimeout(() => setCompartida(false), 2000);
    } catch { /* el portapapeles no responde */ }
  };

  if (estacion === undefined) {
    return <main className="mx-auto w-full max-w-4xl px-4 py-6 text-sm text-white/60">Cargando estación…</main>;
  }
  if (estacion === null) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/60">
          Esta estación ya no existe
        </p>
        <Link href="/estaciones" className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 text-sm text-white/70 hover:border-white/25">
          <ArrowLeft className="h-4 w-4" /> Volver al directorio
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <Link href="/estaciones" className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 text-sm text-white/60 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Estaciones
      </Link>
      <ReproductorEstacion estacion={estacion} className="w-full" />
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">{estacion.titulo}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-white/10 px-2 py-0.5">{ETIQUETA_TIPO[estacion.tipo]}</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">{ETIQUETA_LICENCIA[estacion.licencia]}</span>
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" /> {estacion.espectadores} espectadores
          </span>
        </div>
      </header>
      {estacion.descripcion && <p className="text-sm text-white/70">{estacion.descripcion}</p>}
      <button type="button" onClick={compartir}
        className="inline-flex h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 text-sm text-white/80 hover:border-white/25">
        <Share2 className="h-4 w-4" /> {compartida ? "Enlace copiado" : "Compartir"}
      </button>
    </main>
  );
}

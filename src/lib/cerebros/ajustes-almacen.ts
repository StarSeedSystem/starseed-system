/**
 * Destinos de almacenamiento de la pestaña Medios de los ajustes (CB1013S).
 *
 * Contrato: architecture/cerebros-fusion-telepatia.md §8.
 * Módulo PURO: sin Supabase, sin `window`, sin `node:*`.
 */

import type { MemoryDestinationsConfig } from "@/lib/brains/memory-destinations";
import { destinosDe, type Dato, type DestinoAlmacen } from "@/lib/malla/cristal/destinos-almacen";

/** Un destino donde puede guardar el cerebro, gordo y legible para la interfaz. */
export interface DestinoMedio {
  id: string;
  etiqueta: string;
  /** Encendido en `config.memoryDestinations` (local SIEMPRE está). */
  activo: boolean;
  origen: "local" | "starseed" | "externo" | "p2p";
}

/** Línea por destino que explica adónde va cada dato (o por qué no va). */
export interface LineaDestino {
  id: string;
  etiqueta: string;
  va: boolean;
  texto: string;
}

/* ─── Motores REALES de escritura, según src/lib/brains/memory-destinations.ts ─── */

export const MOTORES_REALES = ["local", "starseed", "brain-store", "syncthing"];

const MOTOR_DE_ORIGEN: Record<DestinoMedio["origen"], string> = {
  local: "local",
  starseed: "starseed",
  externo: "brain-store",
  p2p: "syncthing",
};

const EXPLICACION: Record<DestinoMedio["origen"], string> = {
  local: "espejo de memorias de este aparato (memory-offline); nunca se apaga.",
  starseed: "tabla brain_memory_files de tu cuenta StarSeed, con manifiesto en entity_state.",
  externo: "el cerebro-almacén envía las memorias por POST a la URL de este destino.",
  p2p: "espejo de archivos Syncthing entre tus aparatos; no envía contenido a ningún servidor.",
};

/** Los destinos legibles de un cerebro, desde su config de destinos de memoria. */
export function destinosMedios(cfg: MemoryDestinationsConfig): DestinoMedio[] {
  return [
    { id: "local", etiqueta: "Este aparato (local)", activo: true, origen: "local" },
    { id: "starseed", etiqueta: "StarSeed", activo: cfg.starseed.enabled, origen: "starseed" },
    ...cfg.external.map((e) => ({
      id: e.id,
      etiqueta: e.label,
      activo: true,
      origen: "externo" as const,
    })),
    {
      id: "p2p",
      etiqueta: cfg.p2p.label ? `Syncthing · ${cfg.p2p.label}` : "Syncthing (P2P)",
      activo: cfg.p2p.enabled,
      origen: "p2p" as const,
    },
  ];
}

/** Convierte un destino en la pieza que `destinosDe()` sabe juzgar. */
function aDestinoAlmacen(d: DestinoMedio): DestinoAlmacen {
  return {
    id: d.id,
    tipo: d.origen === "local" || d.origen === "p2p" ? "aparato" : "servidor",
    motor: MOTOR_DE_ORIGEN[d.origen],
    publico: false,
  };
}

/**
 * Una línea por destino explicando adónde va cada dato, con `destinosDe()` de la
 * malla (cristal). Sin «auto» (o sin elección), se consideran los destinos
 * encendidos del cerebro; con una elección, lo elegido más el espejo local
 * (que nunca se apaga). Los destinos apagados no entran en el juicio y su
 * línea lo dice: nada va allí por ahora.
 */
export function explicarDestinos(
  destinos: DestinoMedio[],
  clase: Dato["clase"],
  elegidos: string[] = [],
  motores: string[] = MOTORES_REALES,
): LineaDestino[] {
  const activos = destinos.filter((d) => d.activo);
  const auto = elegidos.length === 0 || elegidos.includes("auto");
  const considerados = auto
    ? activos.map((d) => d.id)
    : Array.from(new Set([...elegidos, "local"])).filter((id) => activos.some((a) => a.id === id));
  const juicio = destinosDe(
    { clase },
    {
      politicaContexto: activos.map((d) => d.id),
      disponibles: activos.map(aDestinoAlmacen),
      ...(auto ? {} : { elegidosPorDato: considerados }),
      motoresReales: motores,
    },
  );
  const guardados = new Set(juicio.guardar.map((g) => g.id));
  const motivos = new Map(juicio.descartados.map((x) => [x.id, x.motivo]));
  return destinos.map((d) => {
    if (!d.activo) {
      return { id: d.id, etiqueta: d.etiqueta, va: false, texto: "No está encendido en los destinos de este cerebro: por ahora nada va allí." };
    }
    if (guardados.has(d.id)) {
      return { id: d.id, etiqueta: d.etiqueta, va: true, texto: EXPLICACION[d.origen] };
    }
    const motivo = motivos.get(d.id) ?? "no está entre los elegidos para este dato";
    return { id: d.id, etiqueta: d.etiqueta, va: false, texto: motivo };
  });
}

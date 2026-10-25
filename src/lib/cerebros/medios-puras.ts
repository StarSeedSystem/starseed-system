/**
 * Purezas de los ajustes de medios (CB1013S, contrato §8): opciones del selector
 * de capacidades y destinos de memoria con su explicación honesta (adónde va cada dato,
 * juzgado con destinosDe() de la malla). Módulo PURO: sin red, disco ni procesos.
 */

import { normalizeMemoryDestinations, type MemoryDestinationsConfig } from "@/lib/brains/memory-destinations";
import { destinosDe, type Dato, type DestinoAlmacen } from "@/lib/malla/cristal/destinos-almacen";

/** Opción del selector de capacidad: el sistema, un servidor del cerebro o una neurona. */
export interface OpcionMedio {
  id: string;
  texto: string;
  grupo: "auto" | "servidor" | "neurona";
}

/** Un destino de memoria con su explicación honesta. */
export interface DestinoMedios {
  id: string;
  texto: string;
  activo: boolean;
  /** No se alterna aquí: el espejo local va siempre y los externos se quitan en su panel. */
  fijo: boolean;
  destino: DestinoAlmacen;
  explicacion: string;
}

/** Opciones para el selector de capacidad: «Automático» primero, sin ids repetidos. */
export function opcionesDeMedio(
  servidores: { id: string; name: string }[],
  neuronas: { id: string; name: string }[],
): OpcionMedio[] {
  const opciones: OpcionMedio[] = [{ id: "auto", texto: "Automático", grupo: "auto" }];
  const vistas = new Set(["auto"]);
  const sumar = (grupo: OpcionMedio["grupo"], o: { id: string; name: string }) => {
    const id = String(o?.id ?? "").trim();
    if (!id || vistas.has(id)) return;
    vistas.add(id);
    opciones.push({ id, texto: String(o?.name ?? "").trim() || id, grupo });
  };
  for (const s of Array.isArray(servidores) ? servidores : []) sumar("servidor", s);
  for (const n of Array.isArray(neuronas) ? neuronas : []) sumar("neurona", n);
  return opciones;
}

/** Motores con escritura real hoy: los pasos que syncBrainMemoryNow sabe dar. */
export const MOTORES_REALES = ["local", "starseed", "externo", "syncthing"];

function baseDe(id: string, texto: string): string {
  if (id === "local") return "se quedan en este aparato (espejo local).";
  if (id === "starseed") return "van a la StarSeed store de tu cuenta (brain_memory_files, solo para ti).";
  if (id === "p2p") return "se espejan entre tus aparatos con Syncthing.";
  return `se envían por internet a «${texto}» (bundle de memorias).`;
}

/**
 * Una línea por destino, explicada con destinosDe() de la malla: para un dato de la clase
 * dada dice si guardar ahí es admisible y adónde va; si destinosDe() lo descarta, copia su
 * motivo. Un destino apagado no se mide: se dice que no se envía nada.
 */
export function lineasDestino<T extends Omit<DestinoMedios, "explicacion">>(
  destinos: T[],
  clase: Dato["clase"],
): DestinoMedios[] {
  const juicio = destinosDe(
    { clase },
    {
      politicaContexto: destinos.map((d) => d.id),
      disponibles: destinos.map((d) => d.destino),
      motoresReales: MOTORES_REALES,
    },
  );
  const motivos = new Map(juicio.descartados.map((x) => [x.id, x.motivo]));
  return destinos.map((d) => {
    if (!d.activo) return { ...d, explicacion: `${d.texto}: apagado; no se envían datos a este destino.` };
    const motivo = motivos.get(d.id);
    return { ...d, explicacion: motivo ? `Los datos no van aquí: ${motivo}.` : `Los datos ${baseDe(d.id, d.texto)}` };
  });
}

/** Los destinos de memoria de un cerebro, con su explicación (las memorias son datos privados). */
export function destinosDeMemorias(raw: unknown): DestinoMedios[] {
  const d = normalizeMemoryDestinations(raw);
  const base: Omit<DestinoMedios, "explicacion">[] = [
    { id: "local", texto: "Este aparato", activo: true, fijo: true, destino: { id: "local", tipo: "aparato", motor: "local", publico: false } },
    { id: "starseed", texto: "StarSeed", activo: d.starseed.enabled, fijo: false, destino: { id: "starseed", tipo: "servidor", motor: "starseed", publico: false } },
    ...d.external.map((e): Omit<DestinoMedios, "explicacion"> => ({ id: e.id, texto: e.label, activo: true, fijo: true, destino: { id: e.id, tipo: "servidor", motor: "externo", publico: false } })),
    { id: "p2p", texto: d.p2p.label ? `Syncthing · ${d.p2p.label}` : "Syncthing (P2P)", activo: d.p2p.enabled, fijo: false, destino: { id: "p2p", tipo: "aparato", motor: "syncthing", publico: false } },
  ];
  return lineasDestino(base, "privado");
}

/** Ids elegidos hoy: local va siempre; siguen StarSeed, los externos que existan y Syncthing. */
export function idsElegidosDestinos(raw: unknown): string[] {
  const d = normalizeMemoryDestinations(raw);
  return [
    "local",
    ...(d.starseed.enabled ? ["starseed"] : []),
    ...d.external.map((e) => e.id),
    ...(d.p2p.enabled ? ["p2p"] : []),
  ];
}

/** Entrada de setMemoryDestinations (se aplica de verdad en el nivel cerebro). Local y externos no se tocan aquí. */
export function parcheDestinos(d: MemoryDestinationsConfig, elegidos: string[]): Partial<MemoryDestinationsConfig> {
  return {
    starseed: { enabled: elegidos.includes("starseed") },
    p2p: { enabled: elegidos.includes("p2p"), folderId: d.p2p.folderId, label: d.p2p.label },
  };
}

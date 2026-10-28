/**
 * servidor-voz-sesion.ts — elección autogestionada del servidor de voz de la
 * sesión (Ola 1015V · S). Contrato: architecture/voz-fusionada-astraura.md §5.
 * Entradas y salidas puras, todo inyectado (sin red, sin disco, sin reloj
 * propio): las fichas son las del §5 (`CapacidadesNodo.voz`), medidas en cada
 * neurona, nunca declaradas. Ninguna función lanza.
 */

import type { CapacidadesNodo } from "./capacidades-nodo";

export type TipoSesionVoz = "solo" | "grupo" | "llamada";

export interface EntradaServidorVozSesion {
  /** Tu sesión actual: tú solo, tu grupo o una llamada. */
  sesion: { miembros?: string[]; tipo: TipoSesionVoz };
  /** Fichas del §5 conocidas ahora (propias y de los demás). */
  fichas: readonly CapacidadesNodo[];
  /** Reloj inyectado (ms) para juzgar latidos y vigencia. */
  ahora: number;
  /** Servidor de la ronda anterior, para la histéresis. */
  actual?: { oido?: string; habla?: string };
  /** Id del Oracle A1 (24/7): entra como servidor propio aunque no sea miembro. */
  a1Id?: string;
}

export interface EleccionServidorVoz {
  /** Neurona que sirve como oído (menor tiempo real medido), si la hay. */
  oido?: string;
  /** Neurona que sirve como voz (menor primer sonido medido), si la hay. */
  habla?: string;
  /** Por qué, legible para la interfaz. */
  motivo: string;
}

/** Un latido más viejo que esto = la neurona dejó de latir (§5: «esté encendida»). */
export const LATIDO_MAX_MS = 2 * 60 * 1000;
/** RAM libre que exige el oído: Phonon-2 pesa 164 MB (§1). */
export const RAM_MIN_OIDO_MB = 250;
/** RAM libre que exige la voz: el modelo neuronal local ronda los 600 MB. */
export const RAM_MIN_HABLA_MB = 600;
/** Histéresis: solo cambia si la mejor viva es un 30 % mejor que la actual. */
export const MEJOR_REQUERIDA = 0.3;

type Rol = "oido" | "habla";
const RAM_MIN: Record<Rol, number> = { oido: RAM_MIN_OIDO_MB, habla: RAM_MIN_HABLA_MB };

/** Mejor latencia MEDIDA del rol en la ficha; sin medidas no hay candidato. */
function latenciaDe(f: CapacidadesNodo, rol: Rol): number | null {
  const lista = f.voz?.[rol];
  if (!lista || lista.length === 0) return null;
  let mejor: number | null = null;
  for (const m of lista) {
    const v = rol === "oido" ? (m as { tiempoReal: number }).tiempoReal : (m as { primerSonidoMs: number }).primerSonidoMs;
    if (typeof v === "number" && Number.isFinite(v) && (mejor === null || v < mejor)) mejor = v;
  }
  return mejor;
}

/** El A1 se llama «a1» o el id que quien pregunta declare. */
function esA1(id: string, a1Id?: string): boolean {
  return id === "a1" || (typeof a1Id === "string" && id === a1Id);
}

/** Confianza (§5): tus neuronas, las de los miembros de la sesión o el A1. */
function esDeConfianza(f: CapacidadesNodo, miembros: Set<string>, a1Id?: string): boolean {
  const a = f.ambitos ?? [];
  return miembros.has(f.nodoId) || esA1(f.nodoId, a1Id) || a.includes("propio") || a.includes("cuenta");
}

/** Viva para servir: latido reciente, con RAM de primer plano de la neurona. */
function estaDisponible(f: CapacidadesNodo, rol: Rol, ahora: number): boolean {
  const edad = ahora - f.t;
  return f.enSegundoPlano !== true && edad >= 0 && edad <= LATIDO_MAX_MS && f.ramLibreMb >= RAM_MIN[rol];
}

interface ElegidoRol {
  id?: string;
  lat: number | null;
  razon: string;
}

/** Elige la neurona de un rol aplicando la histéresis (§5). Puro. */
function elegirRol(rol: Rol, candidatas: { ficha: CapacidadesNodo; lat: number }[], actualId?: string): ElegidoRol {
  const nombre = rol === "oido" ? "oído" : "voz";
  const orden = [...candidatas].sort((a, b) => a.lat - b.lat || a.ficha.nodoId.localeCompare(b.ficha.nodoId));
  if (orden.length === 0) return { lat: null, razon: `sin ${nombre} vivo y de confianza en las fichas` };
  const mejor = orden[0];
  const anterior = actualId ? orden.find((c) => c.ficha.nodoId === actualId) : undefined;
  const sinActual = !actualId;
  if (sinActual) {
    return { id: mejor.ficha.nodoId, lat: mejor.lat, razon: `elegida por menor latencia medida del ${nombre}` };
  }
  if (!anterior) {
    return { id: mejor.ficha.nodoId, lat: mejor.lat, razon: `relevo: la ${nombre} anterior dejó de latir o de ser elegible` };
  }
  if (mejor.ficha.nodoId !== actualId && mejor.lat <= anterior.lat * (1 - MEJOR_REQUERIDA)) {
    return { id: mejor.ficha.nodoId, lat: mejor.lat, razon: `histéresis superada: hay un 30 % mejor de ${nombre}` };
  }
  return { id: actualId, lat: anterior.lat, razon: `se mantiene la actual (ningún ${nombre} vivo es un 30 % mejor)` };
}

function datoRol(rol: Rol, e: ElegidoRol): string {
  const nombre = rol === "oido" ? "oído" : "voz";
  const medida = e.lat == null ? ""
    : rol === "oido" ? ` ×${e.lat.toPrecision(3)} tiempo real` : ` ${Math.round(e.lat)} ms al primer sonido`;
  return e.id ? `${nombre}: ${e.id}${medida} (${e.razon})` : `${nombre}: no hay (${e.razon})`;
}

/**
 * elegirServidorVoz — elige el servidor de oído y de voz para una sesión (§5).
 * Cuenta: menor latencia medida, RAM libre suficiente, latido < 2 min y
 * confianza (tus neuronas, los miembros de la sesión o el A1). Histéresis:
 * solo cambia el servidor si el mejor candidato vivo es un 30 % mejor o si el
 * actual dejó de latir o de ser elegible. Nunca lanza.
 */
export function elegirServidorVoz(entrada: EntradaServidorVozSesion): EleccionServidorVoz {
  try {
    const miembros = new Set(
      (entrada.sesion?.miembros ?? []).filter((m): m is string => typeof m === "string" && m.trim() !== ""),
    );
    const vivas = (entrada.fichas ?? []).filter(
      (f) => !!f && typeof f.nodoId === "string" && f.nodoId.trim() !== "" && esDeConfianza(f, miembros, entrada.a1Id),
    );
    const porRol = (rol: Rol): { ficha: CapacidadesNodo; lat: number }[] =>
      vivas
        .map((f) => ({ ficha: f, lat: latenciaDe(f, rol) }))
        .filter((c): c is { ficha: CapacidadesNodo; lat: number } => c.lat !== null && estaDisponible(c.ficha, rol, entrada.ahora));
    const oido = elegirRol("oido", porRol("oido"), entrada.actual?.oido);
    const habla = elegirRol("habla", porRol("habla"), entrada.actual?.habla);
    const motivo = [datoRol("oido", oido), datoRol("habla", habla)].join(" · ");
    return { ...(oido.id ? { oido: oido.id } : {}), ...(habla.id ? { habla: habla.id } : {}), motivo };
  } catch (e) {
    return { motivo: `Elección de servidor de voz no posible: ${e instanceof Error ? e.message : "error desconocido"}` };
  }
}

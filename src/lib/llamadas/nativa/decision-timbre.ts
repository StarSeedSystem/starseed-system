/*
 * decision-timbre — quién hace sonar una llamada entrante y con qué datos arranca la parte nativa (LLA1108F, 2026-11-09).
 * Contrato: architecture/llamadas-telefonia.md § 8.5.
 *
 * MÓDULO PURO (sin DOM ni Tauri; el almacén de «ignoradas» de abajo es un Set en memoria):
 *  · `decidirTimbre`: web o nativo, nunca los dos. Con la app a la vista suena la web (su tarjeta y su tono); en
 *    cualquier otro estado (fondo, bloqueada, cerrada) suena la parte nativa y la web calla. Sin parte nativa
 *    (web normal, Windows, Linux) suena la web siempre. «Ignorar» y un silencio vigente callan a los dos;
 *    el silencio deja una entrada «Llamada silenciada (hasta…)» con «Deshacer».
 *  · `cargaIniciarNativo`: la señal entrante → los datos de `llamada_nativa_iniciar` (iniciales del avatar, medio,
 *    a quién pertenece, hasta cuándo está silenciada).
 *  · `silencioDesdeEvento`: el evento «silencio» del teléfono o de la ventana de escritorio → un `Silencio` de la política.
 */

import {
  AMBITOS,
  CLAVE_TODAS,
  crearSilencio,
  DURACIONES,
  hastaDe,
  silenciadaPor,
  type AmbitoSilencio,
  type ConsultaLlamada,
  type DuracionSilencio,
  type Silencio,
} from "../silencio-llamadas";
import type { LlamadaParaNativa } from "./mapeo-llamada-nativa";

export interface EntornoTimbre {
  /** Hay parte nativa que puede sonar (Android con el parche). */
  nativa: boolean;
  /** La app está en pantalla, con foco y desbloqueada. */
  appVisible: boolean;
  /** La persona pulsó «Ignorar» en esta llamada. */
  ignorada: boolean;
  /** El silencio vigente que cubre la llamada, si hay. */
  silencio: Silencio | null;
}

export interface DecisionTimbre {
  /** Se pinta la tarjeta/ventana de la llamada entrante de la web. */
  tarjetaWeb: boolean;
  /** Suena el tono (y vibra) de la web. */
  sonidoWeb: boolean;
  /** Suena el timbre nativo y se abre su ventana sobre el bloqueo. */
  sonidoNativo: boolean;
  /** Se enseña «Llamada silenciada (hasta…)» con «Deshacer» en vez de la tarjeta. */
  entradaSilenciada: Silencio | null;
}

export function decidirTimbre(e: EntornoTimbre): DecisionTimbre {
  if (e.ignorada) return { tarjetaWeb: false, sonidoWeb: false, sonidoNativo: false, entradaSilenciada: null };
  if (e.silencio) return { tarjetaWeb: false, sonidoWeb: false, sonidoNativo: false, entradaSilenciada: e.silencio };
  const webSuena = !e.nativa || e.appVisible;
  return { tarjetaWeb: true, sonidoWeb: webSuena, sonidoNativo: e.nativa && !e.appVisible, entradaSilenciada: null };
}

/* ══════════════════════════ De la señal entrante a la parte nativa ══════════════════════════ */

/** «Ana Pérez» → «AP»; «mac» → «M»; vacío → «S». */
export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const i = partes.map((p) => Array.from(p)[0] ?? "").join("").toUpperCase();
  return i || "S";
}

export const MEDIOS_CONOCIDOS = ["red-local", "bluetooth", "internet", "malla"] as const;

export function textoMedio(medio: string | undefined): string {
  switch (medio) {
    case "bluetooth":
      return "por Bluetooth directo";
    case "red-local":
      return "por la red local";
    case "malla":
      return "por la malla";
    case "internet":
      return "por internet";
    default:
      return "por StarSeed";
  }
}

export function consultaDe(l: Pick<LlamadaParaNativa, "uid" | "neurona" | "chat" | "medio">): ConsultaLlamada {
  return { uid: l.uid ?? null, neurona: l.neurona ?? null, chat: l.chat ?? null, medio: l.medio ?? null };
}

/** Lo que recibe `llamada_nativa_iniciar` (todo lo opcional es opcional también en Rust). */
export interface CargaIniciarNativo {
  id: string;
  nombre: string;
  tipo: "voz" | "video";
  entrante: boolean;
  iniciales?: string;
  medio?: string;
  uid?: string;
  neurona?: string;
  chat?: string;
  /** Epoch ms hasta el que la política silencia esta llamada; sin campo = suena. */
  silencioHasta?: number;
}

/** Marca de «sin fin» para un silencio sin fecha (cabe en un entero de 64 bits de Rust y Kotlin). */
export const SIN_FIN_NATIVO = Number.MAX_SAFE_INTEGER;

export function cargaIniciarNativo(l: LlamadaParaNativa, silencios: readonly Silencio[], ahora: number): CargaIniciarNativo {
  const base: CargaIniciarNativo = { id: l.id, nombre: l.nombre, tipo: l.tipo, entrante: l.entrante };
  if (!l.entrante) return base;
  const s = silenciadaPor(silencios, consultaDe(l), ahora);
  return {
    ...base,
    iniciales: inicialesDe(l.nombre),
    medio: l.medio && (MEDIOS_CONOCIDOS as readonly string[]).includes(l.medio) ? l.medio : "desconocido",
    ...(l.uid ? { uid: l.uid } : {}),
    ...(l.neurona ? { neurona: l.neurona } : {}),
    ...(l.chat ? { chat: l.chat } : {}),
    ...(s ? { silencioHasta: s.hasta ?? SIN_FIN_NATIVO } : {}),
  };
}

/* ══════════════════════════ Del evento «silencio» a la política ══════════════════════════ */

/** La clave de un ámbito para esta llamada (null si no se sabe: no se puede silenciar «esta neurona» sin saber cuál). */
export function claveParaAmbito(ambito: AmbitoSilencio, l: Pick<LlamadaParaNativa, "uid" | "neurona" | "chat" | "medio">): string | null {
  switch (ambito) {
    case "todas":
      return CLAVE_TODAS;
    case "persona":
      return l.uid ?? null;
    case "neurona":
      return l.neurona ?? null;
    case "chat":
      return l.chat ?? null;
    case "medio":
      return l.medio ?? null;
    default:
      return null;
  }
}

export type CambioSilencio = { tipo: "poner"; silencio: Silencio } | { tipo: "quitar"; id: string };

/**
 * El evento «silencio» → qué cambia en la política. Acepta el silencio ya hecho por Kotlin (`id`, `clave`, `hasta`) o
 * una orden (`ambito` + `duracion`) que se completa con lo que se sabe de la llamada. `{ id, quitado: true }` = «Deshacer».
 */
export function silencioDesdeEvento(valor: unknown, llamada: Pick<LlamadaParaNativa, "nombre" | "uid" | "neurona" | "chat" | "medio"> | null, ahora: number): CambioSilencio | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Record<string, unknown>;
  if (v.quitado === true && typeof v.id === "string" && v.id) return { tipo: "quitar", id: v.id.slice(0, 200) };
  const ambito = typeof v.ambito === "string" && (AMBITOS as readonly string[]).includes(v.ambito) ? (v.ambito as AmbitoSilencio) : null;
  if (!ambito) return null;
  const duracion = typeof v.duracion === "string" && (DURACIONES as readonly string[]).includes(v.duracion) ? (v.duracion as DuracionSilencio) : null;
  const clave = typeof v.clave === "string" && v.clave ? v.clave : llamada ? claveParaAmbito(ambito, llamada) : ambito === "todas" ? CLAVE_TODAS : null;
  if (!clave) return null;
  const hastaDado = v.hasta === null ? null : typeof v.hasta === "number" && Number.isFinite(v.hasta) && v.hasta >= 0 ? Math.floor(v.hasta) : undefined;
  if (hastaDado === undefined && !duracion) return null;
  const etiqueta = typeof v.etiqueta === "string" && v.etiqueta ? v.etiqueta : ambito === "todas" ? "Todas las llamadas" : ambito === "medio" ? textoMedio(clave).replace(/^por /, "") : llamada?.nombre || clave;
  const base = crearSilencio({ ambito, clave, etiqueta, duracion: duracion ?? "siempre", ahora, ...(typeof v.id === "string" && v.id ? { id: v.id.slice(0, 200) } : {}) });
  if (!base) return null;
  return { tipo: "poner", silencio: { ...base, hasta: hastaDado !== undefined ? (hastaDado === null || hastaDado >= SIN_FIN_NATIVO / 2 ? null : hastaDado) : hastaDe(duracion as DuracionSilencio, ahora) } };
}

/* ══════════════════════════ «Ignoradas» de esta ventana ══════════════════════════ */

const ignoradas = new Set<string>();
const oyentes = new Set<() => void>();
let version = 0;

export function ignorarLlamada(id: string): void {
  if (!id || ignoradas.has(id)) return;
  ignoradas.add(id);
  while (ignoradas.size > 50) {
    const primero = ignoradas.values().next().value;
    if (primero === undefined) break;
    ignoradas.delete(primero);
  }
  version += 1;
  for (const cb of Array.from(oyentes)) {
    try {
      cb();
    } catch {
      /* un oyente roto no para a los demás */
    }
  }
}

export function estaIgnorada(id: string): boolean {
  return ignoradas.has(id);
}

export function versionIgnoradas(): number {
  return version;
}

export function suscribirIgnoradas(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/** Solo pruebas. */
export function __reiniciarIgnoradas(): void {
  ignoradas.clear();
  oyentes.clear();
  version = 0;
}

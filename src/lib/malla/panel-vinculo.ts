/**
 * panel-vinculo — las decisiones PURAS del panel de vínculos entre neuronas (2026-11-07 · VIN1107A).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Lo que enseña el panel (vías, latencia, mejor vía, sincronizaciones, capas compartidas, de quién es la
 * neurona) se decide aquí, sin React ni red, para poder probarlo. Regla de la casa: nada inventado; si un
 * dato no se sabe, el texto lo dice («sin medir», «no se sabe»).
 */

import type { LatenciaVia, SincronizacionResumen, ViaSync } from "./sincronizacion-neuronas";
import { esTerminal } from "./sincronizacion-neuronas";

/* ══════════════════════════ Vías y latencia ══════════════════════════ */

export const ETIQUETA_VIA_CORTA: Record<ViaSync, string> = {
  "red-local-nativa": "Red local (app nativa)",
  "enlace-local": "Enlace directo (QR)",
  bluetooth: "Bluetooth directo",
  "malla-cuenta": "Malla de tu cuenta",
  "vinculo-par": "Vínculo entre cuentas",
  rele: "Relé cifrado",
  lora: "Radio LoRa",
};

/** Desempate cuando dos vías no tienen medida: primero lo más directo y sin internet. */
export const ORDEN_VIAS: readonly ViaSync[] = ["red-local-nativa", "enlace-local", "bluetooth", "malla-cuenta", "vinculo-par", "lora", "rele"];

/** «sin medir» / «<1 ms» / «12 ms» / «1,2 s». */
export function textoLatencia(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "sin medir";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/** Color semántico de una latencia (para el punto de la fila): rápida, normal, lenta o sin dato. */
export type NivelLatencia = "rapida" | "normal" | "lenta" | "sin-medir";

export function nivelLatencia(ms: number | null | undefined): NivelLatencia {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "sin-medir";
  if (ms <= 50) return "rapida";
  if (ms <= 250) return "normal";
  return "lenta";
}

/**
 * La mejor vía disponible: la de menor latencia medida; si ninguna está medida, la primera por
 * `ORDEN_VIAS`. Una vía medida gana a una sin medir (es un dato, no una suposición). null si ninguna sirve.
 */
export function mejorVia(vias: readonly LatenciaVia[]): LatenciaVia | null {
  const orden = (v: ViaSync) => ORDEN_VIAS.indexOf(v);
  const libres = vias.filter((v) => v.disponible);
  if (!libres.length) return null;
  return [...libres].sort((a, b) => {
    const ma = typeof a.latenciaMs === "number";
    const mb = typeof b.latenciaMs === "number";
    if (ma !== mb) return ma ? -1 : 1;
    if (ma && mb && a.latenciaMs !== b.latenciaMs) return (a.latenciaMs as number) - (b.latenciaMs as number);
    return orden(a.via) - orden(b.via);
  })[0];
}

/** Las vías ordenadas para la lista: disponibles primero (por mejor), luego las no disponibles. */
export function ordenarVias(vias: readonly LatenciaVia[]): LatenciaVia[] {
  const mejor = mejorVia(vias);
  return [...vias].sort((a, b) => {
    if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
    if (mejor && a.via === mejor.via) return -1;
    if (mejor && b.via === mejor.via) return 1;
    return ORDEN_VIAS.indexOf(a.via) - ORDEN_VIAS.indexOf(b.via);
  });
}

/** «hace 5 s», «hace 3 min»…; null si nunca se midió. */
export function haceCuanto(at: number | null | undefined, ahora: number): string {
  if (typeof at !== "number" || !Number.isFinite(at)) return "nunca";
  const s = Math.max(0, Math.round((ahora - at) / 1000));
  if (s < 5) return "ahora";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/* ══════════════════════════ Filas (lista de todas las neuronas) ══════════════════════════ */

export interface VinculoMinimo {
  neurona: string;
  nombre: string;
  plataforma?: string;
  medio?: "app-nativa" | "navegador";
  recordado: boolean;
  enRedLocal: boolean;
  vias: readonly LatenciaVia[];
  sincronizaciones: readonly SincronizacionResumen[];
}

export interface FilaVinculo {
  neurona: string;
  nombre: string;
  /** Hay al menos un camino ahora. */
  activa: boolean;
  recordado: boolean;
  mejor: LatenciaVia | null;
  /** «Red local (app nativa) · 12 ms» o «sin camino ahora». */
  resumen: string;
  nivel: NivelLatencia;
  enCurso: number;
  /** Texto del medio: «macOS · app nativa». */
  medioTexto: string;
}

export function sincronizacionActiva(s: Pick<SincronizacionResumen, "estado">): boolean {
  return !esTerminal(s.estado);
}

export function medioTexto(v: Pick<VinculoMinimo, "plataforma" | "medio">): string {
  const m = v.medio === "app-nativa" ? "app nativa" : v.medio === "navegador" ? "navegador" : null;
  return [v.plataforma, m].filter(Boolean).join(" · ") || "medio desconocido";
}

export function filaDeVinculo(v: VinculoMinimo): FilaVinculo {
  const mejor = mejorVia(v.vias);
  return {
    neurona: v.neurona,
    nombre: v.nombre || "Neurona",
    activa: !!mejor,
    recordado: v.recordado,
    mejor,
    resumen: mejor ? `${ETIQUETA_VIA_CORTA[mejor.via]} · ${textoLatencia(mejor.latenciaMs)}` : "sin camino ahora",
    nivel: mejor ? nivelLatencia(mejor.latenciaMs) : "sin-medir",
    enCurso: v.sincronizaciones.filter(sincronizacionActiva).length,
    medioTexto: medioTexto(v),
  };
}

/** Activas primero (por latencia medida, las medidas antes), luego las recordadas sin camino, por nombre. */
export function filasOrdenadas(vinculos: readonly VinculoMinimo[]): FilaVinculo[] {
  const filas = vinculos.map(filaDeVinculo);
  return filas.sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1;
    const la = a.mejor?.latenciaMs;
    const lb = b.mejor?.latenciaMs;
    const ma = typeof la === "number";
    const mb = typeof lb === "number";
    if (ma !== mb) return ma ? -1 : 1;
    if (ma && mb && la !== lb) return (la as number) - (lb as number);
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export function resumenLista(filas: readonly FilaVinculo[]): string {
  if (!filas.length) return "Ninguna neurona vinculada todavía.";
  const activas = filas.filter((f) => f.activa).length;
  const curso = filas.reduce((n, f) => n + f.enCurso, 0);
  const base = `${filas.length} vinculada${filas.length === 1 ? "" : "s"} · ${activas} con camino ahora`;
  return curso ? `${base} · ${curso} sincronización${curso === 1 ? "" : "es"} en curso` : base;
}

/* ══════════════════════════ De quién es (privada/pública, personal/comunitaria) ══════════════════════════ */

export interface DatosAmbito {
  /** Verificado por el servidor (señal) o deducido de que la cuenta del vínculo es la mía. undefined = no se sabe. */
  propia?: boolean;
  /** El emisor eligió mostrarse en el radar público (solo cuentas ajenas). */
  publico?: boolean;
}

export interface Ambito {
  cuenta: "propia" | "ajena" | "desconocida";
  visibilidad: "privada" | "publica" | "anonima" | "desconocida";
  /** Personal / comunitaria: el modelo de neuronas no distingue comunitarias; siempre se dice. */
  uso: "personal" | "sin-dato";
  etiqueta: string;
  detalle: string;
}

export function ambitoDeNeurona(d: DatosAmbito): Ambito {
  if (d.propia === true) {
    return {
      cuenta: "propia",
      visibilidad: "privada",
      uso: "personal",
      etiqueta: "Personal · privada",
      detalle: "Es una neurona de tu cuenta: solo tú la ves y la sincronizas.",
    };
  }
  if (d.propia === false) {
    return d.publico
      ? {
          cuenta: "ajena",
          visibilidad: "publica",
          uso: "sin-dato",
          etiqueta: "De otra cuenta · pública",
          detalle: "Su dueño eligió mostrarse en el radar público. Si es personal o de una comunidad no lo dice: no se sabe.",
        }
      : {
          cuenta: "ajena",
          visibilidad: "anonima",
          uso: "sin-dato",
          etiqueta: "De otra cuenta · anónima",
          detalle: "Su dueño no eligió mostrarse en el radar público. Si es personal o de una comunidad no se sabe.",
        };
  }
  return {
    cuenta: "desconocida",
    visibilidad: "desconocida",
    uso: "sin-dato",
    etiqueta: "De quién es: sin dato",
    detalle: "Esta señal no dice de qué cuenta es; no se inventa.",
  };
}

/** Compara la cuenta de un vínculo con la mía: undefined si falta alguna de las dos. */
export function esCuentaPropia(cuentaVinculo: string | undefined, miCuenta: string | null | undefined): boolean | undefined {
  if (!cuentaVinculo || !miCuenta) return undefined;
  return cuentaVinculo === miCuenta;
}

/* ══════════════════════════ Capacidades y capas de conciencia ══════════════════════════ */

export type CapaConcienciaId = "local" | "mesh" | "nube" | "colectiva";

const CAPAS_ID: readonly CapaConcienciaId[] = ["local", "mesh", "nube", "colectiva"];
export const PREFIJO_CAPA = "capa:";

export const NOMBRE_CAPA: Record<CapaConcienciaId, string> = {
  local: "Local",
  mesh: "Mesh",
  nube: "Nube",
  colectiva: "Colectiva",
};

/**
 * Lo que esta neurona ANUNCIA de sus capas de conciencia: solo las que tiene encendidas y solo si el
 * interruptor general está activo. NUNCA el «contexto personal» (es privado): solo `local`, `mesh`,
 * `nube` y `colectiva`, como `capa:<id>`.
 */
export function capasAnunciadas(pref: { activo: boolean; capas: Partial<Record<string, boolean>> }): string[] {
  if (!pref.activo) return [];
  return CAPAS_ID.filter((c) => pref.capas[c] !== false).map((c) => `${PREFIJO_CAPA}${c}`);
}

export interface CapacidadesSeparadas {
  capas: CapaConcienciaId[];
  otras: string[];
}

export function separarCapacidades(caps: readonly string[]): CapacidadesSeparadas {
  const capas: CapaConcienciaId[] = [];
  const otras: string[] = [];
  for (const c of caps) {
    if (c.startsWith(PREFIJO_CAPA)) {
      const id = c.slice(PREFIJO_CAPA.length) as CapaConcienciaId;
      if (CAPAS_ID.includes(id) && !capas.includes(id)) capas.push(id);
    } else if (c.trim()) {
      otras.push(c);
    }
  }
  return { capas: CAPAS_ID.filter((c) => capas.includes(c)), otras };
}

export interface ComparacionCapas {
  /** Las dos las tienen encendidas. */
  compartidas: CapaConcienciaId[];
  /** Solo yo las anuncio. */
  soloMias: CapaConcienciaId[];
  /** Solo la otra neurona las anuncia. */
  soloSuyas: CapaConcienciaId[];
  /** La otra neurona no anuncia ninguna capa (app anterior o capas apagadas): no se puede saber. */
  sinAnuncio: boolean;
}

export function compararCapas(mias: readonly string[], suyas: readonly string[]): ComparacionCapas {
  const a = separarCapacidades(mias).capas;
  const b = separarCapacidades(suyas).capas;
  return {
    compartidas: a.filter((c) => b.includes(c)),
    soloMias: a.filter((c) => !b.includes(c)),
    soloSuyas: b.filter((c) => !a.includes(c)),
    sinAnuncio: b.length === 0,
  };
}

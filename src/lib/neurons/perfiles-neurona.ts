/*
 * perfiles-neurona — personalización inteligente de cada neurona (NEU1126C · 2026-11-26).
 * Propone un perfil según lo medido del aparato (tipo, sistema, medio, batería, memoria, disco, si está
 * siempre encendido). Módulo PURO: no lee disco ni red. Reglas permanentes:
 *   · NUNCA se aplica solo: la persona elige «Aplicar», «Ajustar» o «Ahora no», y puede deshacer.
 *   · NUNCA toca permisos de control, terminal o administración (`NeuronPermissions`, `screenVoice`,
 *     `fileRequests`): esos los enciende solo la persona dueña en su aparato. Solo se mueven las claves de
 *     `CLAVES_PERFIL`; cualquier otra se descarta (`cambiosSeguros`).
 *   · Una preferencia ya guardada por la persona no se pisa (`sinPisar`).
 */

import type { Neuron, NeuronRole, NeuronSettings } from "./neurons";

/** Cuándo la neurona hace de relé para la malla. */
export type ReleCuando = "siempre" | "cargando" | "cargando-wifi" | "nunca";

/** Las ÚNICAS claves que un perfil puede proponer. Ningún permiso de control, terminal o administración. */
export const CLAVES_PERFIL = [
  "role", "offerCompute", "offerStorage", "offerPublicInternet", "auroraListening", "syncBrains", "releCuando",
] as const;
export type ClavePerfil = (typeof CLAVES_PERFIL)[number];

export interface CambiosPerfil {
  role?: NeuronRole;
  offerCompute?: boolean;
  offerStorage?: boolean;
  offerPublicInternet?: boolean;
  auroraListening?: boolean;
  syncBrains?: boolean;
  releCuando?: ReleCuando;
}

export type TipoAparato = "telefono" | "tableta" | "portatil" | "escritorio" | "servidor";
export type MedioPerfil = "web" | "pwa" | "escritorio" | "android" | "ios";

/** Lo medido del aparato que usa el cálculo. Todo opcional: sin dato, se propone con prudencia. */
export interface EntradaAparato {
  tipo?: Neuron["kind"];
  so?: string;
  medio?: MedioPerfil;
  bateria?: { nivel?: number; cargando?: boolean };
  memoriaGb?: number;
  discoGb?: number;
  siempreEncendido?: boolean;
}

export interface PropuestaPerfil {
  id: "ahorro-bateria" | "estacion-casa" | "trabajo" | "servidor";
  titulo: string;
  tipo: TipoAparato;
  /** Por qué se propone, en frases cortas. */
  porque: string[];
  cambios: CambiosPerfil;
}

const MOVILES = new Set(["android", "ios", "ipados"]);
/** Un navegador común se cierra con la pestaña: no puede ser relé fiable. */
const MEDIOS_PERSISTENTES = new Set<MedioPerfil>(["pwa", "escritorio", "android", "ios"]);
const MEMORIA_MINIMA_COMPUTO_GB = 4;
const DISCO_MINIMO_ALMACEN_GB = 20;

function soNormal(so: string | undefined): string {
  return (so ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

/** Tipo de aparato según lo medido. Pura. */
export function tipoDeAparato(e: EntradaAparato): TipoAparato {
  if (e.tipo === "server") return "servidor";
  if (e.tipo === "tablet") return "tableta";
  if (e.tipo === "mobile" || MOVILES.has(soNormal(e.so))) return "telefono";
  if (e.tipo === "laptop" || e.bateria?.nivel !== undefined) return "portatil";
  if (e.siempreEncendido === true && !e.bateria) return "servidor";
  return "escritorio";
}

function conMedio(e: EntradaAparato, cuando: ReleCuando, porque: string[]): ReleCuando | undefined {
  if (e.medio && !MEDIOS_PERSISTENTES.has(e.medio)) {
    porque.push("Se abre en un navegador y se cierra con la pestaña: no se propone como relé. Con la app o la PWA sí.");
    return undefined;
  }
  return cuando;
}

/** Perfil propuesto para un aparato. Pura; nunca devuelve permisos. */
export function proponerPerfil(e: EntradaAparato): PropuestaPerfil {
  const tipo = tipoDeAparato(e);
  const porque: string[] = [];
  const pocoDisco = e.discoGb !== undefined && e.discoGb < DISCO_MINIMO_ALMACEN_GB;
  const pocaMemoria = e.memoriaGb !== undefined && e.memoriaGb < MEMORIA_MINIMA_COMPUTO_GB;
  if (pocoDisco) porque.push(`Queda poco disco (${e.discoGb} GB): no se ofrece almacén.`);
  if (pocaMemoria) porque.push(`Tiene poca memoria (${e.memoriaGb} GB): no se ofrece cómputo.`);

  if (tipo === "telefono") {
    porque.unshift("Es un teléfono con batería: se prioriza ahorrar.", "Hace de relé solo cargando y con Wi‑Fi.");
    const rele = conMedio(e, "cargando-wifi", porque);
    return {
      id: "ahorro-bateria", titulo: "Ahorro de batería", tipo, porque,
      cambios: { role: "cerebro", offerCompute: false, offerStorage: false, offerPublicInternet: false, auroraListening: false, ...(rele ? { releCuando: rele } : {}) },
    };
  }
  if (tipo === "tableta") {
    porque.unshift("Es una tableta: suele quedarse en casa, enchufada y a mano.", "Sirve de estación de la casa con la escucha de Aurora encendida.");
    const rele = conMedio(e, "cargando", porque);
    return {
      id: "estacion-casa", titulo: "Estación de la casa", tipo, porque,
      cambios: { role: "ambos", offerCompute: false, offerStorage: false, offerPublicInternet: false, auroraListening: true, syncBrains: true, ...(rele ? { releCuando: rele } : {}) },
    };
  }
  if (tipo === "servidor") {
    porque.unshift("Está siempre encendida: puede sostener la malla.", "Hace de relé siempre, guarda y respalda las memorias y ofrece cómputo.");
    const rele = conMedio(e, "siempre", porque);
    return {
      id: "servidor", titulo: "Servidor de la casa", tipo, porque,
      cambios: { role: "servidor", offerCompute: !pocaMemoria, offerStorage: !pocoDisco, syncBrains: true, auroraListening: false, ...(rele ? { releCuando: rele } : {}) },
    };
  }
  porque.unshift(tipo === "portatil" ? "Es un portátil: se usa para trabajar y se mueve." : "Es un equipo de mesa: se usa para trabajar.", "Hace de relé cuando está enchufado.");
  const rele = conMedio(e, "cargando", porque);
  return {
    id: "trabajo", titulo: "Trabajo", tipo, porque,
    cambios: { role: "cerebro", offerCompute: !pocaMemoria, offerStorage: false, offerPublicInternet: false, auroraListening: true, ...(rele ? { releCuando: rele } : {}) },
  };
}

/** Descarta toda clave fuera de `CLAVES_PERFIL` (red de seguridad: ningún permiso se cuela). Pura. */
export function cambiosSeguros(cambios: Record<string, unknown>): CambiosPerfil {
  const fuera: Record<string, unknown> = {};
  for (const k of CLAVES_PERFIL) if (cambios[k] !== undefined) fuera[k] = cambios[k];
  return fuera as CambiosPerfil;
}

/** Quita lo que la persona ya guardó: sus preferencias mandan sobre la propuesta. Pura. */
export function sinPisar(cambios: CambiosPerfil, guardadas: Partial<Record<string, unknown>>): CambiosPerfil {
  const sal: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cambiosSeguros({ ...cambios }))) if (guardadas[k] === undefined) sal[k] = v;
  return sal as CambiosPerfil;
}

/** Valores previos de las claves que se van a cambiar: lo que hace falta para deshacer. Pura. */
export function previoDe(cambios: CambiosPerfil, guardadas: Partial<Record<string, unknown>>): Record<string, unknown> {
  const previo: Record<string, unknown> = {};
  for (const k of Object.keys(cambios)) previo[k] = guardadas[k] ?? null;
  return previo;
}

/** Lo guardado en bruto (sin valores por defecto) para una neurona, leído del JSON de preferencias. Pura. */
export function guardadasDe(json: string | null, id: string): Partial<Record<string, unknown>> {
  try {
    const p = JSON.parse(json ?? "null") as { settings?: Record<string, unknown> } | null;
    const s = p?.settings?.[id];
    return s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  } catch { return {}; }
}

/** Entrada del cálculo a partir de una neurona. Pura. */
export function entradaDeNeurona(n: Neuron, siempreEncendido?: boolean): EntradaAparato {
  const c = n.capabilities;
  return {
    tipo: n.kind,
    so: c.aparato?.so ?? c.platform,
    medio: c.aparato?.medio,
    bateria: c.battery ? { nivel: c.battery.level, cargando: c.battery.charging } : undefined,
    memoriaGb: c.memoryGb,
    discoGb: c.storageQuotaGb,
    siempreEncendido,
  };
}

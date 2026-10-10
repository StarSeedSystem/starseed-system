/**
 * Manifiesto único de versión — actualizaciones por capas y por nivel de Genesis (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/actualizaciones-por-capas-y-niveles.md §1-§3. SOP de lo construido:
 * architecture/actualizaciones-por-capas-sop.md.
 *
 * Cada versión que se publica (del OS entero, de los sistemas de una entidad o de los de una
 * cuenta) se describe con UN manifiesto: qué sistema, qué nivel la publica, qué CAPAS toca y qué
 * hace falta en cada aparato para aplicarla. Un nivel nunca publica fuera de su alcance:
 *   · MetaGenesis (`meta`) puede tocar todas las capas, incluida la app nativa;
 *   · PoliGenesis (`poli`) y Genesis (`genesis`) solo `datos` e `interfaz` declarativa: jamás el
 *     núcleo (service worker, servicios, modelos ni binarios). Lo mismo que los invariantes de
 *     `src/lib/nucleo/invariantes.ts`: editable sí, ejecutable no.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { compararVersiones as compararOs } from "@/lib/version/os-release";

export type NivelGenesis = "meta" | "poli" | "genesis";
export type CapaActualizacion = "datos" | "interfaz" | "sw" | "servicios" | "modelos" | "nativa";
export type RamaVersion = "estable" | "beta" | "propia";

/** Orden de aplicación: de lo más barato y reversible a lo más pesado. */
export const CAPAS_ORDEN: readonly CapaActualizacion[] = ["datos", "interfaz", "sw", "servicios", "modelos", "nativa"];
export const NIVELES: readonly NivelGenesis[] = ["meta", "poli", "genesis"];
export const RAMAS: readonly RamaVersion[] = ["estable", "beta", "propia"];

export const NOMBRE_NIVEL: Record<NivelGenesis, string> = {
  meta: "MetaGenesis",
  poli: "PoliGenesis",
  genesis: "Genesis",
};

export const NOMBRE_CAPA: Record<CapaActualizacion, string> = {
  datos: "Datos",
  interfaz: "Interfaz",
  sw: "Sin conexión",
  servicios: "Servicios",
  modelos: "Modelos",
  nativa: "App nativa",
};

/** Qué es cada capa, en una frase para quien no sabe de infraestructura. */
export const QUE_ES_CAPA: Record<CapaActualizacion, string> = {
  datos: "Ajustes, interfaz declarativa, plantillas y widgets: se cambian sin recargar nada.",
  interfaz: "El código de la web (pantallas y estilos): pide recargar la página.",
  sw: "La copia que permite abrir el OS sin conexión (service worker).",
  servicios: "Programas que corren en la neurona: Astraura, voz, BitNet…",
  modelos: "Capas de inteligencia de Astraura (Needle, Bonsai, BitNet), verificadas por su huella.",
  nativa: "El programa instalado (Mac, Windows, Linux, Android): lo único que pide reinstalar.",
};

const SOLO_DECLARATIVO: ReadonlySet<CapaActualizacion> = new Set(["datos", "interfaz"]);

/** ¿Puede este nivel publicar esta capa? Meta: todas. Poli y Genesis: solo datos e interfaz. */
export function capaPermitidaParaNivel(nivel: NivelGenesis, capa: CapaActualizacion): boolean {
  if (nivel === "meta") return CAPAS_ORDEN.includes(capa);
  return SOLO_DECLARATIVO.has(capa);
}

/** Compara versiones AAAA.MM.DD[.n] o semver por segmentos numéricos. -1, 0 o 1. Nunca lanza. */
export function compararVersiones(a: string, b: string): -1 | 0 | 1 {
  const r = compararOs(String(a ?? ""), String(b ?? ""));
  return r > 0 ? 1 : r < 0 ? -1 : 0;
}

export interface RequisitosVersion {
  /** Servicios de la neurona que hay que reiniciar (etiquetas `com.starseed.*` sin prefijo). */
  reinicio: string[];
  recarga: boolean;
  reinstalar: boolean;
}

export interface AprobacionVersion {
  /** Cómo se aprobó: un dueño, un rol de gestión, una votación o la propia persona. */
  via: "dueno" | "gestion" | "votacion" | "persona" | "urgencia";
  propuestaId?: string;
  aFavor?: number;
  enContra?: number;
}

export interface ManifiestoVersion {
  sistema: string;
  nivel: NivelGenesis;
  /** Cuenta o entidad dueña del sistema (para MetaGenesis, "starseed-os"). */
  duenoId: string;
  version: string;
  rama: RamaVersion;
  capas: CapaActualizacion[];
  requiere: RequisitosVersion;
  tamanoBytes: number;
  sha256: string;
  notas: string;
  publicadoEn: string;
  /** Versión a la que se vuelve si la prueba de humo falla (se guarda siempre la anterior). */
  anterior?: string;
  aprobacion?: AprobacionVersion;
}

export type Validacion<T> = { ok: true; valor: T } | { ok: false; errores: string[] };

const SHA = /^[0-9a-f]{64}$/;
const VERSION = /^v?\d+(\.\d+){0,3}([-+][0-9A-Za-z.-]+)?$/;

const texto = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

/** Valida un manifiesto que llega de fuera (red, malla, archivo). Devuelve TODOS los errores. */
export function validarManifiesto(x: unknown): Validacion<ManifiestoVersion> {
  const e: string[] = [];
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, errores: ["El manifiesto no es un objeto."] };
  const m = x as Record<string, unknown>;
  if (!texto(m.sistema)) e.push("Falta el sistema.");
  const nivel = m.nivel as NivelGenesis;
  if (!NIVELES.includes(nivel)) e.push("Nivel desconocido: debe ser meta, poli o genesis.");
  if (!texto(m.duenoId)) e.push("Falta el dueño (cuenta o entidad).");
  if (!texto(m.version) || !VERSION.test(String(m.version).trim())) e.push("Versión no válida (AAAA.MM.DD o x.y.z).");
  if (!RAMAS.includes(m.rama as RamaVersion)) e.push("Rama desconocida: estable, beta o propia.");
  const capas = Array.isArray(m.capas) ? (m.capas as unknown[]) : null;
  if (!capas || capas.length === 0) e.push("Una versión toca al menos una capa.");
  else {
    if (new Set(capas).size !== capas.length) e.push("Hay capas repetidas.");
    for (const c of capas) {
      if (!CAPAS_ORDEN.includes(c as CapaActualizacion)) e.push(`Capa desconocida: ${String(c)}.`);
      else if (NIVELES.includes(nivel) && !capaPermitidaParaNivel(nivel, c as CapaActualizacion))
        e.push(`${NOMBRE_NIVEL[nivel]} no puede publicar la capa «${NOMBRE_CAPA[c as CapaActualizacion]}».`);
    }
  }
  const req = m.requiere as Record<string, unknown> | undefined;
  if (!req || typeof req !== "object") e.push("Faltan los requisitos (reinicio, recarga, reinstalar).");
  else {
    if (!Array.isArray(req.reinicio) || !req.reinicio.every(texto)) e.push("«reinicio» debe ser una lista de servicios.");
    if (typeof req.recarga !== "boolean") e.push("«recarga» debe ser sí o no.");
    if (typeof req.reinstalar !== "boolean") e.push("«reinstalar» debe ser sí o no.");
    else if (req.reinstalar && !(capas ?? []).includes("nativa")) e.push("Solo la capa nativa pide reinstalar.");
    if (Array.isArray(req.reinicio) && req.reinicio.length > 0 && !(capas ?? []).includes("servicios"))
      e.push("Reiniciar servicios exige la capa «Servicios».");
  }
  if (!Number.isInteger(m.tamanoBytes) || (m.tamanoBytes as number) < 0) e.push("Tamaño en bytes no válido.");
  if (typeof m.sha256 !== "string" || !SHA.test(m.sha256)) e.push("Huella sha256 no válida (64 hex en minúscula).");
  if (typeof m.notas !== "string") e.push("Las notas deben ser texto.");
  if (!texto(m.publicadoEn) || Number.isNaN(Date.parse(String(m.publicadoEn)))) e.push("Fecha de publicación no válida.");
  if (m.anterior !== undefined && (!texto(m.anterior) || !VERSION.test(String(m.anterior)))) e.push("Versión anterior no válida.");
  if (e.length) return { ok: false, errores: e };
  return { ok: true, valor: x as ManifiestoVersion };
}

/** Las capas de un manifiesto, en el orden de aplicación. */
export function capasEnOrden(capas: readonly CapaActualizacion[]): CapaActualizacion[] {
  return CAPAS_ORDEN.filter((c) => capas.includes(c));
}

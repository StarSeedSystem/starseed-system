/**
 * genesis-logic.ts — lógica PURA de la sección Génesis de Seres.
 * ----------------------------------------------------------------------------
 * Todo lo que aquí vive es determinista y no toca red ni DOM: recibe datos ya
 * cargados y decide qué significan (¿está degradada la respuesta? ¿qué le
 * pasa a un cambio fuera de dominio? ¿qué ADN le corresponde a un ser sin
 * `adn` guardado todavía?). Se separa de los componentes `.tsx` exactamente
 * por eso: para poder probarla sin montar React ni simular un backend.
 */

import { derivarAdn, type RasgosAdn, type SemillaSer } from "@/lib/astraura/genesis-dna";
import type {
  Comunidad,
  EnrutadoCognitivo,
  ModeloDisponible,
  NodoLinaje,
  Propuesta,
  Ser,
  Soberania,
  SolicitudGenesis,
} from "@/lib/astraura/genesis-types";

/* ════════════════════════════════ ADN ═══════════════════════════════════
 * `Ser.adn` puede faltar (backend viejo, ser recién listado sin recalcular
 * todavía). `genesis-dna.ts` existe precisamente para que la interfaz lo
 * derive igual que lo haría el backend — determinista, sin red — así que un
 * ser SIEMPRE tiene un cuerpo que enseñar, nunca un hueco.
 * `adnAjustes` son ajustes que el usuario hizo ENCIMA del ADN derivado (ver
 * el comentario de `Ser.adnAjustes` en genesis-types.ts): hay que
 * superponerlos, no ignorarlos.
 * ════════════════════════════════════════════════════════════════════════ */

export interface SerAdnInput {
  id: string;
  nombre: string;
  color?: string | null;
  adn?: RasgosAdn | null;
  adnAjustes?: Partial<RasgosAdn> | null;
  generacion?: number;
  experiencia?: number;
}

/** El ADN efectivo de un ser: el guardado o el derivado, con sus ajustes encima. */
export function adnDeSer(s: SerAdnInput): RasgosAdn {
  const semilla: SemillaSer = { id: s.id, nombre: s.nombre, colorPersonalidad: s.color ?? null, generacion: s.generacion, experiencia: s.experiencia };
  const base = s.adn ?? derivarAdn(semilla);
  return s.adnAjustes ? { ...base, ...s.adnAjustes } : base;
}

/** Fases legibles de `adn.evolucion` (0–1) para acompañar el cuerpo con palabras. */
export function nivelEvolutivoLabel(evolucion: number): string {
  const v = Number.isFinite(evolucion) ? evolucion : 0;
  if (v < 0.15) return "semilla";
  if (v < 0.4) return "brote";
  if (v < 0.7) return "floreciendo";
  if (v < 0.9) return "arraigado";
  return "plenitud";
}

/* ═══════════════════════════════ Estado ═══════════════════════════════ */

export function estadoSerLabel(estado: Ser["estado"]): string {
  if (estado === "activo") return "Activo";
  if (estado === "durmiendo") return "Durmiendo";
  return "Suspendido";
}

/** Tono Crystal Liquid Glass propio (el `levelTone` genérico no conoce este vocabulario en español). */
export function estadoSerTone(estado: Ser["estado"]): string {
  if (estado === "activo") return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  if (estado === "durmiendo") return "border-indigo-400/35 bg-indigo-500/10 text-indigo-100";
  return "border-white/15 bg-white/[0.04] text-white/60"; // suspendido
}

/* ═══════════════════════════ Enrutado cognitivo ═══════════════════════════
 * Requisito no negociable (adenda de este proyecto): nunca disfrazar una
 * plantilla de pensamiento real. `describirEnrutado` es el único lugar que
 * decide el texto que ve Alex, para que ningún componente pueda "olvidar"
 * mostrar la degradación.
 * ════════════════════════════════════════════════════════════════════════ */

export interface ModeloEscaleraInfo {
  /** Modelo que respondió la última vez (o `null` si el ser nunca ha pensado todavía). */
  ultimoUsado: string | null;
  /** Su posición en la escalera actual (0 = el más barato), o `null` si no está en ella. */
  posicionEnEscalera: number | null;
  /** La última respuesta salió de plantilla, no de un modelo pensando de verdad. */
  degradada: boolean;
  /** Próximo peldaño a intentar si el actual falla (o si nunca se ha usado ninguno). */
  siguienteSiFalla: string | null;
  /** Frase honesta lista para pintar. */
  resumen: string;
}

export function describirEnrutado(enrutado: EnrutadoCognitivo): ModeloEscaleraInfo {
  const escalera = Array.isArray(enrutado.escalera) ? enrutado.escalera : [];
  const ultimoUsado = enrutado.ultimoUsado ?? null;
  const idx = ultimoUsado ? escalera.indexOf(ultimoUsado) : -1;
  const posicionEnEscalera = idx >= 0 ? idx : null;
  const degradada = enrutado.ultimaFueDegradada === true;
  const siguienteSiFalla =
    posicionEnEscalera !== null
      ? (escalera[posicionEnEscalera + 1] ?? null)
      : (escalera[0] ?? null);
  const resumen = degradada
    ? "Sin modelo real: la última respuesta salió de una plantilla, no de un modelo pensando."
    : ultimoUsado
      ? `Pensando con ${ultimoUsado}.`
      : "Todavía no ha pensado con ningún modelo.";
  return { ultimoUsado, posicionEnEscalera, degradada, siguienteSiFalla, resumen };
}

/** Un peldaño de la escalera, cruzado con lo que el catálogo sabe de ese modelo (coste, verificación…). */
export interface PeldanoEscalera {
  id: string;
  posicion: number;
  esUltimoUsado: boolean;
  /** Ficha del catálogo si el backend la conoce; `null` si el id ya no está en `/api/genesis/modelos`. */
  catalogo: ModeloDisponible | null;
}

/** Cruza la escalera del ser con el catálogo de modelos disponibles, en orden. */
export function escaleraConCatalogo(enrutado: EnrutadoCognitivo, catalogo: ModeloDisponible[]): PeldanoEscalera[] {
  const escalera = Array.isArray(enrutado.escalera) ? enrutado.escalera : [];
  const porId = new Map(catalogo.map((m) => [m.id, m] as const));
  return escalera.map((id, posicion) => ({
    id,
    posicion,
    esUltimoUsado: enrutado.ultimoUsado === id,
    catalogo: porId.get(id) ?? null,
  }));
}

export function costeLabel(costePorMillon: number | null | undefined): string {
  const v = Number(costePorMillon ?? 0);
  return v <= 0 ? "gratuito" : `${v.toFixed(2)} / millón tokens`;
}

export function fmtLatencia(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/* ═══════════════════════════════ Soberanía ═══════════════════════════════
 * "Un permiso que se concede sin entenderlo es un permiso mal concedido."
 * `describirSoberania` traduce las cuatro listas + dos interruptores del
 * contrato a las TRES zonas que Alex definió: dominio (escribe libre),
 * exploración (solo lee) y todo lo demás (propuesta en rama variante, o
 * bloqueado si `puedeProponerFuera` es false).
 * ════════════════════════════════════════════════════════════════════════ */

export interface SoberaniaResumen {
  totalDominio: number;
  totalExploracion: number;
  totalMedios: number;
  totalCerebros: number;
  tieneLimites: boolean;
  /** Frase honesta de qué pasa con un cambio que cae fuera de dominio y exploración. */
  fueraDeZona: string;
  /** Nombre de rama que vería Alex si el ser propusiera algo ahora mismo. */
  ramaEjemplo: string;
}

export function describirSoberania(s: Soberania): SoberaniaResumen {
  const prefijo = (s.prefijoRamaVariante || "variante/").trim() || "variante/";
  return {
    totalDominio: s.dominio.length,
    totalExploracion: s.exploracion.length,
    totalMedios: s.medios.length,
    totalCerebros: s.cerebros.length,
    tieneLimites: s.limitesDuros.length > 0,
    fueraDeZona: s.puedeProponerFuera
      ? `Fuera de su dominio, cualquier cambio nace como PROPUESTA en una rama "${prefijo}…" y espera tu sí — nunca se aplica solo.`
      : "Fuera de su dominio no puede ni siquiera proponer: se detiene ahí, sin tocar nada y sin avisarte de una idea.",
    ramaEjemplo: `${prefijo}${slugSuave(s.dominio[0] ?? "cambio")}`,
  };
}

/**
 * Slug simple y determinista (minúsculas, guiones, sin acentos, sin
 * librerías). Se usa para el ejemplo de rama de soberanía Y para la carpeta
 * propuesta del ritual de creación (`ritual-creacion.tsx`) — exportada para
 * que ese segundo uso no reimplemente (y potencialmente desincronice) la
 * misma normalización.
 */
export function slugSuave(texto: string, fallback = "cambio"): string {
  // NFD separa "ñ"/"é" en letra + marca combinante (U+0300–U+036F); quitar esa franja
  // por escape Unicode es más fiable que pegar los caracteres combinantes literales.
  const sinAcentos = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const slug = sinAcentos.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

/* ══════════════════════════ Listas de texto (formularios) ══════════════════════════ */

/** Una línea por elemento; recorta vacíos. Para dominio/exploración/medios/cerebros/límites/habilidades/… */
export function parseLineList(texto: string): string[] {
  return texto.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function joinLineList(items: readonly string[] | null | undefined): string {
  return (items ?? []).join("\n");
}

/* ═══════════════════════════════ Propuestas ═══════════════════════════════ */

export interface PropuestaResumenCambios {
  archivos: number;
  lineasTotales: number;
  conDiff: number;
}

export function resumirCambiosPropuesta(p: Propuesta): PropuestaResumenCambios {
  const cambios = Array.isArray(p.cambios) ? p.cambios : [];
  return {
    archivos: cambios.length,
    lineasTotales: cambios.reduce((acc, c) => acc + (typeof c.lineas === "number" && Number.isFinite(c.lineas) ? c.lineas : 0), 0),
    conDiff: cambios.filter((c) => !!c.diff).length,
  };
}

export function propuestasPendientes(propuestas: readonly Propuesta[]): Propuesta[] {
  return propuestas.filter((p) => p.estado === "pendiente");
}

/* ══════════════════════════════ Ritual de creación ══════════════════════════════ */

/** `null` = válida. Nunca lanza; el formulario decide qué hacer con el mensaje. */
export function validarSolicitudGenesis(s: SolicitudGenesis): string | null {
  const nombre = s.nombre?.trim() ?? "";
  if (!nombre) return "El nombre es obligatorio: sin nombre no hay a quién invocar.";
  if (nombre.length > 80) return "El nombre es demasiado largo (máximo 80 caracteres).";
  if (s.color && !/^#?[0-9a-fA-F]{6}$/.test(s.color.trim())) return "El color debe ser un hexadecimal de 6 dígitos (p. ej. #7dd3fc).";
  return null;
}

/* ═══════════════════════════ Nombres por id (comunidades, espacios, linaje) ═══════════════════════════ */

export function nombrePorId<T extends { id: string; nombre: string }>(id: string, items: readonly T[]): string {
  return items.find((i) => i.id === id)?.nombre ?? id;
}

export function nombreEnLinaje(id: string | null | undefined, nodos: readonly NodoLinaje[]): string | null {
  if (!id) return null;
  return nodos.find((n) => n.id === id)?.nombre ?? id;
}

/** Miembros de una comunidad, resueltos a nombre cuando el listado de seres los conoce. */
export function nombresDeComunidad(c: Comunidad, seresPorId: ReadonlyMap<string, string>): string[] {
  return c.miembros.map((id) => seresPorId.get(id) ?? id);
}

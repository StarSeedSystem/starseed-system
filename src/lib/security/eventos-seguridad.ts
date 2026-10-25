/**
 * INF1025A · Eventos de seguridad saneados hacia el orquestador de respuesta
 * (Tracecat, Ola 1025R · architecture/repos-libreria-1025.md §6.2). Módulo PURO:
 * sin red, disco ni reloj (`ahoraMs` entra por parámetro); lista blanca y falla
 * cerrado. El `id` es determinista para deduplicar en Tracecat y NO es un secreto.
 */

export type TipoEventoSeguridad =
  | "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe"
  | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";

export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";

export interface PropuestaRespuesta { acciones: string[]; requiereHumano: boolean; motivo: string; }

export interface EventoSeguridad {
  version: 1; id: string; tipo: TipoEventoSeguridad;
  /** `cuando` es ISO, calculado desde el parámetro `ahoraMs`. */
  severidad: SeveridadEvento; elemento: ElementoRed; cuando: string;
  contador: number; resumen: string;
  detalle: Record<string, string | number | boolean>;
}

export const ORDEN_SEVERIDAD: readonly SeveridadEvento[] = ["baja", "media", "alta", "critica"];
const ELEMENTOS: readonly ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];

const TABLA: Record<TipoEventoSeguridad, { resumen: string; claves: readonly string[]; acciones: string[] }> = {
  "secreto-detectado": { resumen: "Se detectó un posible secreto en el contenido.", claves: ["familia", "campo"], acciones: ["abrir un caso", "rotar la clave: la rota su dueña"] },
  "limite-peticiones": { resumen: "Una ruta alcanzó su límite de peticiones.", claves: ["ruta", "limite", "ventanaMs"], acciones: ["revisar la ruta señalada", "comprobar si hay una tarea en bucle"] },
  "ssrf-bloqueado": { resumen: "Se detuvo una petición hacia un destino no permitido.", claves: ["motivo"], acciones: ["abrir un caso", "revisar el destino con quien la lanzó"] },
  "csp-informe": { resumen: "Llegó un informe de violación de la política de contenido.", claves: ["directiva", "efectiva"], acciones: ["revisar la política", "comprobar qué recurso la violó"] },
  "repeticion-rechazada": { resumen: "Se rechazó una repetición del feed firmado.", claves: ["causa", "ventanaMs"], acciones: ["revisar el emisor del feed firmado"] },
  "invariante-violada": { resumen: "Se violó una invariante del núcleo.", claves: ["invariante"], acciones: ["abrir un caso", "revisar el diseño implicado"] },
  "hallazgo-strix": { resumen: "La auditoría reportó un hallazgo.", claves: ["familia", "campo"], acciones: ["abrir un caso", "asignar la revisión a quien custodia el elemento"] },
  "acceso-inusual": { resumen: "Se observó un patrón de acceso inusual.", claves: ["medio", "intentos"], acciones: ["revisar el patrón observado", "avisar a la persona dueña del elemento"] },
};

const TIPOS: readonly TipoEventoSeguridad[] = Object.keys(TABLA) as TipoEventoSeguridad[];

/** Severidad inglesa del escáner (`scanner.ts`, "use client") → vocabulario del evento; desconocida ⇒ null. */
export function desdeSeveridadScanner(s: string): SeveridadEvento | null {
  const mapa: Record<string, SeveridadEvento> = { critical: "critica", high: "alta", medium: "media", low: "baja" };
  return mapa[s] ?? null;
}
/** ¿Parece dato personal o clave? Lo que cumpla esto se DESCARTA, no se enmascara. */
export function pareceDatoPersonal(texto: string): boolean {
  if (typeof texto !== "string") return true;
  const t = texto.trim();
  if (!t) return true;
  return /^(sk-|ghp_|gho_|ghs_|ghr_|AKIA|eyJ)/i.test(t)
    || /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)
    || /\b\d{1,3}(\.\d{1,3}){3}\b/.test(t)
    || /[0-9A-Fa-f]{1,4}:[0-9A-Fa-f:.]{2,40}/.test(t)
    || /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(t)
    || /^[0-9a-fA-F]{24,}$/.test(t)
    || /^[A-Za-z0-9+/=_-]{24,}$/.test(t);
}

function hashNoCriptografico(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function esDe<T extends string>(lista: readonly T[], valor: unknown): T | null {
  return typeof valor === "string" && lista.includes(valor as T) ? (valor as T) : null;
}
/** SOLO claves de la lista blanca del tipo; valores booleanos, números finitos o cadenas ≤ 80 sin pinta de dato personal. */
function saneaDetalle(entrada: unknown, permitidas: readonly string[]): Record<string, string | number | boolean> {
  const detalle: Record<string, string | number | boolean> = {};
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return detalle;
  const crudo = entrada as Record<string, unknown>;
  for (const clave of permitidas) {
    const valor = crudo[clave];
    if (typeof valor === "boolean") detalle[clave] = valor;
    else if (typeof valor === "number" && Number.isFinite(valor)) detalle[clave] = valor;
    else if (typeof valor === "string" && valor.trim()) {
      const corto = valor.trim().slice(0, 80);
      if (!pareceDatoPersonal(corto)) detalle[clave] = corto;
    }
  }
  return detalle;
}

/** Construye el evento o devuelve `null` (falla cerrado). El `id` agrupa tipo, elemento, cubo de 60 s y claves del detalle. */
export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) return null;
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const crudo = entrada as Record<string, unknown>;
  const tipo = esDe(TIPOS, crudo.tipo);
  const severidad = esDe(ORDEN_SEVERIDAD, crudo.severidad);
  const elemento = esDe(ELEMENTOS, crudo.elemento);
  if (!tipo || !severidad || !elemento) return null;
  const contador = typeof crudo.contador === "number" && Number.isFinite(crudo.contador) && crudo.contador >= 1 ? Math.floor(crudo.contador) : 1;
  const detalle = saneaDetalle(crudo.detalle, TABLA[tipo].claves);
  const cubo = Math.floor(ahoraMs / 60000);
  const claves = Object.keys(detalle).sort().join(",");
  const cuando = new Date(ahoraMs).toISOString();
  const id = `evs-${hashNoCriptografico(`${tipo}|${elemento}|${cubo}|${claves}`)}`;
  return { version: 1, id, tipo, severidad, elemento, cuando, contador, resumen: TABLA[tipo].resumen, detalle };
}
/** Propuestas para una persona que decide; nunca bloqueos ni sanciones automáticas (justicia restaurativa, CLAUDE.md §6). */
export function proponerRespuesta(e: EventoSeguridad): PropuestaRespuesta {
  const acciones = [...TABLA[e.tipo].acciones];
  const afectaPersonas = e.elemento === "cuenta" || e.elemento === "grupo" || e.elemento === "pagina";
  if (afectaPersonas) {
    acciones.push("abrir un caso con la persona implicada");
    return { acciones, requiereHumano: true, motivo: "Se remite a un Círculo de Paz para decidir juntos." };
  }
  return { acciones, requiereHumano: false, motivo: "Decide quien custodia el elemento, sin efecto sobre personas." };
}

/** ¿La política deja pasar el evento? Umbral de severidad y, si hay, tipos permitidos. */
export function politicaPermite(e: EventoSeguridad, politica: { severidadMinima: SeveridadEvento; tipos?: TipoEventoSeguridad[] }): boolean {
  if (ORDEN_SEVERIDAD.indexOf(e.severidad) < ORDEN_SEVERIDAD.indexOf(politica.severidadMinima)) return false;
  if (politica.tipos && !politica.tipos.includes(e.tipo)) return false;
  return true;
}

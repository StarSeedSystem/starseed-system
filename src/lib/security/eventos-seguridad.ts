/**
 * Eventos de seguridad saneados para un orquestador de respuesta (Tracecat).
 * Módulo PURO: sin red, disco ni reloj; `ahoraMs` entra por parámetro.
 * El `id` es un hash no criptográfico de deduplicación: NO es un secreto.
 */
export type TipoEventoSeguridad =
  | "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe"
  | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";

export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";
export type ValorDetalle = string | number | boolean;

export interface EventoSeguridad {
  version: 1;
  id: string;
  tipo: TipoEventoSeguridad;
  severidad: SeveridadEvento;
  elemento: ElementoRed;
  cuando: string;
  contador: number;
  resumen: string;
  detalle: Record<string, ValorDetalle>;
}

export interface PoliticaRespuesta {
  severidadMinima: SeveridadEvento;
  tipos?: TipoEventoSeguridad[];
}
export const ORDEN_SEVERIDAD: readonly SeveridadEvento[] = ["critica", "alta", "media", "baja"];
const RANGO: Record<SeveridadEvento, number> = { critica: 3, alta: 2, media: 1, baja: 0 };
const TIPOS: readonly TipoEventoSeguridad[] = ["secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe", "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual"];
const ELEMENTOS: readonly ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];

const FICHAS: Record<TipoEventoSeguridad, { resumen: string; claves: readonly string[]; acciones: readonly string[] }> = {
  "secreto-detectado": { resumen: "Se detectó un posible secreto; el valor no se incluye.", claves: ["familia", "campo"], acciones: ["revisar el hallazgo", "rotar la clave: la rota su dueña"] },
  "limite-peticiones": { resumen: "Se alcanzó el límite de peticiones de una ruta.", claves: ["ruta", "limite", "ventanaMs"], acciones: ["revisar la ruta afectada", "ajustar el límite con una persona responsable"] },
  "ssrf-bloqueado": { resumen: "Se rechazó una petición a un destino no permitido.", claves: ["esquema", "clase"], acciones: ["revisar el destino rechazado"] },
  "csp-informe": { resumen: "Se recibió un informe de política de seguridad de contenido.", claves: ["directiva", "linea"], acciones: ["revisar la política de contenido"] },
  "repeticion-rechazada": { resumen: "Se rechazó un mensaje repetido del feed firmado.", claves: ["ventanaMs", "motivo"], acciones: ["revisar el feed firmado"] },
  "invariante-violada": { resumen: "Se detectó una posible violación de una invariante del núcleo.", claves: ["invariante", "ambito"], acciones: ["revisar la invariante afectada"] },
  "hallazgo-strix": { resumen: "Strix reportó un hallazgo de seguridad.", claves: ["categoria", "regla", "herramienta"], acciones: ["revisar el hallazgo reportado"] },
  "acceso-inusual": { resumen: "Se observó un acceso inusual.", claves: ["motivo", "metodo"], acciones: ["revisar el acceso con la persona implicada"] },
};

const RE_PII = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b\d{1,3}(?:\.\d{1,3}){3}\b|\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:[0-9a-fA-F]{0,4}\b|\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b|\b[0-9a-fA-F]{24,}\b|[A-Za-z0-9+/]{24,}={0,2}/;
const RE_PREFIJO = /^(?:sk-|ghp_|AKIA|eyJ)/;

const MAPA_SEVERIDAD: Record<string, SeveridadEvento> = { critical: "critica", high: "alta", medium: "media", low: "baja" };

export function desdeSeveridadScanner(s: string): SeveridadEvento {
  return MAPA_SEVERIDAD[s] ?? "alta";
}

export function pareceDatoPersonal(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && (RE_PII.test(t) || RE_PREFIJO.test(t));
}

function valorPermitido(v: unknown): v is ValorDetalle {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  return typeof v === "string" && v.length <= 80 && !pareceDatoPersonal(v);
}

function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function esDe<T extends string>(v: unknown, lista: readonly string[]): v is T {
  return typeof v === "string" && lista.includes(v);
}

export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (!Number.isFinite(ahoraMs) || Math.abs(ahoraMs) > 8.64e15) return null;
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const e = entrada as Record<string, unknown>;
  if (!esDe<TipoEventoSeguridad>(e.tipo, TIPOS) || !esDe<SeveridadEvento>(e.severidad, ORDEN_SEVERIDAD) || !esDe<ElementoRed>(e.elemento, ELEMENTOS)) return null;
  const { tipo, severidad, elemento } = e;
  const detalle: Record<string, ValorDetalle> = {};
  const crudo = e.detalle;
  if (crudo && typeof crudo === "object" && !Array.isArray(crudo)) {
    for (const clave of FICHAS[tipo].claves) {
      const valor = (crudo as Record<string, unknown>)[clave];
      if (valorPermitido(valor)) detalle[clave] = valor;
    }
  }
  const n = e.contador;
  const contador = typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  const claves = Object.keys(detalle).sort().join(",");
  return {
    version: 1,
    id: `evs-${hash(`${tipo}|${elemento}|${Math.floor(ahoraMs / 60_000)}|${claves}`)}`,
    tipo, severidad, elemento,
    cuando: new Date(ahoraMs).toISOString(),
    contador, resumen: FICHAS[tipo].resumen, detalle,
  };
}

export function proponerRespuesta(e: EventoSeguridad): { acciones: string[]; requiereHumano: boolean; motivo: string } {
  const personas = e.elemento === "cuenta" || e.elemento === "grupo" || e.elemento === "pagina";
  return {
    acciones: [...FICHAS[e.tipo].acciones, "abrir un caso"],
    requiereHumano: personas,
    motivo: personas
      ? "Afecta a personas: decide una persona y el caso se lleva a un Círculo de Paz."
      : "Solo propone revisión; ninguna acción automática sobre personas.",
  };
}

export function politicaPermite(e: EventoSeguridad, politica: PoliticaRespuesta): boolean {
  if (!e || !politica || !(e.severidad in RANGO) || !(politica.severidadMinima in RANGO)) return false;
  if (RANGO[e.severidad] < RANGO[politica.severidadMinima]) return false;
  return politica.tipos === undefined || (Array.isArray(politica.tipos) && politica.tipos.includes(e.tipo));
}

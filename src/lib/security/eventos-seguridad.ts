/**
 * eventos-seguridad.ts — Evento de seguridad SANEADO hacia la respuesta orquestada
 * (Tracecat · INF1025A · architecture/repos-libreria-1025.md §infra 2). Vocabulario
 * cerrado, lista blanca de claves, falla cerrado; el resumen sale de una plantilla fija
 * y todo dato con forma de correo, IP, JWT, hex/base64 largo o prefijo de clave se
 * DESCARTA (nunca se enmascara). Módulo PURO: sin red, disco ni reloj (el momento entra
 * por `ahoraMs`); sin `node:*`, `Date.now` ni `Math.random`. El `id` es un hash NO
 * criptográfico que sirve para deduplicar: NO es un secreto.
 */

export type TipoEventoSeguridad = "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe" | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";
export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";

export interface EventoSeguridad {
  version: 1; id: string; cuando: string; contador: number; resumen: string;
  tipo: TipoEventoSeguridad; severidad: SeveridadEvento; elemento: ElementoRed;
  detalle: Record<string, string | number | boolean>;
}

/** De menor a mayor: la posición alimenta `politicaPermite`. */
export const ORDEN_SEVERIDAD: SeveridadEvento[] = ["baja", "media", "alta", "critica"];
const SEVERIDADES: SeveridadEvento[] = ["critica", "alta", "media", "baja"];
const ELEMENTOS: ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];

const PLANTILLAS_RESUMEN: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Secretos detectados por el escáner",
  "limite-peticiones": "Límite de peticiones alcanzado",
  "ssrf-bloqueado": "Petición bloqueada por SSRF",
  "csp-informe": "Informe CSP recibido",
  "repeticion-rechazada": "Repetición del feed firmado rechazada",
  "invariante-violada": "Invariante del núcleo violada",
  "hallazgo-strix": "Hallazgo de auditoría de Strix",
  "acceso-inusual": "Acceso inusual a un elemento",
};
const TIPOS: TipoEventoSeguridad[] = Object.keys(PLANTILLAS_RESUMEN) as TipoEventoSeguridad[];

/** Lista blanca de claves del detalle por tipo: cualquier otra clave se descarta. */
const CLAVES_DETALLE: Record<TipoEventoSeguridad, string[]> = {
  "secreto-detectado": ["familia", "campo"],
  "limite-peticiones": ["ruta", "limite", "ventanaMs"],
  "ssrf-bloqueado": ["host", "regla"],
  "csp-informe": ["directiva", "accion"],
  "repeticion-rechazada": ["canal", "ventanaMs"],
  "invariante-violada": ["invariante", "archivo"],
  "hallazgo-strix": ["familia", "campo"],
  "acceso-inusual": ["medio", "ventanaMs"],
};

function hash32(texto: string, salta: number): string {
  let h = salta >>> 0;
  for (let i = 0; i < texto.length; i++) h = Math.imul((h ^ texto.charCodeAt(i)) >>> 0, 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Id determinista de 16 hex y cubo de 60 s: para dedup, NO un secreto. */
function idEvento(tipo: TipoEventoSeguridad, elemento: ElementoRed, ahoraMs: number, claves: string[]): string {
  const cubo60s = Math.floor(ahoraMs / 60000) * 60;
  const semilla = `${tipo}|${elemento}|${cubo60s}|${claves.slice().sort().join(",")}`;
  return "evs-" + hash32(semilla, 2166136261) + hash32(semilla, 139183);
}

/** Mapa del inglés de `scanner.ts` (no se importa `Severity`: ese archivo es cliente). */
export function desdeSeveridadScanner(s: string): SeveridadEvento {
  const mapa: Record<string, SeveridadEvento> = { critical: "critica", high: "alta", medium: "media", low: "baja" };
  return mapa[s] ?? "critica"; // lo desconocido sube a «critica»: no se subestima
}

/** true si parece correo, IPv4/IPv6, JWT, hex/base64 de ≥ 24 caracteres o prefijo de clave. */
export function pareceDatoPersonal(texto: string): boolean {
  const t = typeof texto === "string" ? texto.trim() : "";
  if (t.length === 0) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(t)) return true;
  if (/^[0-9a-fA-F]{0,4}(:[0-9a-fA-F]{0,4}){2,7}$/.test(t)) return true;
  if (/^(sk-|ghp_|AKIA|eyJ)/.test(t)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(t)) return true;
  if (/^[0-9a-fA-F]{24,}$/.test(t)) return true;
  if (/^[A-Za-z0-9+/]{24,}={0,2}$/.test(t)) return true;
  return false;
}

/** Lista blanca y falla cerrado: vocabulario fuera → `null`; no adivina nada. */
export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) return null;
  const e = entrada as Partial<EventoSeguridad> | null;
  if (typeof e !== "object" || e === null || Array.isArray(e)) return null;
  const tipo = TIPOS.includes(e.tipo as TipoEventoSeguridad) ? (e.tipo as TipoEventoSeguridad) : null;
  const severidad = SEVERIDADES.includes(e.severidad as SeveridadEvento) ? (e.severidad as SeveridadEvento) : null;
  const elemento = ELEMENTOS.includes(e.elemento as ElementoRed) ? (e.elemento as ElementoRed) : null;
  if (!tipo || !severidad || !elemento) return null;

  const detalle: Record<string, string | number | boolean> = {};
  const bruto = (e.detalle ?? {}) as Record<string, unknown>;
  for (const clave of CLAVES_DETALLE[tipo]) {
    const valor = bruto[clave];
    if (typeof valor === "number" || typeof valor === "boolean") detalle[clave] = valor;
    else if (typeof valor === "string" && valor.length <= 80 && !pareceDatoPersonal(valor)) detalle[clave] = valor;
  }
  const contador = typeof e.contador === "number" && Number.isInteger(e.contador) && e.contador >= 1 ? e.contador : 1;
  return {
    version: 1, id: idEvento(tipo, elemento, ahoraMs, Object.keys(detalle)), tipo, severidad, elemento,
    cuando: new Date(ahoraMs).toISOString(), contador, resumen: PLANTILLAS_RESUMEN[tipo], detalle,
  };
}

/** SOLO propuestas: nunca bloqueos ni sanciones automáticas contra una persona. */
export function proponerRespuesta(e: EventoSeguridad): { acciones: string[]; requiereHumano: boolean; motivo: string } {
  const base: Record<TipoEventoSeguridad, string[]> = {
    "secreto-detectado": ["revisar el hallazgo del escáner", "rotar la clave: la rota su dueña"],
    "limite-peticiones": ["revisar la ruta limitada", "ajustar el límite si el tráfico era legítimo"],
    "ssrf-bloqueado": ["revisar el destino bloqueado", "abrir un caso si el patrón se repite"],
    "csp-informe": ["revisar la directiva violada", "ajustar la política CSP si corresponde"],
    "repeticion-rechazada": ["revisar el emisor del feed firmado", "abrir un caso si continúan"],
    "invariante-violada": ["abrir un caso", "revisar el cambio que violó el invariante"],
    "hallazgo-strix": ["revisar el hallazgo de la auditoría", "abrir un caso si es explotable"],
    "acceso-inusual": ["revisar el acceso reciente", "abrir un caso si no fue su dueña"],
  };
  const persona = e.elemento === "cuenta" || e.elemento === "grupo" || e.elemento === "pagina";
  const motivo = persona
    ? "El afectado es una persona: lo juzga un Círculo de Paz con ella, nadie actúa sola."
    : "Propuesta solo: un agente sugiere, una persona decide; nada actúa solo.";
  return { acciones: base[e.tipo], requiereHumano: persona, motivo };
}

export function politicaPermite(e: EventoSeguridad, politica: { severidadMinima: SeveridadEvento; tipos?: TipoEventoSeguridad[] }): boolean {
  if (politica.tipos && !politica.tipos.includes(e.tipo)) return false;
  return ORDEN_SEVERIDAD.indexOf(e.severidad) >= ORDEN_SEVERIDAD.indexOf(politica.severidadMinima);
}

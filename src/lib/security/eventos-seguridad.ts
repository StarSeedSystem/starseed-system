// src/lib/security/eventos-seguridad.ts
// Evento de seguridad SANEADO (Ola 1025R · INF1025A, contrato Tracecat en §6.2 de
// architecture/repos-libreria-1025.md): vocabulario cerrado, lista blanca y falla
// cerrado. Nada sale con correos, IPs, claves ni contenido de nadie: lo que tiene
// forma de dato personal o secreto se DESCARTA, no se enmascara. Módulo PURO:
// sin red, sin disco ni reloj propio — el tiempo entra por `ahoraMs`.
export type TipoEventoSeguridad =
  | "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe"
  | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";
export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";
export interface EventoSeguridad {
  version: 1; id: string; tipo: TipoEventoSeguridad; severidad: SeveridadEvento;
  elemento: ElementoRed; cuando: string; contador: number; resumen: string;
  detalle: Record<string, string | number | boolean>;
}
export interface RespuestaPropuesta { acciones: string[]; requiereHumano: boolean; motivo: string; }
export interface PoliticaEventos { severidadMinima: SeveridadEvento; tipos?: TipoEventoSeguridad[]; }
/** De mayor a menor severidad. */
export const ORDEN_SEVERIDAD: readonly SeveridadEvento[] = ["critica", "alta", "media", "baja"];
const TIPOS: readonly TipoEventoSeguridad[] = [
  "secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe", "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual",
];
const ELEMENTOS: readonly ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];
const MAPA_SCANNER: Record<string, SeveridadEvento> = { critical: "critica", high: "alta", medium: "media", low: "baja" };
/** Plantilla fija del resumen por tipo: el texto de la entrada jamás entra. */
const RESUMENES: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Posible secreto detectado, a revisar", "limite-peticiones": "Límite de peticiones superado en la misma ventana",
  "ssrf-bloqueado": "Petición frenada hacia un destino interno", "csp-informe": "Informe de política de seguridad de contenido",
  "repeticion-rechazada": "Repetición del feed firmado rechazada", "invariante-violada": "Invariante del núcleo incumplida",
  "hallazgo-strix": "Hallazgo de auditoría por revisar", "acceso-inusual": "Acceso inusual por revisar",
};
/** Claves del detalle permitidas por tipo; cualquier otra clave se descarta. */
const CLAVES_DETALLE: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["familia", "campo"], "limite-peticiones": ["ruta", "limite", "ventanaMs"],
  "ssrf-bloqueado": ["host", "motivo"], "csp-informe": ["directiva", "fuente"],
  "repeticion-rechazada": ["huella", "canal"], "invariante-violada": ["invariante", "ruta"],
  "hallazgo-strix": ["regla", "fichero"], "acceso-inusual": ["zona", "ventana"],
};

/** Respuestas propuestas por tipo: SOLO revisar, abrir caso o rotar de dueña. */
const ACCIONES_POR_TIPO: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["revisar la familia del secreto", "rotar la clave: la rota su dueña", "abrir un caso"], "limite-peticiones": ["revisar la ruta y su uso", "abrir un caso si se repite"],
  "ssrf-bloqueado": ["revisar el destino frenado en el registro interno", "abrir un caso si la petición era interna"], "csp-informe": ["revisar la política de contenido", "abrir un caso si el informe se repite"],
  "repeticion-rechazada": ["revisar la huella del feed", "abrir un caso si la repetición persiste"], "invariante-violada": ["revisar la invariante incumplida", "abrir un caso y avisar a quien mantiene el núcleo"],
  "hallazgo-strix": ["revisar el hallazgo en el informe de auditoría", "abrir un caso"], "acceso-inusual": ["revisar la zona y la ventana con la persona implicada", "ofrecer una conversación en un Círculo de Paz"],
};

/** Parece correo, IPv4/IPv6, JWT, hex o base64 (≥ 24), o empieza por prefijo de clave. */
export function pareceDatoPersonal(texto: string): boolean {
  if (typeof texto !== "string" || !texto) return false;
  if (/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|^[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{0,4}){1,7}$/.test(texto)) return true;
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|eyJ[A-Za-z0-9_.-]{6,}/.test(texto)) return true;
  if (/^[0-9A-Fa-f]{24,}$/.test(texto) || /^[A-Za-z0-9+/=]{24,}$/.test(texto) || /^[A-Za-z0-9_-]{24,}$/.test(texto)) return true;
  return texto.startsWith("sk-") || texto.startsWith("ghp_") || texto.startsWith("AKIA") || texto.startsWith("eyJ");
}
/** Mapea la severidad de `src/lib/security/scanner.ts` al vocabulario propio. */
export function desdeSeveridadScanner(s: string): SeveridadEvento { return MAPA_SCANNER[s] ?? "media"; }
function valorSeguro(v: unknown): string | number | boolean | null {
  if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) return v;
  if (typeof v !== "string") return null;
  const limpio = v.replace(/\s+/g, " ").trim();
  return !limpio || limpio.length > 80 || pareceDatoPersonal(limpio) ? null : limpio;
}

/** Hash FNV-1a, NO criptográfico: solo deduplicación del id, nunca un secreto. */
function hashNoCripto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/**
 * `id` = «evs-» + hash FNV-1a (NO criptográfico y NO es un secreto) de
 * tipo|elemento|cubo de 60 s|claves del detalle: estable en el mismo cubo para
 * deduplicar en Tracecat. Resumen SIEMPRE de plantilla; vocabulario desconocido
 * o datos inválidos → `null` (falla cerrado).
 */
export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (!entrada || typeof entrada !== "object" || !Number.isFinite(ahoraMs)) return null;
  const e = entrada as Record<string, unknown>;
  if (typeof e.tipo !== "string" || !TIPOS.includes(e.tipo as TipoEventoSeguridad)) return null;
  if (typeof e.severidad !== "string" || !ORDEN_SEVERIDAD.includes(e.severidad as SeveridadEvento)) return null;
  if (typeof e.elemento !== "string" || !ELEMENTOS.includes(e.elemento as ElementoRed)) return null;
  const tipo = e.tipo as TipoEventoSeguridad;
  const permitidas = new Set(CLAVES_DETALLE[tipo]);
  const detalle: Record<string, string | number | boolean> = {};
  for (const [clave, valor] of Object.entries((e.detalle as Record<string, unknown>) ?? {})) {
    const v = permitidas.has(clave) ? valorSeguro(valor) : null; // clave de otra lista: fuera
    if (v !== null) detalle[clave] = v;
  }
  const cubo = Math.floor(ahoraMs / 60_000);
  const contador = typeof e.contador === "number" && Number.isInteger(e.contador) && e.contador >= 1 ? e.contador : 1;
  return {
    version: 1, tipo, severidad: e.severidad as SeveridadEvento, elemento: e.elemento as ElementoRed,
    id: `evs-${hashNoCripto(`${tipo}|${e.elemento}|${cubo}|${Object.keys(detalle).sort().join(",")}`)}`,
    cuando: new Date(ahoraMs).toISOString(), contador, resumen: RESUMENES[tipo], detalle,
  };
}
/**
 * SOLO propone (nunca actúa): sin bloqueos ni sanciones automáticas contra una
 * persona (justicia restaurativa, CLAUDE.md §6); si el elemento toca a una
 * persona o a su comunidad («cuenta», «grupo», «pagina»), decide el Círculo de Paz.
 */
export function proponerRespuesta(ev: EventoSeguridad | null): RespuestaPropuesta {
  if (!ev || !TIPOS.includes(ev.tipo) || !ELEMENTOS.includes(ev.elemento)) {
    return { acciones: ["revisar el evento con una persona"], requiereHumano: true, motivo: "Evento desconocido o incompleto: lo revisa una persona antes de nada." };
  }
  const humano = ev.elemento === "cuenta" || ev.elemento === "grupo" || ev.elemento === "pagina";
  const acciones = humano ? ["convocar un Círculo de Paz", ...ACCIONES_POR_TIPO[ev.tipo]] : [...ACCIONES_POR_TIPO[ev.tipo]];
  const motivo = humano ? "El elemento afecta a una persona o a su comunidad: nada se aplica a nadie sin una persona; la respuesta propuesta va a un Círculo de Paz." : "El sistema solo propone: quien cuida el recurso revisa, rota o abre el caso.";
  return { acciones, requiereHumano: humano, motivo };
}
/** ¿La política admite el evento? No entra si va por debajo de la severidad mínima o fuera de `tipos`. */
export function politicaPermite(ev: EventoSeguridad | null, politica: PoliticaEventos): boolean {
  if (!ev || !politica) return false;
  const nivel = ORDEN_SEVERIDAD.indexOf(ev.severidad), minimo = ORDEN_SEVERIDAD.indexOf(politica.severidadMinima);
  if (nivel < 0 || minimo < 0 || nivel > minimo) return false;
  return !politica.tipos || politica.tipos.length === 0 || politica.tipos.includes(ev.tipo);
}

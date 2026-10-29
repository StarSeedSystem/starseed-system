// src/lib/security/eventos-seguridad.ts
// (INF1025A · Ola 1025R) Eventos de seguridad SANEADOS: lo que el OS ya detecta
// (escáner de secretos y datos personales, límite de peticiones, SSRF, informes
// CSP, repeticiones del feed firmado, invariantes del núcleo, hallazgos de Strix
// y acceso inusual) sale hacia un orquestador de respuesta (Tracecat) SIN
// filtrar nada de nadie.
//
// Contrato: vocabulario cerrado con LISTA BLANCA y falla cerrado (lo
// desconocido → `null`, nunca se adivina); el `resumen` sale de una plantilla
// fija por tipo, jamás de texto de la entrada; el `detalle` conserva solo las
// claves permitidas por tipo y DESCARTA (no enmascara) lo que parece dato
// personal; el `id` es determinista con un hash no criptográfico — NO es un
// secreto ni va firmado: existe para que el orquestador deduplique.
// Módulo PURO: sin red, sin disco y sin reloj — el tiempo entra por `ahoraMs`.

export const TIPOS_EVENTO = [
  "secreto-detectado",
  "limite-peticiones",
  "ssrf-bloqueado",
  "csp-informe",
  "repeticion-rechazada",
  "invariante-violada",
  "hallazgo-strix",
  "acceso-inusual",
] as const;

export type TipoEventoSeguridad = (typeof TIPOS_EVENTO)[number];

export const ORDEN_SEVERIDAD = ["critica", "alta", "media", "baja"] as const;
export type SeveridadEvento = (typeof ORDEN_SEVERIDAD)[number];

export const ELEMENTOS_RED = ["red", "cuenta", "grupo", "pagina", "app", "api"] as const;
export type ElementoRed = (typeof ELEMENTOS_RED)[number];

export interface EventoSeguridad {
  version: 1;
  id: string;
  tipo: TipoEventoSeguridad;
  severidad: SeveridadEvento;
  elemento: ElementoRed;
  /** ISO calculado desde el parámetro `ahoraMs`; nunca del reloj. */
  cuando: string;
  /** Veces visto el mismo hecho (≥ 1). */
  contador: number;
  resumen: string;
  detalle: Record<string, string | number | boolean>;
}

const RANGO_SEVERIDAD: Record<SeveridadEvento, number> = { critica: 3, alta: 2, media: 1, baja: 0 };

/** Plantilla FIJA por tipo: el resumen nunca sale del texto de la entrada. */
const RESUMENES: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Posible secreto detectado: se comparte la familia, nunca el valor.",
  "limite-peticiones": "Límite de peticiones alcanzado en una ruta.",
  "ssrf-bloqueado": "Petición hacia un destino vedado: patrón SSRF frenado por la verja.",
  "csp-informe": "Informe CSP recibido: una política de contenido frenó un recurso.",
  "repeticion-rechazada": "Repetición de un mensaje firmado rechazada por la verja de tiempo.",
  "invariante-violada": "Violación de un invariante del núcleo del OS.",
  "hallazgo-strix": "Hallazgo de la auditoría ofensiva: se comparte la familia, nunca el detalle.",
  "acceso-inusual": "Patrón de acceso inusual observado; se revisa con la red.",
};

/** Solo estas claves del detalle salen, según el tipo; todo lo demás se cae. */
const CLAVES_DETALLE: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["familia", "campo"],
  "limite-peticiones": ["ruta", "limite", "ventanaMs"],
  "ssrf-bloqueado": ["motivo", "ruta"],
  "csp-informe": ["directiva", "disposicion"],
  "repeticion-rechazada": ["huella", "ventanaMs"],
  "invariante-violada": ["invariante", "arreglo"],
  "hallazgo-strix": ["familia"],
  "acceso-inusual": ["patron", "medio"],
};

/* ---------------------------------------------------------------- */
/* pareceDatoPersonal                                               */
/* ---------------------------------------------------------------- */

const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const RE_HEX_B64 = /^[A-Za-z0-9+/=_-]{24,}$/;
const RE_PREFIJO_CLAVE = /^(sk-|ghp_|gho_|ghs_|AKIA|eyJ)/;
const RE_TODAS_IP = /^[0-9A-Fa-f:.]+$/;

function esIpv4(t: string): boolean {
  const partes = t.split(".");
  return (
    partes.length === 4 &&
    partes.every((p) => /^\d+$/.test(p) && p.length <= 3 && Number(p) <= 255)
  );
}

/** IPv6 en notación razonable: hex y «:», con compresión «::» o ≥ 3 grupos.
 * «12:34» (una hora) no lo parece. */
function esIpv6(t: string): boolean {
  if (!t.includes(":") || !RE_TODAS_IP.test(t)) return false;
  if (t.includes("::")) return true;
  return t.split(":").filter(Boolean).length >= 3;
}

/** true si parece correo, IPv4/IPv6, JWT, hex/base64 de ≥ 24 car. o una clave
 * con prefijo conocido (sk-, ghp_, AKIA, eyJ). Descartar, no enmascarar. */
export function pareceDatoPersonal(texto: string): boolean {
  if (typeof texto !== "string") return false;
  const t = texto.trim();
  if (t.length === 0) return false;
  if (RE_PREFIJO_CLAVE.test(t)) return true;
  if (RE_CORREO.test(t)) return true;
  if (esIpv4(t) || esIpv6(t)) return true;
  if (RE_HEX_B64.test(t)) return true;
  return false;
}

/** FNV-1a de 32 bits (hex, 8 caracteres): hash NO criptográfico, suficiente
 * para deduplicar eventos y estable en cualquier neurona. */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Filtra el detalle crudo por la lista blanca del tipo: solo claves permitidas,
 * y de cada valor solo número finito, booleano o cadena limpia (≤ 80 car. y sin
 * pinta de dato personal). Lo que no cumple se descarta, nunca se enmascara. */
function sanearDetalle(tipo: TipoEventoSeguridad, bruto: unknown): Record<string, string | number | boolean> {
  const permitidas = CLAVES_DETALLE[tipo];
  const origen = (typeof bruto === "object" && bruto !== null ? bruto : {}) as Record<string, unknown>;
  const salida: Record<string, string | number | boolean> = {};
  for (const clave of permitidas) {
    const v = origen[clave];
    if (typeof v === "number" && Number.isFinite(v)) salida[clave] = v;
    else if (typeof v === "boolean") salida[clave] = v;
    else if (typeof v === "string" && v.length > 0 && v.length <= 80 && !pareceDatoPersonal(v)) {
      salida[clave] = v;
    }
  }
  return salida;
}

/**
 * Constructor con LISTA BLANCA: si `tipo`, `severidad` o `elemento` no están en
 * el vocabulario, o `ahoraMs` no es un número finito, devuelve `null` (falla
 * cerrado). `contador` absent → 1; presente e inválido → `null`.
 */
export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) return null;
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) return null;
  const e = entrada as { tipo?: unknown; severidad?: unknown; elemento?: unknown; contador?: unknown; detalle?: unknown };
  if (!(TIPOS_EVENTO as readonly unknown[]).includes(e.tipo)) return null;
  if (!(ORDEN_SEVERIDAD as readonly unknown[]).includes(e.severidad)) return null;
  if (!(ELEMENTOS_RED as readonly unknown[]).includes(e.elemento)) return null;
  let contador = 1;
  if (e.contador !== undefined) {
    if (typeof e.contador !== "number" || !Number.isFinite(e.contador) || e.contador < 1) return null;
    contador = Math.floor(e.contador);
  }
  const tipo = e.tipo as TipoEventoSeguridad;
  const detalle = sanearDetalle(tipo, e.detalle);
  const claves = Object.keys(detalle).sort().join(",");
  // Cubo de 60 s: minutos iguales a ambos lados de una ventana → mismo id.
  const cubo = Math.floor(ahoraMs / 60000);
  return {
    version: 1,
    id: `evs-${fnv1a(`${tipo}|${e.elemento as ElementoRed}|${cubo}|${claves}`)}`,
    tipo,
    severidad: e.severidad as SeveridadEvento,
    elemento: e.elemento as ElementoRed,
    cuando: new Date(ahoraMs).toISOString(),
    contador,
    resumen: RESUMENES[tipo],
    detalle,
  };
}

/** Mapea la severidad del escáner (`src/lib/security/scanner.ts`, `"use client"`,
 * no se importa) al vocabulario propio. Desconocido → `null`. */
export function desdeSeveridadScanner(s: string): SeveridadEvento | null {
  const mapa: Record<string, SeveridadEvento> = { critical: "critica", high: "alta", medium: "media", low: "baja" };
  return mapa[s] ?? null;
}

/* ---------------------------------------------------------------- */
/* Propuestas de respuesta (justicia restaurativa, CLAUDE.md §6)    */
/* ---------------------------------------------------------------- */

export interface PropuestaRespuesta {
  acciones: string[];
  requiereHumano: boolean;
  motivo: string;
}

/** Solo proponen: jamás bloquean ni sancionan a una persona. */
const ACCIONES: Record<TipoEventoSeguridad, string[]> = {
  "secreto-detectado": ["abrir un caso", "avisar a la dueña: la clave la rota su dueña", "buscar dónde más circuló esa familia"],
  "limite-peticiones": ["revisar la ruta afectada", "abrir un caso si se repite dentro de la ventana"],
  "ssrf-bloqueado": ["revisar el origen de la petición", "abrir un caso si el patrón se repite"],
  "csp-informe": ["revisar la directiva implicada", "abrir un caso si el recurso es propio"],
  "repeticion-rechazada": ["revisar la verja de tiempo", "abrir un caso si la misma huella insiste"],
  "invariante-violada": ["revisar la violación con cómo arreglarla", "abrir un caso"],
  "hallazgo-strix": ["abrir un caso", "revisar el hallazgo con la dueña del elemento"],
  "acceso-inusual": ["revisar el patrón con la persona implicada: lo habla con ella"],
};

/**
 * Propuestas SOLO, en español. Si el elemento toca a gente (cuenta, grupo o
 * página) exige humano: lo que la toque lo decide una persona en un Círculo
 * de Paz, nunca una regla automática.
 */
export function proponerRespuesta(e: EventoSeguridad): PropuestaRespuesta {
  const requiereHumano = e.elemento === "cuenta" || e.elemento === "grupo" || e.elemento === "pagina";
  return {
    acciones: ACCIONES[e.tipo],
    requiereHumano,
    motivo: requiereHumano
      ? "Propuestas solo: lo que toque a la gente lo decide una persona en un Círculo de Paz."
      : "Propuestas de revisión técnica; nada se aplica solo.",
  };
}

export interface PoliticaEventos {
  severidadMinima: SeveridadEvento;
  /** Si se da, solo pasan esos tipos. */
  tipos?: TipoEventoSeguridad[];
}

/** ¿La política del orquestador admite este evento? */
export function politicaPermite(e: EventoSeguridad, politica: PoliticaEventos): boolean {
  if (!(ORDEN_SEVERIDAD as readonly SeveridadEvento[]).includes(politica.severidadMinima)) return false;
  if (RANGO_SEVERIDAD[e.severidad] < RANGO_SEVERIDAD[politica.severidadMinima]) return false;
  if (politica.tipos && !politica.tipos.includes(e.tipo)) return false;
  return true;
}


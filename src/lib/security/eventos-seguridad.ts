// src/lib/security/eventos-seguridad.ts · INF1025A
// Eventos de seguridad SANEADOS hacia un orquestador de respuesta (Tracecat,
// architecture/repos-libreria-1025.md §6). Módulo puro sin `node:*` ni reloj
// (el instante entra por `ahoraMs`). Vocabulario CERRADO (lo desconocido →
// null); detalle por LISTA BLANCA y lo que parezca dato personal se DESCARTA,
// no se enmascara. El `id` determinista NO es un secreto: se deriva de la
// clase del evento (tipo · elemento · cubo de 60 s · claves del detalle),
// nunca de datos de nadie: Tracecat lo deduplica.
export type TipoEventoSeguridad =
  | "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe"
  | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";
export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
/** Elemento de la red al que refiere el evento: nunca la identidad de nadie. */
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";

/** Evento saneado; `resumen` de plantilla fija y `cuando` ISO por parámetro. */
export interface EventoSeguridad {
  version: 1; id: string; tipo: TipoEventoSeguridad; severidad: SeveridadEvento; elemento: ElementoRed;
  cuando: string;
  /** Repeticiones agrupadas; siempre ≥ 1. */
  contador: number;
  resumen: string;
  detalle: Record<string, string | number | boolean>;
}
export interface PropuestaRespuesta { acciones: string[]; requiereHumano: boolean; motivo: string }
/** De lo flojo a lo fuerte, para umbrales de política. */
export const ORDEN_SEVERIDAD: SeveridadEvento[] = ["baja", "media", "alta", "critica"];
const RANGO: Record<SeveridadEvento, number> = { baja: 0, media: 1, alta: 2, critica: 3 };
const TIPOS = new Set<string>([
  "secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe",
  "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual",
]);
const ELEMENTOS = new Set<string>(["red", "cuenta", "grupo", "pagina", "app", "api"]);
/** Mapea la severidad de `src/lib/security/scanner.ts` (critical/high/…) al
 * español; lo desconocido → null. NO importa `Severity` de allí: es "use client". */
const DE_SCANNER: Record<string, SeveridadEvento> = {
  critical: "critica", high: "alta", medium: "media", low: "baja",
};
export function desdeSeveridadScanner(s: string): SeveridadEvento | null {
  return DE_SCANNER[s] ?? null;
}

/** true si parece correo, IPv4/IPv6, JWT, secreto prefijado o hex/base64 ≥ 24. */
export function pareceDatoPersonal(texto: string): boolean {
  if (typeof texto !== "string" || texto.length === 0) return false;
  const t = texto.trim();
  if (t.length === 0) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(t)) return true;
  if (t.split(":").length >= 3 && /^[0-9A-Fa-f:]{2,45}$/.test(t)) return true; // IPv6
  if (/^ey[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}$/.test(t)) return true; // JWT
  return /^[0-9a-fA-F]{24,}$/.test(t) || /^[A-Za-z0-9+/=-]{24,}$/.test(t) ||
    /^(sk-|ghp_|AKIA|eyJ)/.test(t);
}

/** Plantillas FIJAS por tipo; el resumen jamás se toma de la entrada. */
const RESUMENES: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Posible secreto en un texto que se iba a compartir.",
  "limite-peticiones": "Se superó el límite de peticiones de una ruta de la API.",
  "ssrf-bloqueado": "Se frenó una petición hacia un destino interno no permitido.",
  "csp-informe": "Un informe de política de contenido señala una violación.",
  "repeticion-rechazada": "Se rechazó una repetición del feed firmado.",
  "invariante-violada": "Algo amenazó una invariante del núcleo del OS.",
  "hallazgo-strix": "La auditoría ofensiva registró un hallazgo nuevo.",
  "acceso-inusual": "Hubo un acceso inusual en una entidad de la red.",
};
/** Lista blanca de claves del detalle por tipo; el resto se tira. En
 * `secreto-detectado` van familia y campo, NUNCA el valor. */
const CLAVES: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["familia", "campo"], "csp-informe": ["directiva", "violaciones"],
  "limite-peticiones": ["ruta", "limite", "ventanaMs"], "repeticion-rechazada": ["ventanaMs", "intentos"],
  "ssrf-bloqueado": ["esPrivado", "intento"], "invariante-violada": ["invariante"],
  "hallazgo-strix": ["familia", "severidadOrigen"], "acceso-inusual": ["medio", "intentos"],
};
/** FNV-1a de 32 bits en hex: NO criptográfico y NO un secreto. */
function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}
/** Sanea UN valor: número/booleano finito o cadena ≤ 80 sin forma de dato
 * personal; lo demás → null (la clave se descarta). */
function valorDetalle(v: unknown): string | number | boolean | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= 80 && !pareceDatoPersonal(t) ? t : null;
}
/** Construye el evento desde una entrada libre. Falla cerrado: entrada o
 * instante inválidos o vocabulario desconocido → null; no se adivina. */
export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) return null;
  const fecha = new Date(ahoraMs);
  if (Number.isNaN(fecha.getTime()) || !entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const cruda = entrada as Record<string, unknown>;
  const tipo = cruda.tipo as TipoEventoSeguridad;
  const severidad = cruda.severidad as SeveridadEvento;
  const elemento = cruda.elemento as ElementoRed;
  if (!TIPOS.has(tipo) || !ELEMENTOS.has(elemento) || !ORDEN_SEVERIDAD.includes(severidad)) return null;
  const detalle: Record<string, string | number | boolean> = {};
  if (cruda.detalle && typeof cruda.detalle === "object" && !Array.isArray(cruda.detalle)) {
    const fuentes = cruda.detalle as Record<string, unknown>;
    for (const clave of CLAVES[tipo]) {
      const valor = valorDetalle(fuentes[clave]);
      if (valor !== null) detalle[clave] = valor;
    }
  }
  const c = cruda.contador;
  const contador = typeof c === "number" && Number.isInteger(c) && c >= 1 ? c : 1;
  const base = `${tipo}|${elemento}|${Math.floor(ahoraMs / 60_000)}|${CLAVES[tipo].join(",")}`;
  return {
    version: 1, id: `evs-${huella(base)}`, tipo, severidad, elemento, cuando: fecha.toISOString(),
    contador, resumen: RESUMENES[tipo], detalle,
  };
}
// Propuestas SOLO de revisión y de caso: nada automático contra una persona
// (justicia restaurativa, CLAUDE.md §6); rotar una clave es de su dueña.
const PROPUESTAS: Record<TipoEventoSeguridad, string[]> = {
  "secreto-detectado": ["Revisar dónde entró el texto", "Pedir rotar la clave: la rota su dueña"],
  "limite-peticiones": ["Revisar el uso de la ruta", "Subir el umbral si fue un uso legítimo"],
  "ssrf-bloqueado": ["Revisar el origen de la petición", "Abrir un caso"],
  "csp-informe": ["Revisar la directiva que falló", "Abrir un caso si se repite"],
  "repeticion-rechazada": ["Revisar si es un cliente con error de reintentos"],
  "invariante-violada": ["Revisar el cambio que amenazó", "Abrir un caso"],
  "hallazgo-strix": ["Revisar la ficha de la auditoría", "Abrir un caso"],
  "acceso-inusual": ["Revisar con la entidad qué ocurrió", "Abrir un caso"],
};
const ELEMENTOS_PERSONA: readonly string[] = ["cuenta", "grupo", "pagina"];
/** Propuesta en español; SOLO propone: nunca bloquea, suspende ni sanciona.
 * Con `cuenta`, `grupo` o `pagina`, pide humano y remite a un Círculo de Paz. */
export function proponerRespuesta(e: EventoSeguridad): PropuestaRespuesta {
  const esPersona = ELEMENTOS_PERSONA.includes(e.elemento);
  return {
    acciones: [...PROPUESTAS[e.tipo]],
    requiereHumano: esPersona || e.tipo === "secreto-detectado",
    motivo: esPersona
      ? "Por justicia restaurativa, lo que toque a una persona se decide en un Círculo de Paz: nada automático."
      : "Un agente propone y una persona decide: se revisa el evento antes de actuar.",
  };
}
/** ¿`e` pasa la política? Umbral de severidad y, si lista tipos, pertenencia. */
export function politicaPermite(
  e: EventoSeguridad,
  politica: { severidadMinima: SeveridadEvento; tipos?: TipoEventoSeguridad[] },
): boolean {
  if (!e || !ORDEN_SEVERIDAD.includes(e?.severidad)) return false;
  if (!ORDEN_SEVERIDAD.includes(politica?.severidadMinima)) return false;
  if (RANGO[e.severidad] < RANGO[politica.severidadMinima]) return false;
  return !politica.tipos || politica.tipos.includes(e.tipo);
}

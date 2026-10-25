/**
 * Eventos de seguridad saneados (INF1025A · ola 1025R).
 * Vocabulario cerrado y lista blanca: lo que no encaja falla cerrado con `null`.
 * Módulo PURO: sin red, disco, reloj ni azar; `ahoraMs` entra por parámetro.
 */
export type TipoEventoSeguridad = "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe" | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";
export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";
export type ValorDetalle = string | number | boolean;
export interface EventoSeguridad {
  version: 1; id: string; tipo: TipoEventoSeguridad; severidad: SeveridadEvento;
  elemento: ElementoRed; cuando: string; contador: number; resumen: string;
  detalle: Record<string, ValorDetalle>;
}
export interface PoliticaEventos { severidadMinima: SeveridadEvento; tipos?: TipoEventoSeguridad[]; }
export interface RespuestaPropuesta { acciones: string[]; requiereHumano: boolean; motivo: string; }
const TIPOS: readonly TipoEventoSeguridad[] = ["secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe", "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual"];
const SEVERIDADES: readonly SeveridadEvento[] = ["critica", "alta", "media", "baja"];
export const ORDEN_SEVERIDAD: readonly SeveridadEvento[] = SEVERIDADES;
const ELEMENTOS: readonly ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];
const ELEMENTOS_CON_CIRCULO: readonly ElementoRed[] = ["cuenta", "grupo", "pagina"];

/** Resumen fijo, propuesta de respuesta y claves permitidas por tipo. */
const REGLA: Record<TipoEventoSeguridad, { resumen: string; accion: string; claves: readonly string[] }> = {
  "secreto-detectado": { resumen: "Posible secreto detectado en el sistema.", accion: "Revisar el campo señalado y proponer a su dueña rotar la clave: la rota su dueña.", claves: ["familia", "campo"] },
  "limite-peticiones": { resumen: "Se alcanzó un límite de peticiones.", accion: "Revisar la ruta y el límite alcanzado.", claves: ["ruta", "limite", "ventanaMs"] },
  "ssrf-bloqueado": { resumen: "Se detuvo una petición de red no permitida.", accion: "Revisar el destino señalado.", claves: ["destino", "motivo"] },
  "csp-informe": { resumen: "El navegador informó de una violación de la política de contenido.", accion: "Revisar la directiva de la política de contenido.", claves: ["directiva", "cantidad"] },
  "repeticion-rechazada": { resumen: "Se rechazó un mensaje repetido del feed firmado.", accion: "Revisar el feed firmado.", claves: ["feed", "ventanaMs"] },
  "invariante-violada": { resumen: "Un cambio intentó romper una invariante del núcleo.", accion: "Revisar el cambio propuesto y restaurar la invariante.", claves: ["invariante", "superficie"] },
  "hallazgo-strix": { resumen: "La auditoría ofensiva encontró un hallazgo.", accion: "Revisar el hallazgo y su regla.", claves: ["regla", "categoria", "cantidad"] },
  "acceso-inusual": { resumen: "Se observó un acceso poco habitual.", accion: "Revisar el acceso señalado.", claves: ["motivo", "intentos"] },
};
const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const RE_IPV4 = /(?:\d{1,3}\.){3}\d{1,3}/;
const RE_IPV6 = /(?:[A-Fa-f0-9]{1,4}:){3,}[A-Fa-f0-9]{0,4}|::[A-Fa-f0-9:]*/;
const RE_JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const RE_HEX = /[A-Fa-f0-9]{24,}/;
const RE_BASE64 = /[A-Za-z0-9+/_-]{24,}={0,2}/;

/** True si el texto parece correo, IP, JWT, hex/base64 largo o clave conocida. */
export function pareceDatoPersonal(texto: string): boolean {
  const s = texto.trim();
  if (!s) return false;
  return RE_CORREO.test(s) || RE_IPV4.test(s) || RE_IPV6.test(s) || RE_JWT.test(s) ||
    RE_HEX.test(s) || RE_BASE64.test(s) ||
    s.startsWith("sk-") || s.startsWith("ghp_") || s.startsWith("AKIA") || s.startsWith("eyJ");
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const enVocabulario = <T extends string>(v: unknown, lista: readonly T[]): v is T => typeof v === "string" && (lista as readonly string[]).includes(v);

/** FNV-1a de 32 bits: estable y barato para deduplicar. NO es criptografía ni un secreto. */
function huella(texto: string): string {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
function sanearDetalle(tipo: TipoEventoSeguridad, bruto: unknown): Record<string, ValorDetalle> {
  const limpio: Record<string, ValorDetalle> = {};
  if (!esObjeto(bruto)) return limpio;
  for (const clave of REGLA[tipo].claves) {
    if (!Object.prototype.hasOwnProperty.call(bruto, clave)) continue;
    const valor = bruto[clave];
    if (typeof valor === "boolean") { limpio[clave] = valor; continue; }
    if (typeof valor === "number" && Number.isFinite(valor)) { limpio[clave] = valor; continue; }
    if (typeof valor !== "string") continue;
    const texto = valor.trim();
    if (texto.length > 0 && texto.length <= 80 && !pareceDatoPersonal(texto)) limpio[clave] = texto;
  }
  return limpio;
}

const SCANNER: Record<string, SeveridadEvento> = { critical: "critica", high: "alta", medium: "media", low: "baja" };
/** Adapta la severidad del escáner de cliente sin importarlo (`scanner.ts` es "use client"). */
export function desdeSeveridadScanner(s: string): SeveridadEvento | null {
  return SCANNER[s] ?? null;
}

/** Construye un evento saneado o devuelve `null` si el vocabulario no encaja (falla cerrado). */
export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  try {
    if (!esObjeto(entrada) || !Number.isFinite(ahoraMs)) return null;
    const { tipo, severidad, elemento } = entrada;
    if (!enVocabulario(tipo, TIPOS) || !enVocabulario(severidad, SEVERIDADES) || !enVocabulario(elemento, ELEMENTOS)) return null;
    const detalle = sanearDetalle(tipo, entrada.detalle);
    const cubo = Math.floor(ahoraMs / 60_000);
    const brutoContador = entrada.contador;
    const contador = typeof brutoContador === "number" && Number.isFinite(brutoContador) && brutoContador >= 1 ? Math.floor(brutoContador) : 1;
    return {
      version: 1, id: `evs-${huella(`${tipo}|${elemento}|${cubo}|${Object.keys(detalle).sort().join(",")}`)}`,
      tipo, severidad, elemento, cuando: new Date(ahoraMs).toISOString(),
      contador, resumen: REGLA[tipo].resumen, detalle,
    };
  } catch {
    return null;
  }
}

/** Propuestas de respuesta: nunca bloqueos ni sanciones automáticas contra personas. */
export function proponerRespuesta(evento: EventoSeguridad): RespuestaPropuesta {
  const sensible = ELEMENTOS_CON_CIRCULO.includes(evento.elemento);
  const acciones = [REGLA[evento.tipo].accion, "Abrir un caso para seguir el cierre."];
  if (sensible) acciones.push("Llevarlo a un Círculo de Paz antes de decidir nada sobre una persona.");
  return {
    acciones,
    requiereHumano: sensible,
    motivo: sensible
      ? "Afecta a una cuenta, un grupo o una página: lo decide un Círculo de Paz, nunca un automatismo."
      : "Es una propuesta: ninguna acción se ejecuta sola ni castiga a nadie de forma automática.",
  };
}

/** Dice si el evento alcanza la severidad mínima y, si se indican, uno de los tipos. */
export function politicaPermite(evento: EventoSeguridad, politica: PoliticaEventos): boolean {
  if (!enVocabulario(politica.severidadMinima, SEVERIDADES)) return false;
  if (SEVERIDADES.indexOf(evento.severidad) > SEVERIDADES.indexOf(politica.severidadMinima)) return false;
  if (politica.tipos && !politica.tipos.includes(evento.tipo)) return false;
  return true;
}

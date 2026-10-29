// src/lib/security/eventos-seguridad.ts · INF1025A · Ola 1025R (infra)
// Evento de seguridad saneado que puede salir hacia Tracecat sin filtrar nada de
// nadie. LISTA BLANCA: si algo no está en el vocabulario devuelve null (falla
// cerrado). Módulo PURO: sin red, disco ni reloj (el reloj entra por `ahoraMs`).
// El `id` es una huella NO criptográfica de deduplicación, NO es un secreto.
export type TipoEventoSeguridad =
  | "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe"
  | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";
export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";
export interface EventoSeguridad {
  version: 1; id: string; tipo: TipoEventoSeguridad; severidad: SeveridadEvento; elemento: ElementoRed;
  cuando: string; contador: number; resumen: string; detalle: Record<string, string | number | boolean>;
}
export interface PoliticaEvento { severidadMinima: SeveridadEvento; tipos?: TipoEventoSeguridad[]; }
export interface RespuestaPropuesta { acciones: string[]; requiereHumano: boolean; motivo: string; }
// Orden canónico de las severidades, de la más leve a la más alta.
export const ORDEN_SEVERIDAD: readonly SeveridadEvento[] = ["baja", "media", "alta", "critica"];
const TIPOS: readonly TipoEventoSeguridad[] = ["secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe", "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual"];
const SEVERIDADES: readonly SeveridadEvento[] = ["critica", "alta", "media", "baja"];
const ELEMENTOS: readonly ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];
const RANGO: Record<SeveridadEvento, number> = { critica: 3, alta: 2, media: 1, baja: 0 };
// Plantilla fija por tipo: el resumen sale de aquí, jamás del texto de la entrada.
const PLANTILLA_RESUMEN: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Sospecha de secreto en un texto: la redacción actúa antes de guardar o enviar.", "limite-peticiones": "Se alcanzó el límite de peticiones de una ruta del OS.",
  "ssrf-bloqueado": "Se anuló una petición hacia una dirección de red no permitida.", "csp-informe": "Un navegador avisó de una política de contenido incumplida.",
  "repeticion-rechazada": "Se anuló una petición repetida del feed firmado.", "invariante-violada": "Una invariante del núcleo quedó incumplida: el cambio no se aplicó.",
  "hallazgo-strix": "La auditoría ofensiva dejó un hallazgo pendiente de revisar.", "acceso-inusual": "Apareció un acceso con patrón poco habitual: lo revisa su dueña.",
};// Claves que cada tipo conserva; toda otra se DESCARTA (no se enmascara).
const CLAVES_PERMITIDAS: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["familia", "campo"], "limite-peticiones": ["ruta", "limite", "ventanaMs"],
  "ssrf-bloqueado": ["clase", "motivo"], "csp-informe": ["directiva", "codigo"],
  "repeticion-rechazada": ["ventanaMs", "motivo"], "invariante-violada": ["invariante", "paso"],
  "hallazgo-strix": ["familia", "campo"], "acceso-inusual": ["medio", "ventanaMs"],
};
/** Mapea la severidad del escáner (`critical|high|medium|low`) al vocabulario del evento. */
export function desdeSeveridadScanner(s: string): SeveridadEvento | null {
  const mapa: Record<string, SeveridadEvento> = { critical: "critica", high: "alta", medium: "media", low: "baja" };
  return mapa[s] ?? null;
}
/** True si parece dato personal (correo, IP, JWT, hex o base64 de ≥ 24 letras, o un prefijo de credencial). */
export function pareceDatoPersonal(texto: string): boolean {
  if (texto.length === 0) return false;
  if (/^(sk-|ghp_|AKIA|eyJ)/.test(texto)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) return true;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(texto)) return true;
  if (texto.includes(":") && /^[0-9A-Fa-f:]{2,45}$/.test(texto)) return true;
  if (/^[0-9A-Fa-f]{24,}$/.test(texto)) return true;
  if (/^[A-Za-z0-9+/=_-]{24,}$/.test(texto)) return true;
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(texto)) return true;
  return false;
}
// FNV-1a de 32 bits: huella no criptográfica, solo para deduplicar.
function fnv1a(texto: string, semilla: number): string {
  let h = semilla >>> 0;
  for (let i = 0; i < texto.length; i++) h = Math.imul((h ^ texto.charCodeAt(i)) >>> 0, 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}
const esEnVocabulario = (valor: unknown, vocabulario: readonly string[]): boolean =>
  typeof valor === "string" && vocabulario.includes(valor);
// Solo claves de la lista blanca y solo valores seguros: número finito, booleano u
// cadena de ≤ 80 letras sin forma de dato personal (se descarta, no se enmascara).
function limpiarDetalle(tipo: TipoEventoSeguridad, crudo: unknown): Record<string, string | number | boolean> {
  const permitidas = CLAVES_PERMITIDAS[tipo];
  const limpio: Record<string, string | number | boolean> = {};
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return limpio;
  for (const [clave, valor] of Object.entries(crudo as Record<string, unknown>)) {
    if (!permitidas.includes(clave)) continue;
    if (typeof valor === "number" && Number.isFinite(valor)) limpio[clave] = valor;
    else if (typeof valor === "boolean") limpio[clave] = valor;
    else if (typeof valor === "string" && valor.length > 0 && valor.length <= 80 && !pareceDatoPersonal(valor)) limpio[clave] = valor;
  }
  return limpio;
}
/** Construye un evento saneado. Devuelve null si la entrada no es objeto, si
 *  `ahoraMs` no es finito o si tipo/severidad/elemento no están en el vocabulario. */
export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) return null;
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const e = entrada as Record<string, unknown>;
  if (!esEnVocabulario(e.severidad, SEVERIDADES) || !esEnVocabulario(e.tipo, TIPOS) || !esEnVocabulario(e.elemento, ELEMENTOS)) return null;
  const tipo = e.tipo as TipoEventoSeguridad;
  const contador = typeof e.contador === "number" && Number.isInteger(e.contador) && e.contador >= 1 ? e.contador : 1;
  const detalle = limpiarDetalle(tipo, e.detalle);
  const base = `${tipo}|${e.elemento as string}|${Math.floor(ahoraMs / 60000)}|${Object.keys(detalle).sort().join(",")}`;
  return {
    version: 1,
    id: `evs-${fnv1a(base, 2166136261)}${fnv1a(base + "#v1", 5381)}`,
    tipo,
    severidad: e.severidad as SeveridadEvento,
    elemento: e.elemento as ElementoRed,
    cuando: new Date(ahoraMs).toISOString(),
    contador,
    resumen: PLANTILLA_RESUMEN[tipo],
    detalle,
  };
}
/** Propone una respuesta en español: SOLO pasos humanos de revisar, abrir un caso o
 *  rotar la clave la dueña. Sin castigos automáticos contra una persona (justicia
 *  restaurativa, CLAUDE.md §6): cuenta, grupo o página los decide un humano o Círculo de Paz. */
export function proponerRespuesta(e: EventoSeguridad): RespuestaPropuesta {
  const acciones: Record<TipoEventoSeguridad, string[]> = {
    "secreto-detectado": ["revisar el hallazgo en Genesis", "rotar la credencial: la rota su dueña"], "limite-peticiones": ["revisar la ruta alcanzada", "abrir un caso si el límite se repite"],
    "ssrf-bloqueado": ["revisar el destino anulado", "abrir un caso si el intento se repite"], "csp-informe": ["revisar la directiva incumplida", "abrir un caso si avisa todo el tiempo"],
    "repeticion-rechazada": ["revisar la firma y el reloj", "abrir un caso si la repetición insiste"], "invariante-violada": ["revisar el cambio no aplicado", "abrir un caso con quien lo propuso"],
    "hallazgo-strix": ["revisar el hallazgo", "planificar el arreglo: lo aprueba su dueña"], "acceso-inusual": ["avisar a su dueña", "revisar el medio del acceso"],
  };
  const tocaPersonas = e.elemento === "cuenta" || e.elemento === "grupo" || e.elemento === "pagina";
  const motivo = tocaPersonas
    ? "Toca a personas: lo decide un humano o un Círculo de Paz; nada actúa sola contra nadie."
    : "Propuesta solo para revisar: aprobar y actuar es de una persona.";
  return { acciones: acciones[e.tipo], requiereHumano: tocaPersonas, motivo };
}
/** True si el evento entra por la política (severidad mínima y, si hay, tipos). */
export function politicaPermite(e: EventoSeguridad, politica: PoliticaEvento): boolean {
  if (!politica || !esEnVocabulario(politica.severidadMinima, SEVERIDADES)) return false;
  if (RANGO[e.severidad] < RANGO[politica.severidadMinima as SeveridadEvento]) return false;
  if (politica.tipos && politica.tipos.length > 0 && !politica.tipos.includes(e.tipo)) return false;
  return true;
}

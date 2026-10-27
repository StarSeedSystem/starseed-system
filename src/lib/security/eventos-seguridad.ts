// src/lib/security/eventos-seguridad.ts — (Ola 1025R · INF1025A) Eventos de seguridad SANEADOS
// hacia un orquestador de respuesta (Tracecat): sirven lo que el OS ya detecta sin filtrar nada
// de nadie. Vocabulario cerrado y «falla cerrado»; «resumen» por plantilla fija (jamás del texto
// de la entrada); «detalle» solo con las claves de la lista blanca por tipo, que DESCARTA (nunca
// enmascara) valores con forma de dato personal o clave. Módulo puro: sin red, disco ni reloj
// (entra por `ahoraMs`), sin Date.now ni Math.random. «Id» determinista («evs-» + hash FNV-1a de
// «tipo|elemento|cubo de 60 s|claves», para deduplicar en Tracecat): NO es un secreto ni identifica
// a ninguna persona.
export type TipoEventoSeguridad = "secreto-detectado" | "limite-peticiones" | "ssrf-bloqueado" | "csp-informe" | "repeticion-rechazada" | "invariante-violada" | "hallazgo-strix" | "acceso-inusual";
export type SeveridadEvento = "critica" | "alta" | "media" | "baja";
export type ElementoRed = "red" | "cuenta" | "grupo" | "pagina" | "app" | "api";

export const TIPOS_EVENTO: readonly TipoEventoSeguridad[] = ["secreto-detectado", "limite-peticiones", "ssrf-bloqueado", "csp-informe", "repeticion-rechazada", "invariante-violada", "hallazgo-strix", "acceso-inusual"];
export const SEVERIDADES_EVENTO: readonly SeveridadEvento[] = ["critica", "alta", "media", "baja"];
export const ELEMENTOS_RED: readonly ElementoRed[] = ["red", "cuenta", "grupo", "pagina", "app", "api"];
export const ORDEN_SEVERIDAD: readonly SeveridadEvento[] = ["critica", "alta", "media", "baja"];

export interface EventoSeguridad {
  version: 1; id: string; tipo: TipoEventoSeguridad; severidad: SeveridadEvento;
  elemento: ElementoRed; cuando: string; contador: number; resumen: string;
  detalle: Record<string, string | number | boolean>;
}
export interface PropuestaRespuesta { acciones: string[]; requiereHumano: boolean; motivo: string; }
export interface PoliticaSeguridad { severidadMinima: SeveridadEvento; tipos?: TipoEventoSeguridad[]; }

const RESUMEN_POR_TIPO: Record<TipoEventoSeguridad, string> = {
  "secreto-detectado": "Se ha detectado un posible secreto y se avisó sin revelar su valor.", "limite-peticiones": "Un cliente ha superado el límite de peticiones de una ruta.",
  "ssrf-bloqueado": "Se frenó una petición hacia un destino interno no permitido.", "csp-informe": "Ha llegado un informe de la política de seguridad de contenido.",
  "repeticion-rechazada": "Se rechazó una petición repetida del feed firmado.", "invariante-violada": "Se ha violado un invariante del núcleo del sistema.",
  "hallazgo-strix": "La auditoría ofensiva Strix registró un hallazgo.", "acceso-inusual": "Se ha registrado un patrón de acceso inusual.",
};
const CLAVES_POR_TIPO: Record<TipoEventoSeguridad, readonly string[]> = {
  "secreto-detectado": ["familia", "campo"], "limite-peticiones": ["ruta", "limite", "ventanaMs"],
  "ssrf-bloqueado": ["destino", "motivo"], "csp-informe": ["directiva", "violaciones"],
  "repeticion-rechazada": ["canal", "ventanaMs"], "invariante-violada": ["invariante", "ambito"],
  "hallazgo-strix": ["hallazgo", "categoria"], "acceso-inusual": ["patron", "ventanaMs"],
};
const RESPUESTA_POR_TIPO: Record<TipoEventoSeguridad, { acciones: string[]; motivo: string }> = {
  "secreto-detectado": { acciones: ["abrir un caso", "avisar a su dueña para que rote la clave"], motivo: "Revisa el origen; rotar la clave: la rota su dueña." },
  "limite-peticiones": { acciones: ["revisar el ritmo de peticiones", "abrir un caso si se repite"], motivo: "Revisa el ritmo de peticiones; si se repite, abre un caso." },
  "ssrf-bloqueado": { acciones: ["revisar el destino de la petición"], motivo: "Revisa el destino de la petición y por qué se pedía." },
  "csp-informe": { acciones: ["revisar la directiva incumplida"], motivo: "Revisa la directiva incumplida antes de relajar la política." },
  "repeticion-rechazada": { acciones: ["revisar la firma y la ventana de la petición"], motivo: "Revisa la firma y la ventana de la petición del feed." },
  "invariante-violada": { acciones: ["abrir un caso", "revisar el diseño que viola la invariante"], motivo: "Abre un caso: un invariante del núcleo no admite excepciones." },
  "hallazgo-strix": { acciones: ["revisar el hallazgo de la auditoría", "abrir un caso"], motivo: "Revisa el hallazgo de la auditoría y priorízalo por severidad." },
  "acceso-inusual": { acciones: ["revisar el patrón de acceso", "hablar con la persona implicada"], motivo: "Revisa el patrón de acceso con la persona implicada." },
};
const PREFIJOS_CLAVE = ["sk-", "ghp_", "AKIA", "eyJ"] as const;
const RE_CORREO = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RE_IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const RE_IPV6 = /^([0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}$/;
const RE_HEX_O_B64_LARGA = /^[A-Za-z0-9+/=]{24,}$/;
/** ¿Parece dato personal o clave? Correo, IPv4/IPv6, JWT («eyJ»), hex/base64 de ≥ 24 caracteres o prefijo de clave. Ante la duda, true. */
export function pareceDatoPersonal(texto: string): boolean {
  return PREFIJOS_CLAVE.some((p) => texto.startsWith(p)) || RE_CORREO.test(texto) || RE_IPV4.test(texto) || RE_IPV6.test(texto) || RE_HEX_O_B64_LARGA.test(texto);
}
/** id estable (FNV-1a doble, no criptográfico) para deduplicar en Tracecat. */
function idDeterminista(tipo: string, elemento: string, cubo: number, claves: string[]): string {
  const base = `${tipo}|${elemento}|${cubo}|${claves.sort().join(",")}`;
  const hex = [0x811c9dc5, 0x9747b28c].map((semilla) => {
    let h = semilla >>> 0;
    for (let i = 0; i < base.length; i++) h = Math.imul(h ^ base.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0");
  }).join("");
  return `evs-${hex}`;
}

function enVocabulario<T extends string>(valor: unknown, vocabulario: readonly T[]): valor is T {
  return typeof valor === "string" && (vocabulario as readonly string[]).includes(valor);
}

/** Número finito, booleano o cadena ≤ 80 sin forma de dato personal; lo demás, descartado. */
function valorSano(valor: unknown): string | number | boolean | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "boolean") return valor;
  if (typeof valor !== "string") return null;
  const corto = valor.slice(0, 80);
  return pareceDatoPersonal(corto) ? null : corto;
}

export function construirEventoSeguridad(entrada: unknown, ahoraMs: number): EventoSeguridad | null {
  if (typeof ahoraMs !== "number" || !Number.isFinite(ahoraMs)) return null;
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) return null;
  const bruto = entrada as Record<string, unknown>;
  const tipo = bruto.tipo, severidad = bruto.severidad, elemento = bruto.elemento;
  if (!enVocabulario(tipo, TIPOS_EVENTO) || !enVocabulario(severidad, SEVERIDADES_EVENTO) || !enVocabulario(elemento, ELEMENTOS_RED)) return null;
  const brutoDetalle = (typeof bruto.detalle === "object" && bruto.detalle !== null && !Array.isArray(bruto.detalle) ? bruto.detalle : {}) as Record<string, unknown>;
  const detalle: Record<string, string | number | boolean> = {};
  for (const clave of CLAVES_POR_TIPO[tipo]) {
    const valor = valorSano(brutoDetalle[clave]);
    if (valor !== null) detalle[clave] = valor;
  }
  const contador = typeof bruto.contador === "number" && Number.isInteger(bruto.contador) && bruto.contador >= 1 ? bruto.contador : 1;
  return {
    version: 1, tipo, severidad, elemento, contador, detalle,
    cuando: new Date(ahoraMs).toISOString(), resumen: RESUMEN_POR_TIPO[tipo],
    id: idDeterminista(tipo, elemento, Math.floor(ahoraMs / 60_000), Object.keys(detalle)),
  };
}

/** Propuestas en español, nunca acción automática sobre una persona (CLAUDE.md §6): cuenta, grupo y página → Círculo de Paz. */
export function proponerRespuesta(e: EventoSeguridad): PropuestaRespuesta {
  if (["cuenta", "grupo", "pagina"].includes(e.elemento)) {
    return { acciones: ["abrir un caso", "proponer un Círculo de Paz"], requiereHumano: true,
      motivo: "Hay personas implicadas: decide un Círculo de Paz; ninguna acción automática." };
  }
  const propuesta = RESPUESTA_POR_TIPO[e.tipo];
  return { acciones: propuesta.acciones, requiereHumano: false, motivo: propuesta.motivo };
}

export function politicaPermite(e: EventoSeguridad, politica: PoliticaSeguridad): boolean {
  const [minima, actual] = [ORDEN_SEVERIDAD.indexOf(politica.severidadMinima), ORDEN_SEVERIDAD.indexOf(e.severidad)];
  if (minima < 0 || actual < 0 || actual > minima) return false;
  return !(politica.tipos && politica.tipos.length > 0 && !politica.tipos.includes(e.tipo));
}

/** Mapea la severidad del escáner (scanner.ts es «use client»; no importamos su Severity). */
export function desdeSeveridadScanner(s: string): SeveridadEvento | null {
  return ({ critical: "critica", high: "alta", medium: "media", low: "baja" } as Record<string, SeveridadEvento | undefined>)[s] ?? null;
}

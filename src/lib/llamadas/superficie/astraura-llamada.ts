/**
 * Astraura dentro de la llamada (LLA1108C) — PURO. Una sola neurona genera la respuesta y se DIFUNDE por el
 * canal de datos de la llamada; cada neurona activa muestra (y, si quiere, lee en voz alta) la MISMA
 * respuesta con el mismo tono y ajustes de voz. Se deduplica por id: aunque lleguen copias por varias
 * vías, se aplica una vez. Es opt-in por llamada y por neurona: sin activar, ni se comparte contexto ni se
 * muestran respuestas.
 */

export const TIPO_ASTRAURA_LLAMADA = "astraura-llamada" as const;

export interface AjustesVozCompartidos {
  /** Id del ajuste de voz (el mismo en todas las neuronas) y tono pedido. */
  voz: string | null;
  tono: "neutro" | "cercano" | "formal";
  velocidad: number;
}

export interface RespuestaAstraura {
  k: typeof TIPO_ASTRAURA_LLAMADA;
  /** Id único de la respuesta (lo crea quien la genera). */
  id: string;
  /** Neurona que la generó. */
  de: string;
  /** Quién preguntó y qué. */
  preguntaDe: string;
  pregunta: string;
  texto: string;
  ajustes: AjustesVozCompartidos;
  /** Si el modelo fue local (privacidad). */
  local: boolean;
  en: number;
}

export interface EstadoAstraura {
  /** Esta neurona activó Astraura en la llamada (opt-in). */
  activa: boolean;
  /** Leer en voz alta (también opt-in por neurona). */
  hablar: boolean;
  vistas: string[];
  respuestas: RespuestaAstraura[];
}

export const ASTRAURA_INICIAL: EstadoAstraura = { activa: false, hablar: false, vistas: [], respuestas: [] };
const MAX_RESPUESTAS = 50;
const MAX_VISTAS = 200;

export function esRespuestaAstraura(v: unknown): v is RespuestaAstraura {
  const o = v as Record<string, unknown> | null;
  return !!o && o.k === TIPO_ASTRAURA_LLAMADA && typeof o.id === "string" && typeof o.texto === "string" && typeof o.de === "string";
}

/**
 * Recibe una respuesta difundida. Devuelve el estado y si hay que mostrarla/leerla ahora.
 * Sin opt-in se descarta (y no se recuerda: si activa después, no ve lo anterior).
 */
export function recibirRespuesta(s: EstadoAstraura, r: RespuestaAstraura): { estado: EstadoAstraura; nueva: boolean; leer: boolean } {
  if (!s.activa) return { estado: s, nueva: false, leer: false };
  if (s.vistas.includes(r.id)) return { estado: s, nueva: false, leer: false };
  const vistas = [...s.vistas, r.id].slice(-MAX_VISTAS);
  const respuestas = [...s.respuestas, r].slice(-MAX_RESPUESTAS);
  return { estado: { ...s, vistas, respuestas }, nueva: true, leer: s.hablar };
}

/**
 * ¿Quién genera? La neurona de quien pregunta, si es capaz; si no, la capaz con id menor (desempate
 * igual en todas, sin coordinador). Solo cuentan las que activaron Astraura. Local primero.
 */
export interface CandidatoGenerador {
  id: string;
  activa: boolean;
  /** Tiene modelo local o acceso a uno. */
  capaz: boolean;
  local: boolean;
}

export function elegirGenerador(quien: string, candidatos: CandidatoGenerador[]): string | null {
  const validos = candidatos.filter((c) => c.activa && c.capaz);
  if (!validos.length) return null;
  const yo = validos.find((c) => c.id === quien);
  const locales = validos.filter((c) => c.local);
  if (yo && (yo.local || !locales.length)) return yo.id;
  const pool = locales.length ? locales : validos;
  return [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0].id;
}

/** Contexto vivo que ve el panel (y que se puede dar a Astraura si todas las neuronas activas lo aceptan). */
export interface ContextoLlamada {
  tipo: string;
  participantes: string[];
  archivos: string[];
  transcripcion: Array<{ de: string; texto: string; en: number }>;
}

/** Recorta el contexto a lo que cabe en un prompt: lo más reciente primero, sin pasarse de `max` caracteres. */
export function contextoParaPrompt(c: ContextoLlamada, max = 3000): string {
  const cab = `Llamada de ${c.tipo} con ${c.participantes.join(", ") || "nadie más"}.${c.archivos.length ? ` Archivos compartidos: ${c.archivos.join(", ")}.` : ""}`;
  const lineas: string[] = [];
  let usado = cab.length;
  for (let i = c.transcripcion.length - 1; i >= 0; i--) {
    const l = `${c.transcripcion[i].de}: ${c.transcripcion[i].texto}`;
    if (usado + l.length + 1 > max) break;
    lineas.unshift(l);
    usado += l.length + 1;
  }
  return lineas.length ? `${cab}\n${lineas.join("\n")}` : cab;
}

/** Mensaje de difusión listo para el canal de datos. */
export function crearRespuesta(p: Omit<RespuestaAstraura, "k">): RespuestaAstraura {
  return { k: TIPO_ASTRAURA_LLAMADA, ...p };
}

/** Disponibilidad honesta de la transcripción en vivo. */
export function textoTranscripcion(d: { reconocedor: "local" | "navegador" | "ninguno"; activa: boolean }): string {
  if (d.reconocedor === "ninguno") return "No hay reconocimiento de voz disponible en este aparato: el panel muestra participantes, archivos y tipo de llamada, sin transcripción.";
  if (!d.activa) return "Transcripción apagada. Actívala para que Astraura entienda la conversación.";
  return d.reconocedor === "local" ? "Transcripción en vivo con reconocimiento local (el audio no sale de este aparato)." : "Transcripción en vivo con el reconocedor del navegador (puede usar un servicio externo).";
}

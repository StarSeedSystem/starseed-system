// Nodos de audio por lugar: audioguías, descripciones de zona, nodos informativos (contrato: architecture/nfc-neuronas.md §12).
// Módulo puro: sin red, disco ni Node. Preferencias del visitante: reproducir al acercarse, preguntar o no; idioma; volumen; guardar en Biblioteca.

export const TIPO_AUDIO = ["audioguia", "descripcion_zona", "nodo_informativo"] as const;
export type TipoAudio = (typeof TIPO_AUDIO)[number];

export const MODO_REPRODUCCION = ["al_acercarse", "preguntar", "no_reproducir"] as const;
export type ModoReproduccion = (typeof MODO_REPRODUCCION)[number];

export const VOLUMEN_DEFECTO = 0.7;
export const IDIOMA_DEFECTO = "es";

export interface ConfigAudioNodo {
  version: 1;
  tipo: TipoAudio;
  titulo: string;
  /** Ruta interna, data: URL, o enlace https. Nunca contiene claves. */
  audioUrl: string;
  /** Duración en segundos (> 0). */
  duracionSegundos: number;
  /** Idioma principal del audio (código ISO, ej. "es", "en-US"). */
  idioma: string;
  /** Volumen 0–1. */
  volumen: number;
  /** Textos alternativos por idioma (clave = código ISO). */
  traducciones?: Record<string, string>;
  /** Metadatos adicionales (autor, museo, zona, etc.). */
  metadatos?: Record<string, string>;
}

export interface PreferenciasAudioVisitante {
  modo?: ModoReproduccion;
  idioma?: string;
  volumen?: number;
  /** Si true, al reproducir se ofrece guardar en la Biblioteca. */
  guardarEnBiblioteca?: boolean;
}

export interface PreferenciasAudioResueltas {
  modo: ModoReproduccion;
  idioma: string;
  volumen: number;
  guardarEnBiblioteca: boolean;
}

export interface AudioDisponible {
  url: string;
  /** Código ISO del idioma de este archivo. */
  idioma: string;
  tamanoBytes: number;
  /** True si el audio vive en el propio nodo (data: URL o archivo embebido). */
  enNodo: boolean;
  /** True si ya se descargó en el dispositivo del visitante. */
  descargado?: boolean;
}

export type ResultadoConfigAudio =
  | { ok: true; config: ConfigAudioNodo }
  | { ok: false; errores: string[] };

const esTexto = (x: unknown): x is string => typeof x === "string";
const incluye = <T extends string>(lista: readonly T[], x: unknown): x is T => esTexto(x) && (lista as readonly string[]).includes(x);

function idiomaValido(codigo: string): boolean {
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(codigo);
}

function audioUrlValida(url: string): boolean {
  if (url.length === 0 || url.length > 500 || /[\s<>"]/.test(url)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return /^https?:\/\//i.test(url) || /^data:audio\//i.test(url);
  return true;
}

export function configAudioPorDefecto(tipo: TipoAudio = "audioguia"): ConfigAudioNodo {
  return {
    version: 1,
    tipo,
    titulo: "Audio sin título",
    audioUrl: "/audio/placeholder.mp3",
    duracionSegundos: 60,
    idioma: IDIOMA_DEFECTO,
    volumen: VOLUMEN_DEFECTO,
  };
}

export function validarConfigAudio(x: unknown): ResultadoConfigAudio {
  const errores: string[] = [];
  if (typeof x !== "object" || x === null) return { ok: false, errores: ["La configuración no tiene forma de objeto."] };
  const o = x as Record<string, unknown>;

  if (o.version !== 1) errores.push("Versión de configuración no admitida.");
  if (!incluye(TIPO_AUDIO, o.tipo)) errores.push("Tipo de audio desconocido (audioguia, descripcion_zona, nodo_informativo).");

  const titulo = esTexto(o.titulo) ? o.titulo.trim() : "";
  if (titulo.length === 0 || titulo.length > 80) errores.push("El título debe tener entre 1 y 80 caracteres.");

  if (!esTexto(o.audioUrl) || !audioUrlValida(o.audioUrl)) {
    errores.push("La URL de audio no es válida (ruta interna, data: URL o enlace https).");
  }

  const duracion = typeof o.duracionSegundos === "number" && Number.isFinite(o.duracionSegundos) ? o.duracionSegundos : -1;
  if (duracion <= 0) errores.push("La duración debe ser un número positivo (segundos).");

  if (!esTexto(o.idioma) || !idiomaValido(o.idioma)) {
    errores.push("El idioma debe ser un código ISO válido (ej. 'es', 'en-US').");
  }

  const volumen = typeof o.volumen === "number" && Number.isFinite(o.volumen) ? o.volumen : -1;
  if (volumen < 0 || volumen > 1) errores.push("El volumen debe estar entre 0 y 1.");

  if (o.traducciones !== undefined) {
    if (typeof o.traducciones !== "object" || o.traducciones === null) {
      errores.push("Las traducciones deben ser un objeto.");
    } else {
      for (const [k, v] of Object.entries(o.traducciones)) {
        if (!idiomaValido(k)) errores.push(`Código de idioma inválido en traducciones: ${k}.`);
        if (!esTexto(v)) errores.push(`Traducción para ${k} debe ser texto.`);
      }
    }
  }

  if (o.metadatos !== undefined && (typeof o.metadatos !== "object" || o.metadatos === null)) {
    errores.push("Los metadatos deben ser un objeto.");
  }

  if (errores.length > 0) return { ok: false, errores };

  const config: ConfigAudioNodo = {
    version: 1,
    tipo: o.tipo as TipoAudio,
    titulo,
    audioUrl: o.audioUrl as string,
    duracionSegundos: duracion,
    idioma: o.idioma as string,
    volumen,
  };
  if (o.traducciones) config.traducciones = o.traducciones as Record<string, string>;
  if (o.metadatos) config.metadatos = o.metadatos as Record<string, string>;

  return { ok: true, config };
}

export function resolverPreferenciasAudio(
  config: ConfigAudioNodo,
  visitante?: PreferenciasAudioVisitante
): PreferenciasAudioResueltas {
  const modo = visitante?.modo && incluye(MODO_REPRODUCCION, visitante.modo) ? visitante.modo : "preguntar";
  const idioma = visitante?.idioma && idiomaValido(visitante.idioma) ? visitante.idioma : config.idioma;
  const volumen =
    typeof visitante?.volumen === "number" && visitante.volumen >= 0 && visitante.volumen <= 1
      ? visitante.volumen
      : config.volumen;
  const guardarEnBiblioteca = visitante?.guardarEnBiblioteca === true;

  return { modo, idioma, volumen, guardarEnBiblioteca };
}

export function audioDisponibleOffline(audio: AudioDisponible): boolean {
  if (audio.enNodo) return true;
  return audio.descargado === true;
}

export function filtrarAudioPorIdioma(audios: AudioDisponible[], idioma: string): AudioDisponible[] {
  if (!idiomaValido(idioma)) return [];
  const exactas = audios.filter((a) => a.idioma === idioma);
  if (exactas.length > 0) return exactas;
  const prefijo = idioma.split("-")[0];
  return audios.filter((a) => a.idioma.startsWith(prefijo + "-"));
}

export function tipoAudioValido(t: string): t is TipoAudio {
  return incluye(TIPO_AUDIO, t);
}

export function modoReproduccionValido(m: string): m is ModoReproduccion {
  return incluye(MODO_REPRODUCCION, m);
}
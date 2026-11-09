/**
 * Matriz de controles de la llamada (LLA1108G) — PURA. Regla: NINGÚN botón muerto. Para cada control, según el
 * tipo de llamada, el medio por el que va y el aparato (plataforma y capacidades del motor web), dice si
 * funciona y, si no, POR QUÉ en una frase que la persona entiende y que la superficie enseña en el botón.
 * La tabla documentada vive en `architecture/llamadas-telefonia.md` §10 y la fijan los tests.
 */
import type { TipoSuperficie } from "./maquina";
import { MAX_PARTICIPANTES } from "@/lib/llamadas/tipos";

export type ClaseMedioLlamada = "webrtc" | "enlace-datos" | "bluetooth" | null;

export type ControlId =
  | "micro"
  | "salida-audio"
  | "espera"
  | "camara"
  | "girar-camara"
  | "pantalla"
  | "tipo-voz"
  | "tipo-video"
  | "tipo-pantalla"
  | "tipo-vivo"
  | "invitar"
  | "medio"
  | "grabar"
  | "astraura"
  | "pip"
  | "completa"
  | "chat"
  | "reacciones"
  | "colgar-todos"
  | "calidad";

export const CONTROLES: readonly ControlId[] = [
  "micro", "salida-audio", "espera", "camara", "girar-camara", "pantalla", "tipo-voz", "tipo-video", "tipo-pantalla", "tipo-vivo",
  "invitar", "medio", "grabar", "astraura", "pip", "completa", "chat", "reacciones", "colgar-todos", "calidad",
];

export interface EntornoLlamada {
  /** Hay getDisplayMedia (escritorio; falta en el WebView de Android). */
  pantalla: boolean;
  /** Android con WebView (sin compartir pantalla). */
  androidWebView: boolean;
  /** App de Mac (WKWebView): `getDisplayMedia` solo si el sistema lo ofrece. */
  macWebView?: boolean;
  /** Teléfono o tableta (cámara frontal/trasera). */
  movil: boolean;
  /** Cámaras detectadas (0 = ninguna o aún sin permiso). */
  camaras: number;
  pip: boolean;
  pantallaCompleta: boolean;
  /** El navegador deja elegir la salida de audio (`setSinkId`). */
  setSinkId: boolean;
  /** Rutas de audio del teléfono (auricular, altavoz, Bluetooth…). */
  rutasNativas: number;
  /** Hay `MediaRecorder`. */
  grabadora: boolean;
}

export interface ContextoMatriz {
  /** Tipo en el que está la llamada ahora. */
  tipo: TipoSuperficie;
  medio: ClaseMedioLlamada;
  entorno: EntornoLlamada;
  /** Personas en la llamada (yo incluido). */
  personas: number;
  camaraEncendida: boolean;
  pantallaCompartida: boolean;
  /** Hay vídeo remoto que sacar en imagen en imagen. */
  hayVideoRemoto: boolean;
  /** Soy quien creó la llamada (puede terminarla para todos). */
  soyCreador: boolean;
  /** La llamada está viva (conectada o en espera). */
  viva: boolean;
  /** (LLA1108H) Hay vídeo ligero por el enlace de datos: la cámara funciona por Bluetooth, en baja resolución. */
  videoLigero?: boolean;
  /** (LLA1108H) La llamada sabe pedir sola el Wi-Fi directo (la pantalla irá por él). */
  escalaWifi?: boolean;
}

export interface Disponibilidad {
  ok: boolean;
  /** Por qué no (solo si `ok` es false). */
  motivo?: string;
}

const si: Disponibilidad = { ok: true };
const no = (motivo: string): Disponibilidad => ({ ok: false, motivo });

export const MOTIVO_VIDEO_BLUETOOTH = "El vídeo no cabe por Bluetooth: cambia a Wi‑Fi o red local.";
export const MOTIVO_VIDEO_DATOS = "El vídeo no cabe por el enlace de datos: la voz va por él, pero la imagen necesita Wi‑Fi o red local.";
export const MOTIVO_PANTALLA_BLUETOOTH = "La pantalla no cabe por Bluetooth: se abre sola por Wi‑Fi directo (sin router) si lo permites; también sirve la red local.";
export const MOTIVO_PANTALLA_ANDROID = "Android no deja compartir la pantalla desde la app (su motor web no lo ofrece). Compártela desde un ordenador o desde el navegador.";
export const MOTIVO_PANTALLA_MAC = "El motor web de la app de Mac no ofrece compartir la pantalla en este sistema. Compártela desde el navegador (Chrome o Safari) o desde otro ordenador.";
export const MOTIVO_PANTALLA_NAVEGADOR = "Este navegador no permite compartir la pantalla.";
export const MOTIVO_EN_VIVO = "La transmisión en vivo se empieza desde el chat con una sala en vivo; no se puede activar a mitad de una llamada.";

/** ¿Puede el medio actual llevar vídeo/pantalla? */
export function medioLlevaVideo(medio: ClaseMedioLlamada): Disponibilidad {
  if (medio === "bluetooth") return no(MOTIVO_VIDEO_BLUETOOTH);
  if (medio === "enlace-datos") return no(MOTIVO_VIDEO_DATOS);
  return si;
}

function motivoPantalla(c: ContextoMatriz): Disponibilidad {
  if (!c.entorno.pantalla) return no(c.entorno.androidWebView ? MOTIVO_PANTALLA_ANDROID : c.entorno.macWebView ? MOTIVO_PANTALLA_MAC : MOTIVO_PANTALLA_NAVEGADOR);
  // (LLA1108H) La pantalla no cabe por Bluetooth ni por el enlace de datos, pero si la llamada pide sola el Wi-Fi directo lo dice.
  if (c.medio === "bluetooth" && c.escalaWifi) return no(MOTIVO_PANTALLA_BLUETOOTH);
  return medioLlevaVideo(c.medio);
}

function motivoCamara(c: ContextoMatriz): Disponibilidad {
  // (LLA1108H) Con vídeo ligero la cámara SÍ va por Bluetooth o por el enlace de datos, en baja resolución.
  if ((c.medio === "bluetooth" || c.medio === "enlace-datos") && c.videoLigero) return si;
  const v = medioLlevaVideo(c.medio);
  if (!v.ok) return v;
  // Sin cámaras listadas NO se bloquea: algunos navegadores no las enumeran hasta dar permiso, y al encenderla el
  // aparato dice el motivo real (permiso, cámara ocupada…).
  return si;
}

/** Disponibilidad de UN control. */
export function disponibilidad(id: ControlId, c: ContextoMatriz): Disponibilidad {
  if (!c.viva && id !== "completa") return no("La llamada aún no está conectada.");
  switch (id) {
    case "micro":
    case "espera":
    case "chat":
    case "reacciones":
    case "calidad":
    case "completa":
    case "astraura":
    case "medio":
      return si;
    case "salida-audio":
      return c.entorno.rutasNativas > 0 || c.entorno.setSinkId ? si : no("Este navegador no deja elegir la salida de audio; se usa la del sistema.");
    case "camara":
      return c.pantallaCompartida ? no("Deja de compartir la pantalla para encender la cámara.") : motivoCamara(c);
    case "girar-camara":
      if (c.entorno.camaras < 2) return no("Solo hay una cámara en este aparato.");
      return c.camaraEncendida ? si : no("Enciende la cámara para girarla.");
    case "pantalla":
      return motivoPantalla(c);
    case "tipo-voz":
      return c.tipo === "voz" ? no("Ya estás en una llamada de voz.") : si;
    case "tipo-video":
      return c.tipo === "video" ? no("Ya estás en una videollamada.") : motivoCamara(c);
    case "tipo-pantalla":
      return c.tipo === "pantalla" ? no("Ya estás compartiendo pantalla.") : motivoPantalla(c);
    case "tipo-vivo":
      return no(MOTIVO_EN_VIVO);
    case "invitar":
      if (c.medio === "bluetooth") return no("Por Bluetooth solo se habla de dos en dos: cambia a Wi‑Fi o red local para sumar gente.");
      if (c.personas >= MAX_PARTICIPANTES) return no(`La llamada está completa (${MAX_PARTICIPANTES} personas).`);
      return si;
    case "grabar":
      return c.entorno.grabadora ? si : no("Este aparato no puede grabar (le falta la grabadora del navegador).");
    case "pip":
      if (!c.entorno.pip) return no("Este navegador no permite imagen en imagen.");
      return c.hayVideoRemoto ? si : no("Aún no hay vídeo de la otra persona para sacar en imagen en imagen.");
    case "colgar-todos":
      if (c.personas <= 2) return no("En una llamada de dos, colgar ya la termina para los dos.");
      return c.soyCreador ? si : no("Solo quien empezó la llamada puede terminarla para todos.");
  }
}

export function matrizControles(c: ContextoMatriz): Record<ControlId, Disponibilidad> {
  const out = {} as Record<ControlId, Disponibilidad>;
  for (const id of CONTROLES) out[id] = disponibilidad(id, c);
  return out;
}

/** Lo que enseña la vista: solo los controles desactivados, con su motivo. */
export function motivosDesactivados(c: ContextoMatriz): Partial<Record<ControlId, string>> {
  const m = matrizControles(c);
  const out: Partial<Record<ControlId, string>> = {};
  for (const id of CONTROLES) if (!m[id].ok && m[id].motivo) out[id] = m[id].motivo;
  return out;
}

/** El medio de la vista del motor → clase para la matriz. */
export function claseMedio(e: { medio?: { tipo: "webrtc" | "enlace-datos"; texto: string } | null; videoNoDisponible?: string | null }): ClaseMedioLlamada {
  if (e.videoNoDisponible) return "bluetooth";
  if (!e.medio) return null;
  if (e.medio.tipo === "enlace-datos") return /bluetooth/i.test(e.medio.texto) ? "bluetooth" : "enlace-datos";
  return "webrtc";
}

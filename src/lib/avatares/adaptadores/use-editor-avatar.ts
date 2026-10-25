"use client";

/**
 * Avatares 3D · EDITOR EN TIEMPO REAL (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3 y §12.
 *
 * Todo pasa por cambios pequeños (`CambioAvatar`): los deslizadores, el dictado, un mando MIDI y Astraura
 * producen el MISMO formato. Aquí se aplican al instante en tu pantalla, se agrupan por clave para los demás
 * presentes (nunca si no hay nadie), y se guardan tras 5 s de calma y como mucho cada 30 s en el almacén de
 * AV1011D. Sin red propia, sin sondeos y sin claves.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MORFOLOGIA, type AdnAvatar, type Morfologia, type SlotPieza,
} from "../adn/adn";
import {
  CALMA_GUARDADO_MS, ENTRE_GUARDADOS_MS, aplicarCambio, crearColaEnvio, debeGuardar, diffAdn,
  encolar, intervaloEnvioMs, lote, sanearCambio, type CambioAvatar,
} from "../adn/cambios";
import { cambiosDesdeFrase } from "../adn/dictado";
import { saveAdnToLibrary } from "./almacen-adn";
import { isDictationSupported, startDictation, type DictationHandle } from "@/lib/aurora/dictation";
import {
  aplicarCurva, claveFuente, normalizar01, type Vinculo,
} from "@/lib/protomolecula/vinculos-control";
import {
  conectarMidi, hayMidi, pedirAccesoMidi,
  type AccesoMidi, type MensajeMidi, type NavegadorMidi,
} from "@/lib/protomolecula/adaptador-midi";
import type { AstrauraChatRequest } from "@/ai/astraura/router";
import type { ChatResponse } from "@/ai/providers/types";

export type FnChat = (req: AstrauraChatRequest) => Promise<ChatResponse>;

/** Pieza de la Biblioteca que se puede poner en una ranura. `ref` SIEMPRE `biblioteca:` o `genesis:`. */
export interface PiezaBiblioteca {
  ref: string;
  nombre: string;
  slot: SlotPieza;
}

export interface DependenciasEditor {
  /** Guardado real: por defecto, el almacén de AV1011D (`saveAdnToLibrary`). */
  guardar?: (adn: AdnAvatar) => Promise<void>;
  /** Astraura. `null` = no hay modelo en este aparato y se dice; `undefined` = se intenta el router del OS. */
  chat?: FnChat | null;
  dictar?: typeof startDictation;
  dictadoSoportado?: () => boolean;
  navegadorMidi?: NavegadorMidi | null;
  /** Cambios que viajan a los demás presentes. Sin este aviso no se emite nada. */
  alEmitir?: (cambios: readonly CambioAvatar[]) => void;
  /** Mapeo ya existente de la Protomolécula (si lo hay) para los mandos. */
  vinculos?: readonly Vinculo[];
}

export interface OpcionesEditor {
  adnInicial: AdnAvatar;
  dependencias?: DependenciasEditor;
  /** Cuántas personas más están mirando (número o función que lo consulta en vivo). */
  otrosPresentes?: number | (() => number);
  /** Reloj inyectable para las pruebas. */
  ahora?: () => number;
}

const MAX_PILA = 50;
const ATOMO_AVATAR = "avatar";

/** Acepta una morfología por su id o por «morfologia.<id>» (los vínculos de la Protomolécula usan ambas). */
export function morfologiaDeParametro(id: string): Morfologia | null {
  const limpio = id.startsWith("morfologia.") ? id.slice("morfologia.".length) : id;
  return (MORFOLOGIA as readonly string[]).includes(limpio) ? (limpio as Morfologia) : null;
}

/** Texto de Astraura → lista de `CambioAvatar` válidos. Solo una lista JSON; lo demás se descarta. */
export function cambiosDeRespuesta(texto: string): CambioAvatar[] {
  const limpio = texto.replace(/```(?:json)?/gi, "").trim();
  const ini = limpio.indexOf("["), fin = limpio.lastIndexOf("]");
  if (ini < 0 || fin <= ini) return [];
  let datos: unknown;
  try { datos = JSON.parse(limpio.slice(ini, fin + 1)); } catch { return []; }
  if (!Array.isArray(datos)) return [];
  return datos.map(sanearCambio).filter((c): c is CambioAvatar => c !== null).slice(0, 24);
}

/** La instrucción es cerrada a propósito: el modelo solo elige operaciones que el ADN entiende. */
export const INSTRUCCION_ASTRAURA =
  "Eres el intérprete del editor de avatares de StarSeed OS. Devuelve SOLO una lista JSON (un array), " +
  "sin texto alrededor ni bloques de código, con los cambios que pide la frase. Cada cambio es un objeto " +
  "con una de estas formas exactas: {\"op\":\"morfologia\",\"clave\":\"altura|complexion|cabeza|hombros|cintura|piernas|brazos|estilizado\",\"valor\":0..1}, " +
  "{\"op\":\"material\",\"slot\":\"piel|cabello|ojos|ropa-1|ropa-2|acento|aura\",\"campo\":\"color|metal|rugosidad|emisivo\",\"valor\":...}, " +
  "{\"op\":\"expresion\",\"clave\":\"neutral|happy|angry|sad|relaxed|surprised|aa|ih|ou|ee|oh|blink|blinkLeft|blinkRight|lookUp|lookDown|lookLeft|lookRight\",\"valor\":0..1}, " +
  "{\"op\":\"aura\",\"campo\":\"tono|intensidad|ligadaEmocion\",\"valor\":...}, " +
  "{\"op\":\"movimiento\",\"campo\":\"energia|amplitud|ritmo|postura\",\"valor\":0..1}, " +
  "{\"op\":\"visibilidad\",\"valor\":\"privado|grupo|publico\"}. " +
  "No inventes piezas, URLs ni referencias externas. Si no puedes expresarlo con esas operaciones, devuelve [].";

const chatDelOS: FnChat = async (req) => (await import("@/ai/astraura/router")).astrauraChat(req);

type Timer = ReturnType<typeof setTimeout>;

export interface UseEditorAvatar {
  adn: AdnAvatar;
  aplicar: (cambios: CambioAvatar | readonly CambioAvatar[]) => void;
  deshacer: () => void;
  rehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  guardarAhora: () => Promise<void>;
  cerrar: () => Promise<void>;
  estado: "limpio" | "sin-guardar" | "guardando" | "guardado" | "error";
  error: string | null;
  aviso: string | null;
  pensando: boolean;
  frase: (texto: string) => Promise<void>;
  dictar: () => void;
  escuchando: boolean;
  dictadoDisponible: boolean;
  transcrito: string;
  midiDisponible: boolean;
  midiConectado: boolean;
  midiEstado: string | null;
  mapeoProtomolecula: boolean;
  deslizadorMidi: Morfologia;
  fijarDeslizadorMidi: (m: Morfologia) => void;
  conectarMidi: () => Promise<void>;
}

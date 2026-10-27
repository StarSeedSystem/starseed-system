"use client";

/**
 * Editor del avatar en tiempo real (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * El ADN se ve al instante en tu pantalla; los cambios se agrupan y solo salen a los demás
 * presentes si hay alguien mirando (10 Hz como mucho, menos con mucha gente). Se guarda en el
 * almacén de AV1011D tras 5 s de calma y como mucho cada 30 s, o al cerrar el editor.
 *
 * La voz pasa primero por el dictado sin modelo (`cambiosDesdeFrase`). Lo que no entiende se
 * manda a Astraura con una instrucción que pide SOLO una lista JSON de `CambioAvatar`; la
 * respuesta se filtra con `sanearCambio`. Si no hay modelo, se dice, no se finge.
 *
 * El núcleo (`crearEditorAvatar`) es puro salvo por las funciones inyectadas (reloj, guardado,
 * envío y Astraura), así que se puede probar con reloj falso sin red ni disco.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { EXPRESIONES, MORFOLOGIA, adnPorDefecto, type AdnAvatar, type Morfologia } from "../adn/adn";
import {
  aplicarCambio, crearColaEnvio, debeGuardar, diffAdn, encolar, lote,
  sanearCambio, type CambioAvatar,
} from "../adn/cambios";
import { cambiosDesdeFrase } from "../adn/dictado";
import { eventoDeLinea } from "@/lib/astraura/conversacion-rapida";

export const TOPE_HISTORIAL = 50;
export const INTERVALO_LATIDO_MS = 1_000;

export interface DependenciasEditor {
  /** Guardado en el almacén de AV1011D. Sin esta función se usa `saveAdnToLibrary`. */
  guardar?: (adn: AdnAvatar) => void | Promise<void>;
  /** Emisión a los demás presentes (escena, sala o XR). */
  emitir?: (cambios: readonly CambioAvatar[]) => void;
  /** Cuántas personas están mirando ahora mismo (0 = nadie: no se emite). */
  otrosPresentes?: () => number;
  /** Pregunta a Astraura; devuelve su texto o `null` si no hay modelo disponible. */
  preguntarAstraura?: (instruccion: string) => Promise<string | null>;
  /** Mapeo de la Protomolécula: CC de MIDI → deslizador. Si falta, el CC va al deslizador elegido. */
  mapeoMidi?: () => Readonly<Record<number, Morfologia>> | undefined;
  ahora?: () => number;
}

export interface InstantaneaEditor {
  adn: AdnAvatar;
  deshacer: AdnAvatar[];
  rehacer: AdnAvatar[];
  sinGuardar: boolean;
  guardando: boolean;
  aviso: string | null;
  deslizador: Morfologia;
}

export interface ResultadoVoz {
  aplicados: number;
  sinEntender: string[];
  aviso: string | null;
}

export interface EditorAvatar {
  estado: () => InstantaneaEditor;
  aplicar: (cambio: CambioAvatar, ahora?: number) => AdnAvatar;
  deshacer: (ahora?: number) => boolean;
  rehacer: (ahora?: number) => boolean;
  voz: (frase: string) => Promise<ResultadoVoz>;
  latido: (ahora?: number) => void;
  cerrar: (ahora?: number) => Promise<void>;
  aplicarMidi: (cc: number, valor: number, ahora?: number) => boolean;
  fijarDeslizador: (clave: Morfologia) => void;
  limpiarAviso: () => void;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ahoraMs = (): number => Date.now();

/** Guardado real en el almacén de AV1011D, importado solo cuando hace falta (sin red al cargar). */
async function guardarPorDefecto(adn: AdnAvatar): Promise<void> {
  const { saveAdnToLibrary } = await import("./almacen-adn");
  await saveAdnToLibrary(adn, adn.visibilidad);
}

function trozoJson(texto: string): string | null {
  const limpio = texto.replace(/```(?:json)?/gi, "").trim();
  const ini = limpio.indexOf("["), fin = limpio.lastIndexOf("]");
  if (ini >= 0 && fin > ini) return limpio.slice(ini, fin + 1);
  return null;
}

/**
 * Respuesta de Astraura → cambios válidos. Acepta una lista JSON o un objeto `{ cambios: [...] }`;
 * todo lo que no pase `sanearCambio` se descarta. PURA.
 */
export function cambiosDeJsonAstraura(texto: string): CambioAvatar[] {
  const crudo = trozoJson(texto);
  if (!crudo) return [];
  let datos: unknown;
  try { datos = JSON.parse(crudo); } catch { return []; }
  const lista = Array.isArray(datos) ? datos : esObjeto(datos) && Array.isArray(datos.cambios) ? datos.cambios : [datos];
  return lista.slice(0, 64).map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
}

/** Instrucción que pide a Astraura SOLO una lista JSON de `CambioAvatar`, con el mismo formato del dictado. */
export function peticionCambiosAstraura(trozos: readonly string[], adn: AdnAvatar): string {
  const resumen = {
    base: adn.base,
    esqueleto: adn.esqueleto,
    morfologia: adn.morfologia,
    materiales: adn.materiales,
    piezas: adn.piezas.map((p) => ({ slot: p.slot, ref: p.ref })),
    aura: adn.aura,
    movimiento: adn.movimiento,
  };
  return [
    "Eres Astraura, la inteligencia de StarSeed OS, traduciendo frases de una persona a cambios de su avatar 3D.",
    "Devuelve SOLO una lista JSON, sin markdown, sin explicación y sin texto alrededor.",
    `Frases que el dictado no entendió: ${trozos.join(" | ").slice(0, 400)}`,
    "Cada elemento debe ser uno de estos formatos exactos:",
    '{"op":"morfologia","clave":"altura|complexion|cabeza|hombros|cintura|piernas|brazos|estilizado","valor":0..1}',
    '{"op":"material","slot":"piel|cabello|ojos|ropa-1|ropa-2|acento|aura","campo":"color|metal|rugosidad|emisivo","valor":"#rrggbb" o 0..1}',
    '{"op":"pieza","slot":"cabeza|cabello|torso|piernas|cara|pies|manos|accesorio-1|espalda|accesorio-2|mascota","ref":"biblioteca:..." o null}',
    `{"op":"expresion","clave":"${EXPRESIONES.join("|")}","valor":0..1}`,
    '{"op":"aura","campo":"tono|intensidad|ligadaEmocion","valor":número o booleano}',
    '{"op":"movimiento","campo":"energia|amplitud|ritmo|postura","valor":0..1}',
    '{"op":"visibilidad","valor":"privado|grupo|publico"}',
    "Las piezas solo pueden usar referencias internas que empiecen por «biblioteca:». Nunca inventes una URL externa.",
    `Avatar actual: ${JSON.stringify(resumen)}`,
  ].join("\n");
}

/** Un mensaje MIDI (CC) → cambio de morfología. Sin mapeo de la Protomolécula va al deslizador elegido. PURA. */
export function cambioMidi(
  cc: number,
  valor: number,
  deslizador: Morfologia,
  mapeo?: Readonly<Record<number, Morfologia>>,
): CambioAvatar | null {
  if (!Number.isFinite(cc) || cc < 0 || cc > 127 || !Number.isFinite(valor)) return null;
  const clave = mapeo?.[Math.round(cc)] ?? deslizador;
  return { op: "morfologia", clave, valor: Math.min(1, Math.max(0, valor / 127)) };
}

/** Pregunta a Astraura por el carril de conversación del OS. Devuelve `null` si no hay modelo o no contesta. */
export async function preguntarAAstraura(instruccion: string): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  const control = typeof AbortController !== "undefined" ? new AbortController() : null;
  const temporizador = control ? setTimeout(() => control.abort(), 8_000) : null;
  try {
    const r = await fetch("/api/astraura/conversacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: instruccion, historial: [], persona: { id: "astraura", nombre: "Astraura" } }),
      ...(control ? { signal: control.signal } : {}),
    });
    if (!r.ok || !r.body) return null;
    const lector = r.body.getReader(), dec = new TextDecoder();
    let resto = "", texto = "";
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const lineas = resto.split("\n");
      resto = lineas.pop() ?? "";
      for (const linea of lineas) {
        const evento = eventoDeLinea(linea);
        if (!evento) continue;
        if (evento.t === "token") texto += evento.v;
        if (evento.t === "error") return null;
      }
    }
    return texto.trim() || null;
  } catch {
    return null;
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

const textoDeError = (e: unknown): string => (e instanceof Error ? e.message : "error desconocido");

/** Crea la sesión del editor. `alCambiar` avisa a React (o a nadie, en las pruebas puras). */
export function crearEditorAvatar(opciones: {
  adn: AdnAvatar;
  guardar?: (adn: AdnAvatar) => void | Promise<void>;
  emitir?: (cambios: readonly CambioAvatar[]) => void;
  otrosPresentes?: () => number;
  preguntarAstraura?: (instruccion: string) => Promise<string | null>;
  mapeoMidi?: () => Readonly<Record<number, Morfologia>> | undefined;
  ahora?: () => number;
  alCambiar?: () => void;
}): EditorAvatar {
  const reloj = opciones.ahora ?? ahoraMs;
  const cola = crearColaEnvio();
  const deshacerPila: AdnAvatar[] = [], rehacerPila: AdnAvatar[] = [];
  let adn = opciones.adn;
  let sinGuardar = false, guardando = false;
  let ultimoCambio = Number.NEGATIVE_INFINITY, ultimoGuardado = Number.NEGATIVE_INFINITY;
  let aviso: string | null = null;
  let deslizador: Morfologia = MORFOLOGIA[0];
  const avisar = () => opciones.alCambiar?.();

  const empujar = (pila: AdnAvatar[], valor: AdnAvatar) => {
    pila.push(valor);
    if (pila.length > TOPE_HISTORIAL) pila.splice(0, pila.length - TOPE_HISTORIAL);
  };

  const registrar = (siguiente: AdnAvatar, cambios: readonly CambioAvatar[], ahora: number) => {
    if (siguiente === adn) return;
    adn = siguiente;
    sinGuardar = true;
    ultimoCambio = ahora;
    for (const cambio of cambios) {
      const limpio = sanearCambio(cambio);
      if (limpio) encolar(cola, limpio);
    }
    avisar();
  };

  async function guardarAhora(ahora: number): Promise<void> {
    if (guardando) return;
    guardando = true;
    const guardado = adn;
    try {
      await (opciones.guardar ?? guardarPorDefecto)(guardado);
      ultimoGuardado = ahora;
      if (adn === guardado) sinGuardar = false;
      aviso = null;
    } catch (e) {
      aviso = `No se pudo guardar el avatar: ${textoDeError(e)}`;
    } finally {
      guardando = false;
      avisar();
    }
  }

  function aplicar(cambio: CambioAvatar, ahora = reloj()): AdnAvatar {
    const limpio = sanearCambio(cambio);
    if (!limpio) return adn;
    const siguiente = aplicarCambio(adn, limpio);
    if (siguiente === adn || diffAdn(adn, siguiente).length === 0) return adn;
    empujar(deshacerPila, adn);
    rehacerPila.length = 0;
    registrar(siguiente, [limpio], ahora);
    return adn;
  }

  function restaurar(destino: AdnAvatar, ahora: number): boolean {
    const cambios = diffAdn(adn, destino);
    if (cambios.length === 0) return false;
    const siguiente: AdnAvatar = { ...destino, rev: adn.rev + 1 };
    registrar(siguiente, cambios, ahora);
    return true;
  }

  function deshacer(ahora = reloj()): boolean {
    const previo = deshacerPila.pop();
    if (!previo) return false;
    empujar(rehacerPila, adn);
    const ok = restaurar(previo, ahora);
    if (!ok) { empujar(deshacerPila, previo); rehacerPila.pop(); }
    return ok;
  }

  function rehacer(ahora = reloj()): boolean {
    const siguiente = rehacerPila.pop();
    if (!siguiente) return false;
    empujar(deshacerPila, adn);
    const ok = restaurar(siguiente, ahora);
    if (!ok) { empujar(rehacerPila, siguiente); deshacerPila.pop(); }
    return ok;
  }

  function latido(ahora = reloj()): void {
    const otros = opciones.otrosPresentes?.() ?? 0;
    const salida = lote(cola, ahora, otros);
    if (salida && salida.length) opciones.emitir?.(salida);
    if (debeGuardar({ sinGuardar, ultimoCambio, ultimoGuardado, ahora, cerrando: false })) {
      void guardarAhora(ahora);
    }
  }

  async function cerrar(ahora = reloj()): Promise<void> {
    if (debeGuardar({ sinGuardar, ultimoCambio, ultimoGuardado, ahora, cerrando: true })) {
      await guardarAhora(ahora);
    }
  }

  async function voz(frase: string): Promise<ResultadoVoz> {
    const { cambios, sinEntender } = cambiosDesdeFrase(frase, adn);
    for (const cambio of cambios) aplicar(cambio);
    if (sinEntender.length === 0) {
      aviso = null;
      avisar();
      return { aplicados: cambios.length, sinEntender, aviso };
    }
    if (!opciones.preguntarAstraura) {
      aviso = "Astraura no está disponible en este equipo: no se pudo traducir lo que el dictado no entendió.";
      avisar();
      return { aplicados: cambios.length, sinEntender, aviso };
    }
    let texto: string | null = null;
    try { texto = await opciones.preguntarAstraura(peticionCambiosAstraura(sinEntender, adn)); } catch { texto = null; }
    const delModelo = texto ? cambiosDeJsonAstraura(texto) : [];
    if (!texto) {
      aviso = "Astraura no respondió (no hay modelo disponible ahora mismo): se aplicó solo lo que entendió el dictado.";
      avisar();
      return { aplicados: cambios.length, sinEntender, aviso };
    }
    if (delModelo.length === 0) {
      aviso = "Astraura respondió, pero no devolvió cambios de avatar válidos: no se aplicó nada de lo que no se entendió.";
      avisar();
      return { aplicados: cambios.length, sinEntender, aviso };
    }
    for (const cambio of delModelo) aplicar(cambio);
    aviso = null;
    avisar();
    return { aplicados: cambios.length + delModelo.length, sinEntender, aviso };
  }

  function aplicarMidi(cc: number, valor: number, ahora = reloj()): boolean {
    const cambio = cambioMidi(cc, valor, deslizador, opciones.mapeoMidi?.());
    if (!cambio) return false;
    aplicar(cambio, ahora);
    return true;
  }

  return {
    estado: () => ({ adn, deshacer: [...deshacerPila], rehacer: [...rehacerPila], sinGuardar, guardando, aviso, deslizador }),
    aplicar, deshacer, rehacer, voz, latido, cerrar, aplicarMidi,
    fijarDeslizador: (clave) => { deslizador = clave; avisar(); },
    limpiarAviso: () => { aviso = null; avisar(); },
  };
}

/** Hook del editor: la sesión vive en un `useRef` y el reloj late una vez por segundo. */
export function useEditorAvatar(adnInicial: AdnAvatar, deps: DependenciasEditor = {}) {
  const depsVivas = useRef(deps);
  depsVivas.current = deps;
  const [, forzar] = useReducer((n: number) => n + 1, 0);
  const vivo = useRef(true);
  const editorRef = useRef<EditorAvatar | null>(null);
  if (!editorRef.current) {
    editorRef.current = crearEditorAvatar({
      adn: adnInicial,
      alCambiar: () => { if (vivo.current) forzar(); },
      ahora: () => depsVivas.current.ahora?.() ?? ahoraMs(),
      guardar: (adn) => depsVivas.current.guardar?.(adn) ?? guardarPorDefecto(adn),
      emitir: (cambios) => depsVivas.current.emitir?.(cambios),
      otrosPresentes: () => depsVivas.current.otrosPresentes?.() ?? 0,
      preguntarAstraura: (instruccion) => depsVivas.current.preguntarAstraura?.(instruccion) ?? Promise.resolve(null),
      mapeoMidi: () => depsVivas.current.mapeoMidi?.(),
    });
  }
  const editor = editorRef.current;
  useEffect(() => {
    vivo.current = true;
    const tic = setInterval(() => editor.latido(), INTERVALO_LATIDO_MS);
    return () => {
      vivo.current = false;
      clearInterval(tic);
      void editor.cerrar();
    };
  }, [editor]);
  const aplicar = useCallback((cambio: CambioAvatar) => editor.aplicar(cambio), [editor]);
  const deshacer = useCallback(() => editor.deshacer(), [editor]);
  const rehacer = useCallback(() => editor.rehacer(), [editor]);
  const voz = useCallback((frase: string) => editor.voz(frase), [editor]);
  const aplicarMidi = useCallback((cc: number, valor: number) => editor.aplicarMidi(cc, valor), [editor]);
  const fijarDeslizador = useCallback((clave: Morfologia) => editor.fijarDeslizador(clave), [editor]);
  const limpiarAviso = useCallback(() => editor.limpiarAviso(), [editor]);
  const { deshacer: pilaDeshacer, rehacer: pilaRehacer, ...estado } = editor.estado();
  return {
    ...estado, pilaDeshacer, pilaRehacer,
    puedeDeshacer: pilaDeshacer.length > 0, puedeRehacer: pilaRehacer.length > 0,
    aplicar, deshacer, rehacer, voz, aplicarMidi, fijarDeslizador, limpiarAviso,
  };
}

/** ADN de partida útil para una demo o un dueño nuevo. */
export const adnEditorVacio = (deu: AdnAvatar["dueno"]): AdnAvatar => adnPorDefecto("adn-editor", "Avatar", deu);

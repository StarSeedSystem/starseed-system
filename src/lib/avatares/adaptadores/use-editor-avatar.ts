"use client";

/**
 * Editor del avatar en tiempo real (AV1011B · architecture/astraura-avatares-3d.md §3).
 *
 * Todo lo que se toca (deslizador, color, pieza, voz, MIDI, Astraura) produce el MISMO
 * `CambioAvatar` y pasa por `aplicarCambio`: en pantalla se ve al instante, sin red. A los demás
 * presentes se les manda por la cola de `cambios.ts` (agrupada y con tope de Hz, NUNCA si no hay
 * nadie más) y al almacén de AV1011D solo cuando `debeGuardar` lo permite (5 s de calma, 30 s entre
 * guardados). Deshacer/rehacer guarda ADN enteros (tope 50). Aquí no se sondea ni se escribe en
 * Supabase: el guardado real lo hace el adaptador del almacén.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MORFOLOGIA,
  type AdnAvatar,
  type Morfologia,
  type SlotMaterial,
  type SlotPieza,
} from "../adn/adn";
import {
  aplicarCambio,
  crearColaEnvio,
  debeGuardar,
  diffAdn,
  encolar,
  lote,
  sanearCambio,
  type CambioAvatar,
  type ColaEnvio,
} from "../adn/cambios";
import { cambiosDesdeFrase, normalizar } from "../adn/dictado";
import { saveAdnToLibrary } from "./almacen-adn";
import { cargarVinculos, PREFIJO_VINCULOS } from "@/lib/protomolecula/almacen-vinculos";
import type { Vinculo } from "@/lib/protomolecula/vinculos-control";

export const TOPE_PILA = 50;
export const TIC_MS = 100;

export interface EstadoEditorAvatar {
  adn: AdnAvatar;
  pilaDeshacer: AdnAvatar[];
  pilaRehacer: AdnAvatar[];
  cola: ColaEnvio;
  ultimoCambio: number;
  ultimoGuardado: number;
  sinGuardar: boolean;
}

export interface OpcionesEditorAvatar {
  adnInicial: AdnAvatar;
  /** Personas que están viendo el avatar además de ti. 0 = nadie: no se emite nada. */
  otrosPresentes?: number;
  /** Reloj inyectable (pruebas con reloj falso). */
  ahora?: () => number;
  /** Guardado real; por defecto, el almacén de AV1011D. */
  guardar?: (adn: AdnAvatar) => Promise<void>;
  /** Viaje a los demás presentes; sin él no se envía nada (no se finge una sala). */
  emitir?: (cambios: readonly CambioAvatar[], adn: AdnAvatar) => void;
  /** Traducción de lo que no entiende el dictado; null = no hay modelo disponible. */
  traducir?: (instruccion: string) => Promise<string | null>;
}

export interface ResultadoDictado {
  aplicados: CambioAvatar[];
  sinEntender: string[];
  aviso: string | null;
}

const copiarCola = (c: ColaEnvio): ColaEnvio => ({
  pendientes: new Map(c.pendientes),
  ultimoEnvio: c.ultimoEnvio,
});

export function estadoEditorInicial(adn: AdnAvatar, ahora = 0): EstadoEditorAvatar {
  return {
    adn,
    pilaDeshacer: [],
    pilaRehacer: [],
    cola: crearColaEnvio(),
    ultimoCambio: ahora,
    ultimoGuardado: -Infinity,
    sinGuardar: false,
  };
}

/* ── Voz y texto: instrucción para Astraura y lectura de su respuesta ───────── */

const OPS_VALIDAS =
  'morfologia {clave, valor 0…1}, material {slot, campo, valor}, pieza {slot, ref "biblioteca:…" o null, tinte}, ' +
  'expresion {clave, valor 0…1}, aura {campo tono|intensidad|ligadaEmocion, valor}, ' +
  'movimiento {campo energia|amplitud|ritmo|postura, valor}, nombre {valor}, visibilidad {valor}.';

/** Lo que se le pide a Astraura: SOLO la lista JSON, sin explicación ni markdown. */
export function instruccionAstraura(sinEntender: readonly string[], adn: AdnAvatar): string {
  const estado = {
    morfologia: adn.morfologia,
    materiales: adn.materiales,
    expresiones: adn.expresionBase,
    aura: adn.aura,
    movimiento: adn.movimiento,
  };
  const frases = [...new Set(sinEntender.map((t) => normalizar(t)))].filter(Boolean);
  return [
    "Eres el traductor del editor de avatares de StarSeed OS.",
    "Devuelve SOLO una lista JSON de cambios de avatar, sin texto, sin markdown y sin explicaciones.",
    'Formato: [{"op":"morfologia","clave":"altura","valor":0.8},{"op":"aura","campo":"tono","valor":45}]',
    `Operaciones válidas: ${OPS_VALIDAS}`,
    "Los colores son #rrggbb. Las referencias de pieza solo pueden ser internas, «biblioteca:…» o «genesis:…».",
    `Frases que el dictado no entendió: ${frases.map((t) => `«${t}»`).join(", ")}.`,
    `Estado actual del avatar: ${JSON.stringify(estado)}`,
    "Si una frase no se puede expresar con esas operaciones, no la inventes: omítela.",
  ].join("\n");
}

/** Respuesta del modelo → cambios válidos. Acepta una lista o `{ cambios: […] }`; lo demás se descarta. */
export function cambiosDeRespuesta(texto: string): CambioAvatar[] {
  const i = texto.indexOf("["), j = texto.lastIndexOf("]");
  if (i < 0 || j <= i) return [];
  let datos: unknown;
  try {
    datos = JSON.parse(texto.slice(i, j + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  // `sanearCambio` es la única puerta: lo que el modelo invente se tira.
  return datos.map((c) => sanearCambio(c)).filter((c): c is CambioAvatar => c !== null);
}

/* ── MIDI: mapeo de la Protomolécula y CC → deslizador ─────────────────────── */

/** Vínculos de la Protomolécula → { número de CC: deslizador }. Solo cuenta un objetivo `avatar.<clave>` o la clave sola. */
export function mapeoMidiDeVinculos(vinculos: readonly Vinculo[]): Record<number, Morfologia> {
  const mapa: Record<number, Morfologia> = {};
  for (const v of vinculos) {
    const f = v.fuente;
    if (f.tipo !== "midi" || f.mensaje !== "cc" || typeof f.numero !== "number") continue;
    const clave = v.objetivo.parametroId.replace(/^avatar[./]/, "");
    if ((MORFOLOGIA as readonly string[]).includes(clave)) mapa[f.numero] = clave as Morfologia;
  }
  return mapa;
}

/** Un CC (0…127) → cambio del deslizador mapeado o, si no hay mapeo, del que se eligió en el panel. */
export function cambioDesdeCc(
  cc: number,
  valor: number,
  mapa: Readonly<Record<number, Morfologia>>,
  elegido: Morfologia,
): CambioAvatar {
  return {
    op: "morfologia",
    clave: mapa[cc] ?? elegido,
    valor: Math.min(1, Math.max(0, (Number.isFinite(valor) ? valor : 0) / 127)),
  };
}

/** Lee una vez los vínculos guardados de TODAS las moléculas de este aparato (sin red y sin bucle). */
export function vinculosDelAparato(almacen: Pick<Storage, "key" | "length" | "getItem"> | null): Vinculo[] {
  if (!almacen) return [];
  const out: Vinculo[] = [];
  try {
    for (let i = 0; i < almacen.length; i++) {
      const k = almacen.key(i);
      if (!k || !k.startsWith(PREFIJO_VINCULOS)) continue;
      out.push(...cargarVinculos(almacen, k.slice(PREFIJO_VINCULOS.length)));
    }
  } catch {
    return out;
  }
  return out;
}

/* ── Dictado: primero sin red; lo que no se entiende, a Astraura ───────────── */

export const SIN_MODELO = "Ahora no hay ningún modelo disponible para entender esa parte.";

export interface Traduccion {
  cambios: CambioAvatar[];
  /** Frases que siguen sin entenderse (vacío si el modelo las resolvió todas). */
  quedan: string[];
  aviso: string | null;
}

/** Lo que no entiende el dictado local → cambios de Astraura (o un aviso honesto si no hay modelo). */
export async function traducirSinEntender(
  sinEntender: readonly string[],
  adn: AdnAvatar,
  traducir: ((instruccion: string) => Promise<string | null>) | undefined,
): Promise<Traduccion> {
  if (sinEntender.length === 0) return { cambios: [], quedan: [], aviso: null };
  const frases = `«${sinEntender.join("», «")}»`;
  if (!traducir) return { cambios: [], quedan: [...sinEntender], aviso: `${SIN_MODELO} No se aplicó: ${frases}.` };
  let respuesta: string | null = null;
  try {
    respuesta = await traducir(instruccionAstraura(sinEntender, adn));
  } catch {
    respuesta = null;
  }
  if (!respuesta) return { cambios: [], quedan: [...sinEntender], aviso: `${SIN_MODELO} Astraura no respondió; no se aplicó: ${frases}.` };
  const cambios = cambiosDeRespuesta(respuesta);
  if (cambios.length === 0) return { cambios: [], quedan: [...sinEntender], aviso: `Astraura respondió, pero sin cambios válidos para ${frases}.` };
  return { cambios, quedan: [], aviso: null };
}

/** Traductor por defecto: el turno en vivo de Astraura (local primero y nube gratuita de respaldo). */
export async function traducirConAstraura(instruccion: string): Promise<string | null> {
  try {
    const r = await fetch("/api/astraura/conversacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: instruccion, historial: [], persona: { id: "editor-avatar", nombre: "Astraura" } }),
    });
    if (!r.ok || !r.body) return null;
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    let resto = "", texto = "";
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const lineas = resto.split("\n");
      resto = lineas.pop() ?? "";
      for (const l of lineas) {
        const s = l.startsWith("data:") ? l.slice(5).trim() : "";
        if (!s) continue;
        try {
          const e = JSON.parse(s) as { t?: string; v?: string };
          if (e.t === "token" && typeof e.v === "string") texto += e.v;
          if (e.t === "fin" || e.t === "error") return texto.trim() || null;
        } catch { /* línea incompleta: se ignora */ }
      }
    }
    return texto.trim() || null;
  } catch {
    return null;
  }
}

/* ── Hook del editor ───────────────────────────────────────────────────────── */

export type EstadoMidi =
  | { estado: "inactivo" }
  | { estado: "conectando" }
  | { estado: "conectado"; dispositivos: string[]; mapeo: Record<number, Morfologia>; fuente: "protomolecula" | "web-midi" }
  | { estado: "error"; motivo: string };

export interface EditorAvatar {
  adn: AdnAvatar;
  rev: number;
  aplicar: (cambio: CambioAvatar) => AdnAvatar;
  aplicarVarios: (cambios: readonly CambioAvatar[]) => AdnAvatar;
  deshacer: () => boolean;
  rehacer: () => boolean;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  pendientes: number;
  sinGuardar: boolean;
  aviso: string | null;
  limpiarAviso: () => void;
  dictar: (frase: string) => Promise<ResultadoDictado>;
  ultimoDictado: ResultadoDictado | null;
  cerrar: () => Promise<void>;
  deslizadorMidi: Morfologia;
  fijarDeslizadorMidi: (m: Morfologia) => void;
  midiSoportado: boolean | null;
  estadoMidi: EstadoMidi;
  conectarMidi: () => Promise<void>;
  desconectarMidi: () => void;
}

const guardarEnAlmacen = (adn: AdnAvatar): Promise<void> =>
  saveAdnToLibrary(adn, adn.visibilidad).then(() => undefined);

export function useEditorAvatar(opciones: OpcionesEditorAvatar): EditorAvatar {
  const { adnInicial } = opciones;
  const [estado, setEstado] = useState<EstadoEditorAvatar>(() => estadoEditorInicial(adnInicial, (opciones.ahora ?? Date.now)()));
  const estadoRef = useRef(estado);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ultimoDictado, setUltimoDictado] = useState<ResultadoDictado | null>(null);
  const [elegido, setElegido] = useState<Morfologia>(opciones.deslizadorMidi ?? MORFOLOGIA[0]);
  const elegidoRef = useRef(elegido);
  elegidoRef.current = elegido;
  const [midiSoportado, setMidiSoportado] = useState<boolean | null>(null);
  const [estadoMidi, setEstadoMidi] = useState<EstadoMidi>({ estado: "inactivo" });
  const desconectarRef = useRef<(() => void) | null>(null);

  const cbRef = useRef({ otros: opciones.otrosPresentes ?? 0, ahora: opciones.ahora ?? Date.now, guardar: opciones.guardar ?? guardarEnAlmacen, emitir: opciones.emitir });
  cbRef.current = { otros: opciones.otrosPresentes ?? 0, ahora: opciones.ahora ?? Date.now, guardar: opciones.guardar ?? guardarEnAlmacen, emitir: opciones.emitir };

  const fijar = useCallback((nuevo: EstadoEditorAvatar) => {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }, []);

  // Si el dueño cambia de avatar, el editor parte del nuevo (no mezcla dos ADN).
  const idInicial = useRef(adnInicial.id);
  useEffect(() => {
    if (idInicial.current === adnInicial.id) return;
    idInicial.current = adnInicial.id;
    fijar(estadoEditorInicial(adnInicial, cbRef.current.ahora()));
  }, [adnInicial, fijar]);

  const aplicarVarios = useCallback((cambios: readonly CambioAvatar[]): AdnAvatar => {
    const prev = estadoRef.current;
    const cola = copiarCola(prev.cola);
    let adn = prev.adn, n = 0;
    for (const c of cambios) {
      const siguiente = aplicarCambio(adn, c);
      if (siguiente === adn) continue;
      adn = siguiente;
      encolar(cola, c);
      n++;
    }
    if (n === 0) return prev.adn;
    fijar({
      ...prev,
      adn,
      pilaDeshacer: [...prev.pilaDeshacer, prev.adn].slice(-TOPE_PILA),
      pilaRehacer: [],
      cola,
      ultimoCambio: cbRef.current.ahora(),
      sinGuardar: true,
    });
    return adn;
  }, [fijar]);

  const aplicar = useCallback((cambio: CambioAvatar): AdnAvatar => aplicarVarios([cambio]), [aplicarVarios]);

  const deshacer = useCallback((): boolean => {
    const prev = estadoRef.current;
    const anterior = prev.pilaDeshacer[prev.pilaDeshacer.length - 1];
    if (!anterior) return false;
    // Deshacer TAMBIÉN es un cambio: la revisión sube para que el almacén no la rechace por vieja.
    const adn: AdnAvatar = { ...anterior, rev: prev.adn.rev + 1 };
    const cola = copiarCola(prev.cola);
    for (const c of diffAdn(prev.adn, adn)) encolar(cola, c);
    fijar({
      ...prev,
      adn,
      pilaDeshacer: prev.pilaDeshacer.slice(0, -1),
      pilaRehacer: [...prev.pilaRehacer, prev.adn].slice(-TOPE_PILA),
      cola,
      ultimoCambio: cbRef.current.ahora(),
      sinGuardar: true,
    });
    return true;
  }, [fijar]);

  const rehacer = useCallback((): boolean => {
    const prev = estadoRef.current;
    const siguiente = prev.pilaRehacer[prev.pilaRehacer.length - 1];
    if (!siguiente) return false;
    const adn: AdnAvatar = { ...siguiente, rev: prev.adn.rev + 1 };
    const cola = copiarCola(prev.cola);
    for (const c of diffAdn(prev.adn, adn)) encolar(cola, c);
    fijar({
      ...prev,
      adn,
      pilaDeshacer: [...prev.pilaDeshacer, prev.adn].slice(-TOPE_PILA),
      pilaRehacer: prev.pilaRehacer.slice(0, -1),
      cola,
      ultimoCambio: cbRef.current.ahora(),
      sinGuardar: true,
    });
    return true;
  }, [fijar]);

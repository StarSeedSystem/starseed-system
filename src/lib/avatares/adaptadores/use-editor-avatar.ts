"use client";
/**
 * Avatares 3D · EDITOR DEL AVATAR EN TIEMPO REAL (AV1011B).
 * Contrato: architecture/astraura-avatares-3d.md §3 (tres velocidades) y §12 (almacén de AV1011D).
 *
 * Un solo núcleo de estado (`crearEditorAvatar`, puro e injectable) y un React hook delgado encima.
 * Cada entrada (deslizador, color, voz, MIDI, Astraura) produce el MISMO `CambioAvatar` del módulo
 * `adn/cambios.ts`; el núcleo lo aplica al instante con `aplicarCambio`, guarda pila de deshacer
 * (tope 50), agrupa y emite con `encolar`/`lote` SOLO si hay otras personas presentes, y decide el
 * guardado con `debeGuardar` (5 s de calma, 30 s entre guardados, guardar al cerrar).
 * La red, el disco y el reloj van INYECTADOS: aquí arriba no hay fetch, ni localStorage, ni reloj.
 */
import { useEffect, useRef, useState } from "react";
import { EXPRESIONES, MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA, type AdnAvatar, type EstiloMovimiento, type Expresion, type Morfologia, type SlotMaterial, type SlotPieza } from "@/lib/avatares/adn/adn";
import {
  crearColaEnvio, encolar, lote, debeGuardar,
  aplicarCambio, diffAdn, sanearCambio,
  type CambioAvatar,
} from "@/lib/avatares/adn/cambios";
import { cambiosDesdeFrase } from "@/lib/avatares/adn/dictado";
import type { Vinculo } from "@/lib/protomolecula/vinculos-control";

/* ── Etiquetas en español (un solo sitio para la UI y la instrucción a Astraura) ── */

export const ETIQUETAS_MORFOLOGIA: Record<Morfologia, string> = {
  altura: "Altura", complexion: "Complexión", cabeza: "Cabeza", hombros: "Hombros",
  cintura: "Cintura", piernas: "Piernas", brazos: "Brazos", estilizado: "Estilizado",
};
export const ETIQUETAS_MOVIMIENTO: Record<keyof EstiloMovimiento, string> = {
  energia: "Energía", amplitud: "Amplitud", ritmo: "Ritmo", postura: "Postura",
};
export const ETIQUETAS_MATERIAL: Record<SlotMaterial, string> = {
  piel: "Piel", cabello: "Cabello", ojos: "Ojos", "ropa-1": "Ropa de arriba",
  "ropa-2": "Ropa de abajo", acento: "Acento", aura: "Aura",
};
export const ETIQUETAS_PIEZA: Record<SlotPieza, string> = {
  cabeza: "Cabeza", cabello: "Cabello", torso: "Torso", piernas: "Piernas", cara: "Cara",
  pies: "Pies", manos: "Manos", "accesorio-1": "Accesorio 1", espalda: "Espalda",
  "accesorio-2": "Accesorio 2", mascota: "Mascota",
};
/** Las seis emociones de la cara base de VRM 1.0 (la expresión base del ADN). */
export const EMOCIONES: readonly Expresion[] = ["neutral", "happy", "sad", "angry", "relaxed", "surprised"];
export const ETIQUETAS_EXPRESION: Record<Expresion, string> = {
  neutral: "Neutral", happy: "Feliz", angry: "Enfadada", sad: "Triste",
  relaxed: "Relajada", surprised: "Sorprendida", aa: "Aa", ih: "Ih", ou: "Ou", ee: "Ee", oh: "Oh",
  blink: "Parpadeo", blinkLeft: "Parpadeo izquierdo", blinkRight: "Parpadeo derecho",
  lookUp: "Mirada arriba", lookDown: "Mirada abajo", lookLeft: "Mirada a la izquierda", lookRight: "Mirada a la derecha",
};

/* ── MIDI: qué control del mando mueve qué deslizador ── */

export type ClaveControl = `morfologia:${Morfologia}` | `movimiento:${keyof EstiloMovimiento}` | "aura:intensidad";
export type MapeoMidi = Record<number, ClaveControl>;

const CLAVES_CONTROL: readonly ClaveControl[] = [
  ...(Object.keys(ETIQUETAS_MORFOLOGIA) as Morfologia[]).map((k) => `morfologia:${k}` as ClaveControl),
  ...(Object.keys(ETIQUETAS_MOVIMIENTO) as Array<keyof EstiloMovimiento>).map((k) => `movimiento:${k}` as ClaveControl),
  "aura:intensidad",
];

/** Texto (de un parámetro de la Protomolécula o elegido en la interfaz) → clave, o `null` si no existe. */
export function claveControlDe(t: unknown): ClaveControl | null {
  if (typeof t !== "string") return null;
  const k = t.toLowerCase();
  return (CLAVES_CONTROL as readonly string[]).includes(k) ? (k as ClaveControl) : null;
}

export const etiquetaControl = (c: ClaveControl): string =>
  c === "aura:intensidad" ? "Brillo del aura" : c.startsWith("morfologia:") ? ETIQUETAS_MORFOLOGIA[c.slice(11) as Morfologia] : ETIQUETAS_MOVIMIENTO[c.slice(11) as keyof EstiloMovimiento];

/** Toda la lista, para que la interfaz la ofrezca a elegir en el deslizador MIDI. */
export const CONTROLES_MIDI = CLAVES_CONTROL;

/** Valor bruto de un CC (0–127) → cambio del ADN para la clave elegida. PURO. */
export function cambioDeMidi(bruto: number, clave: ClaveControl): CambioAvatar {
  const v = Math.round((Math.min(127, Math.max(0, bruto)) / 127) * 100) / 100;
  if (clave === "aura:intensidad") return { op: "aura", campo: "intensidad", valor: v };
  if (clave.startsWith("morfologia:")) return { op: "morfologia", clave: clave.slice(11) as Morfologia, valor: v };
  return { op: "movimiento", campo: clave.slice(11) as keyof EstiloMovimiento, valor: v };
}

/** Si la Protomolécula ya tiene mapeo de controles, se usa: CC → deslizador cuando el nombre encaja. PURO. */
export function mapeoDeVinculos(vs: readonly Vinculo[]): MapeoMidi {
  const out: MapeoMidi = {};
  for (const v of vs) {
    if (v.fuente.tipo !== "midi" || v.fuente.mensaje !== "cc" || !v.fuente.numero || !v.activo) continue;
    const clave = claveControlDe(v.objetivo.parametroId.toLowerCase());
    if (clave) out[v.fuente.numero] = clave;
  }
  return out;
}

/* ── Astraura: lo que el dictado no entendió va al modelo, que trae cambios del MISMO formato ── */

/** La instrucción pide SOLO una lista JSON de `CambioAvatar` (contrato §3.3); nada de prosa. */
export function instruccionAstraura(frases: readonly string[], adn: AdnAvatar): string {
  const formas = [
    `{"op":"morfologia","clave":"<una de: ${MORFOLOGIA.join(", ")}>","valor":<0 a 1>}`,
    `{"op":"material","slot":"<uno de: ${SLOTS_MATERIAL.join(", ")}>","campo":"color","valor":"#rrggbb"}`,
    `{"op":"pieza","slot":"<uno de: ${SLOTS_PIEZA.join(", ")}>","ref":"biblioteca:<id>"}`,
    `{"op":"expresion","clave":"<una de: ${EXPRESIONES.join(", ")}>","valor":<0 a 1>}`,
    `{"op":"aura","campo":"<tono | intensidad | ligadaEmocion>","valor":<tono 0-360, o 0-1, o true/false>}`,
    `{"op":"movimiento","campo":"<energia | amplitud | ritmo | postura>","valor":<0 a 1>}`,
  ].join(" · ");
  return `Convierte las frases dichas por una persona a cambios de SU avatar (revisión ${adn.rev}). `
    + `Responde ÚNICAMENTE con una lista JSON; cada elemento es un objeto con esta forma: ${formas}. `
    + `Nada de explicaciones fuera del JSON. Frases: ${frases.map((f) => `"${f}"`).join("; ")}`;
}

/** Extrae la lista JSON de una respuesta del modelo (puede venir con prosa alrededor) y la filtra con `sanearCambio`. PURO. */
export function cambiosDeRespuestaAstraura(respuesta: unknown): { cambios: CambioAvatar[]; descartados: number } {
  let crudos: unknown;
  if (typeof respuesta === "string" && respuesta.trim()) {
    crudos = listaJsonDe(respuesta);
  } else if (respuesta && typeof respuesta === "object" && Array.isArray((respuesta as { cambios?: unknown[] }).cambios)) {
    crudos = (respuesta as { cambios: unknown[] }).cambios;
  } else {
    crudos = typeof respuesta === "object" || (typeof respuesta === "string" && respuesta.trim()) ? respuesta : null;
  }
  if (!Array.isArray(crudos)) return { cambios: [], descartados: 1 };
  const cambios = crudos.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
  return { cambios, descartados: crudos.length - cambios.length };
}

function listaJsonDe(t: string): unknown {
  const trozo = t.slice(t.indexOf("["), t.lastIndexOf("]") + 1);
  if (!trozo) return null;
  try { return JSON.parse(trozo); } catch { return null; }
}

/* ── Núcleo del editor puro e inyectable ── */

export const TOPE_PILA = 50;

export interface DepsEditor {
  /** Reloj (inyectado: en pruebas un contador a mano). */
  ahora?: () => number;
  /** Almacén de AV1011D (`saveAdnToLibrary`); si falta, no se guarda en disco. */
  guardar?: (adn: AdnAvatar) => Promise<unknown> | unknown;
  /** Canal de la escena compartida (los demás presentes). Nunca pide red por su cuenta. */
  emitir?: (cambios: CambioAvatar[]) => void;
  /** Modelo que traduce lo no entendido (Astraura). Devolver `null` = sin modelo disponible. */
  pedirAstraura?: (instruccion: string) => Promise<unknown>;
  /** Cuántas personas miran además de esta (0 = no se emite nada). */
  otrosPresentes?: () => number;
  /** Mapeo ya existente de la Protomolécula: si hay, se usa y no se pide aprender de nuevo. */
  vinculosProtomolecula?: readonly Vinculo[];
}

export interface EstadoEditor {
  adn: AdnAvatar;
  sinGuardar: boolean;
  guardando: boolean;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  sinEntender: readonly string[];
  mapeoMidi: MapeoMidi;
  /** Mensaje honesto del último intento (sin modelo, fallo de guardado…). */
  nota: string | null;
}

export interface EditorAvatar {
  id: string;
  estado(): EstadoEditor;
  /** Aplica al instante (pantalla) y encola para los demás. `false` = el cambio no cabe en el ADN. */
  aplicar(cambio: CambioAvatar): boolean;
  deshacer(): boolean;
  rehacer(): boolean;
  /** Dictado sin modelo (§3.3): lo entendido se aplica; el resto queda en `sinEntender`. */
  dictar(frase: string): { cambios: number; sinEntender: readonly string[] };
  /** Lo pendiente va a Astraura y vuelve como cambios del mismo formato, filtrados con `sanearCambio`. */
  preguntarAstraura(): Promise<{ ok: boolean; cambios: number; motivo?: string }>;
  /** Un mando MIDI movido a su mapeo mueve su deslizador. `false` = CC sin ninguna clave asignada. */
  midi(cc: number, bruto: number): boolean;
  fijaMidi(cc: number, clave: ClaveControl | null): void;
  /** Pulso de una latido local: emite si hay quien mira y decide si toca guardar. Llámarlo ~2 veces por segundo. */
  tic(): { emitidos: CambioAvatar[] | null; guardo: boolean };
  /** Guardado al cerrar el editor (siempre que haya algo sin guardar). */
  cerrar(): Promise<{ ok: boolean; motivo?: string }>;
  suscribir(alCambiar: () => void): () => void;
}

export function crearEditorAvatar(adn: AdnAvatar, deps: DepsEditor = {}): EditorAvatar {
  const ahora = deps.ahora ?? (() => Date.now());
  const oyentes = new Set<() => void>();
  const cola = crearColaEnvio();
  let actual = adn;
  let pasado: AdnAvatar[] = [];
  let futuro: AdnAvatar[] = [];
  let sinGuardar = false;
  let guardando = false;
  let ultimoCambio = -Infinity;
  let ultimoGuardado = -Infinity; // solo el ritmo limita entre guardados; el primero vale tras la calma
  let sinEntender: string[] = [];
  let mapeo: MapeoMidi = deps.vinculosProtomolecula ? mapeoDeVinculos(deps.vinculosProtomolecula) : {};
  let nota: string | null = null;
  const avisar = () => { for (const f of [...oyentes]) f(); };

  const aplicarInterno = (limpio: CambioAvatar): void => {
    pasado = [...pasado, actual].slice(-TOPE_PILA);
    actual = aplicarCambio(actual, limpio);
    futuro = [];
    encolar(cola, limpio);
    sinGuardar = true;
    ultimoCambio = ahora();
    avisar();
  };

  const guardarAhora = (): { ok: boolean; motivo?: string } => {
    if (guardando || !sinGuardar || !deps.guardar) return { ok: false, motivo: "No hay almacén de ADN en este editor." };
    guardando = true;
    try {
      const r = deps.guardar(actual) as unknown;
      // Sin guardar en local aún: si el almacén es asíncrono y falla, se vuelve a marcar y se dirá.
      sinGuardar = false;
      if (r && typeof (r as Promise<unknown>).then === "function") {
        void Promise.resolve(r as Promise<unknown>)
          .then(() => { ultimoGuardado = ahora(); nota = null; })
          .catch((e: unknown) => {
            sinGuardar = true;
            nota = `No se pudo guardar el avatar: ${e instanceof Error ? e.message : "error desconocido"}.`;
          })
          .finally(() => { guardando = false; avisar(); });
      } else {
        guardando = false;
        ultimoGuardado = ahora();
        nota = null;
      }
      avisar();
      return { ok: true };
    } catch (e) {
      guardando = false;
      nota = `No se pudo guardar el avatar: ${e instanceof Error ? e.message : "error desconocido"}.`;
      avisar();
      return { ok: false, motivo: nota };
    }
  };

  const tic = () => {
    const loteAhora = lote(cola, ahora(), deps.otrosPresentes?.() ?? 0);
    if (loteAhora) { try { deps.emitir?.(loteAhora); } catch { nota = "No se pudo enviar el cambio a las demás personas presentes."; } }
    const guardo = deps.guardar ? debeGuardarGuardando() : false;
    avisar();
    return { emitidos: loteAhora, guardo };
  };

  const debeGuardarGuardando = (): boolean => {
    if (guardando || !sinGuardar) return false;
    if (!debeGuardar({ sinGuardar, ultimoCambio, ultimoGuardado, ahora: ahora(), cerrando: false })) return false;
    return guardarAhora().ok;
  };

  const estado = (): EstadoEditor => ({
    adn: actual, sinGuardar, guardando,
    puedeDeshacer: pasado.length > 0, puedeRehacer: futuro.length > 0,
    sinEntender: [...sinEntender], mapeoMidi: { ...mapeo }, nota,
  });

  const deshacer = (): boolean => {
    if (!pasado.length) return false;
    const previo = pasado[pasado.length - 1];
    const inverso = diffAdn(actual, previo);
    futuro = [...futuro, actual];
    actual = previo;
    pasado = pasado.slice(0, -1);
    sinGuardar = true;
    ultimoCambio = ahora();
    for (const c of inverso) encolar(cola, c);
    avisar();
    return true;
  };

  const rehacer = (): boolean => {
    if (!futuro.length) return false;
    const previo = actual;
    const proximo = futuro[futuro.length - 1];
    futuro = futuro.slice(0, -1);
    pasado = [...pasado, previo].slice(-TOPE_PILA);
    actual = proximo;
    sinGuardar = true;
    ultimoCambio = ahora();
    for (const c of diffAdn(previo, proximo)) encolar(cola, c);
    avisar();
    return true;
  };

  const dictar = (frase: string): { cambios: number; sinEntender: readonly string[] } => {
    const r = cambiosDesdeFrase(frase, actual);
    for (const c of r.cambios) {
      const limpio = sanearCambio(c);
      if (limpio) aplicarInterno(limpio);
    }
    sinEntender = [...sinEntender, ...r.sinEntender];
    avisar();
    return { cambios: r.cambios.length, sinEntender: [...r.sinEntender] };
  };

  const preguntarAstraura = async (): Promise<{ ok: boolean; cambios: number; motivo?: string }> => {
    if (sinEntender.length === 0) return { ok: true, cambios: 0 };
    if (!deps.pedirAstraura) {
      nota = "Sin modelo disponible: nadie puede traducir esas frases ahora mismo. Se quedan apuntadas.";
      avisar();
      return { ok: false, cambios: 0, motivo: nota };
    }
    try {
      const respuesta = await deps.pedirAstraura(instruccionAstraura(sinEntender, actual));
      if (respuesta == null) {
        nota = "Sin modelo disponible: nadie puede traducir esas frases ahora mismo. Se quedan apuntadas.";
        avisar();
        return { ok: false, cambios: 0, motivo: nota };
      }
      const { cambios, descartados } = cambiosDeRespuestaAstraura(respuesta);
      if (cambios.length === 0) {
        nota = "El modelo no devolvió ningún cambio válido para el ADN del avatar.";
        avisar();
        return { ok: false, cambios: 0, motivo: nota };
      }
      for (const c of cambios) aplicarInterno(c);
      sinEntender = [];
      nota = descartados > 0 ? `Entendí ${cambios.length} cambio(s) del modelo; descarté ${descartados} que no caben en el ADN.` : null;
      avisar();
      return { ok: true, cambios: cambios.length };
    } catch (e) {
      nota = `Falló la consulta al modelo: ${e instanceof Error ? e.message : "error desconocido"}.`;
      avisar();
      return { ok: false, cambios: 0, motivo: nota };
    }
  };

  const midi = (cc: number, bruto: number): boolean => {
    const clave = mapeo[cc];
    if (!clave || !Number.isFinite(bruto)) return false;
    const limpio = sanearCambio(cambioDeMidi(bruto, clave));
    if (!limpio) return false;
    aplicarInterno(limpio);
    return true;
  };

  const fijaMidi = (cc: number, clave: ClaveControl | null): void => {
    const nuevo = { ...mapeo };
    if (clave === null) delete nuevo[cc]; else nuevo[cc] = clave;
    mapeo = nuevo;
    avisar();
  };

  const cerrar = async (): Promise<{ ok: boolean; motivo?: string }> => {
    if (!sinGuardar || !deps.guardar) return { ok: true };
    return guardarAhora();
  };

  return {
    id: adn.id,
    estado,
    aplicar: (cambio) => {
      const limpio = sanearCambio(cambio);
      if (!limpio) return false;
      aplicarInterno(limpio);
      return true;
    },
    deshacer, rehacer, dictar, preguntarAstraura, midi, fijaMidi, tic, cerrar,
    suscribir: (alCambiar) => {
      oyentes.add(alCambiar);
      return () => { oyentes.delete(alCambiar); };
    },
  };
}

/* ── React hook delgado: suscripción + núcleo persistente ── */

export function useEditorAvatar(adn: AdnAvatar, deps: DepsEditor = {}): EditorAvatar {
  const editor = useRef<EditorAvatar | null>(null);
  const recordar = useRef<DepsEditor>(deps);
  recordar.current = deps;
  const [, refrescar] = useState(0);
  if (!editor.current || editor.current.id !== adn.id) {
    // Los deps se leen a la hora de usar (recordar), para que el núcleo no muera con una dep que cambió.
    editor.current = crearEditorAvatar(adn, {
      guardar: (a) => recordar.current.guardar?.(a),
      emitir: (l) => recordar.current.emitir?.(l),
      pedirAstraura: (i) => (recordar.current.pedirAstraura ? recordar.current.pedirAstraura(i) : Promise.resolve(null)),
      otrosPresentes: () => recordar.current.otrosPresentes?.() ?? 0,
      vinculosProtomolecula: recordar.current.vinculosProtomolecula,
    });
  }
  useEffect(() => {
    const editorVivo = editor.current!;
    const dejar = editorVivo.suscribir(() => refrescar((v) => v + 1));
    const pulso = setInterval(() => { void editorVivo.tic(); }, 500);
    return () => { dejar(); clearInterval(pulso); };
  }, []);
  return editor.current;
}

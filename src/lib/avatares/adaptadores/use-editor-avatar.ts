"use client";

/**
 * Avatares 3D · EDITOR DEL AVATAR EN TIEMPO REAL (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * El núcleo puro del ADN (src/lib/avatares/adn/) YA aplica y agrupa; aquí va el hook del panel:
 * pantalla al instante, deshacer/rehacer (pila de ADN, tope 50), emisión a los demás presentes
 * (solo si hay alguien mirando), guardado con calma en el almacén de AV1011D, dictado local y el
 * resto del frase a Astraura. Lo de fuera (guardar, emitir, pedir a Astraura) se INYECTA, como el
 * resto de adaptadores: sin red ni disco en el hook, así las pruebas no necesitan doble de nodo.
 */
import { useCallback, useRef, useState } from "react";
import { MORFOLOGIA, type AdnAvatar, type EstiloMovimiento, type Morfologia } from "@/lib/avatares/adn/adn";
import {
  aplicarCambio as aplicarCambioAdn, claveCambio, crearColaEnvio, debeGuardar, lote, sanearCambio,
  type CambioAvatar, type ColaEnvio,
} from "@/lib/avatares/adn/cambios";
import { cambiosDesdeFrase } from "@/lib/avatares/adn/dictado";

export const TOPE_PILA = 50;

/** Deslizadores que un CC de MIDI puede mover (morfología, aura y carácter del movimiento). */
export type ClaveDeslizador =
  | (typeof MORFOLOGIA)[number]
  | "aura.tono" | "aura.intensidad"
  | "movimiento.energia" | "movimiento.amplitud" | "movimiento.ritmo" | "movimiento.postura";
export const CLAVES_DESLIZADOR: readonly ClaveDeslizador[] = [
  ...MORFOLOGIA, "aura.tono", "aura.intensidad",
  "movimiento.energia", "movimiento.amplitud", "movimiento.ritmo", "movimiento.postura",
] as const;
/** CC (0…127) → deslizador. La Protomolécula hoy no mapea deslizadores del avatar: se aprende aquí o llega por prop. */
export type MapeoMidiAvatar = Readonly<Record<number, ClaveDeslizador>>;

export interface DepsEditorAvatar {
  /** Almacén del ADN de AV1011D (`saveAdnToLibrary`); lo inyecta quien monta el editor. */
  guardar: (adn: AdnAvatar) => Promise<void>;
  /** Canal del evento «adn» de la escena (AV1011E); sin canal no se emite nada a nadie. */
  emitir?: (cambios: readonly CambioAvatar[], rev: number) => void;
  /** Modelo que traduce lo que el dictado local no entendió; null = se lo dice con su motivo. */
  pedirAstraura?: (instruccion: string) => Promise<string>;
}

export interface ResultadoFrase {
  cambios: CambioAvatar[];
  sinEntender: string[];
  desdeAstraura: number;
  aviso?: string;
}

export function useEditorAvatar(adnInicial: AdnAvatar, deps: DepsEditorAvatar) {
  /* ── Estado mutable interno ── */
  const adnRef = useRef(adnInicial);
  const [adn, setAdn] = useState<AdnAvatar>(adnInicial);
  const pilas = useRef({ deshacer: [] as AdnAvatar[], rehacer: [] as AdnAvatar[] });
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [puedeRehacer, setPuedeRehacer] = useState(false);
  const cola = useRef<ColaEnvio>(crearColaEnvio());
  const guardado = useRef({ sinGuardar: false, ultimoCambio: 0, ultimoGuardado: -Infinity });
  const [falloGuardado, setFalloGuardado] = useState<string | null>(null);

  /* ── Pantalla al instante + pila de deshacer ── */
  const aplicarCambio = useCallback((c: CambioAvatar, ahora = Date.now()) => {
    const prev = adnRef.current;
    const nuevo = aplicarCambioAdn(prev, c);
    if (nuevo === prev) return;
    pilas.current.deshacer.push(prev);
    if (pilas.current.deshacer.length > TOPE_PILA) pilas.current.deshacer.shift();
    pilas.current.rehacer = [];
    adnRef.current = nuevo;
    setAdn(nuevo);
    setPuedeDeshacer(true);
    setPuedeRehacer(false);
    guardado.current = { ...guardado.current, sinGuardar: true, ultimoCambio: ahora };
    cola.current.pendientes.set(claveCambio(c), c);
  }, []);

  /* ── Deshacer / rehacer (no se emite: el gesto de editar no se manda a otros) ── */
  const deshacer = useCallback(() => {
    const prev = pilas.current.deshacer.pop();
    if (!prev) return;
    pilas.current.rehacer.push(adnRef.current);
    adnRef.current = prev;
    setAdn(prev);
    setPuedeDeshacer(pilas.current.deshacer.length > 0);
    setPuedeRehacer(true);
  }, []);

  const rehacer = useCallback(() => {
    const sig = pilas.current.rehacer.pop();
    if (!sig) return;
    pilas.current.deshacer.push(adnRef.current);
    adnRef.current = sig;
    setAdn(sig);
    setPuedeRehacer(pilas.current.rehacer.length > 0);
    setPuedeDeshacer(true);
  }, []);

  /* ── Emisión a los demás presentes: agrupa y respeta el ritmo; nadie mirando = no emite ── */
  const emitirLotes = useCallback((ahora: number, otrosPresentes: number): CambioAvatar[] | null => {
    const l = lote(cola.current, ahora, otrosPresentes);
    if (l) deps.emitir?.(l, adnRef.current.rev);
    return l;
  }, [deps]);

  /* ── Guardado en el almacén del ADN (AV1011D): 5 s de calma, 30 s entre guardados ── */
  const tickGuardar = useCallback(async (ahora: number, cerrando = false): Promise<boolean> => {
    const g = guardado.current;
    if (!debeGuardar({ sinGuardar: g.sinGuardar, ultimoCambio: g.ultimoCambio, ultimoGuardado: g.ultimoGuardado, ahora, cerrando })) return false;
    const aGuardar = adnRef.current;
    g.sinGuardar = false;
    g.ultimoGuardado = ahora;
    try {
      await deps.guardar(aGuardar);
      setFalloGuardado(null);
      return true;
    } catch (e) {
      g.sinGuardar = true;
      setFalloGuardado(`No se guardó el avatar: ${e instanceof Error ? e.message : "error desconocido"}.`);
      return false;
    }
  }, [deps]);

  /* ── MIDI: un CC del mando → el deslizador que le toca ── */
  const aplicarMidi = useCallback((valorCC: number, clave: ClaveDeslizador): boolean => {
    const c = cambioDeDeslizador(valorCC, clave);
    if (!c) return false;
    aplicarCambio(c);
    return true;
  }, [aplicarCambio]);

  /* ── Voz y texto: dictado local al instante, lo difícil lo traduce Astraura ── */
  const aplicarFrase = useCallback(async (frase: string): Promise<ResultadoFrase> => {
    const { cambios, sinEntender } = cambiosDesdeFrase(frase, adnRef.current);
    for (const c of cambios) aplicarCambio(c);
    let desdeAstraura = 0, aviso: string | undefined;
    if (sinEntender.length > 0) {
      if (!deps.pedirAstraura) {
        aviso = sinEntender.length === 1
          ? `No entendí «${sinEntender[0]}»: sin modelo conectado para traducirlo.`
          : `No entendí: ${sinEntender.map((t) => `«${t}»`).join(", ")}. Sin modelo conectado para traducirlos.`;
      } else {
        try {
          for (const c of cambiosDeRespuestaAstraura(await deps.pedirAstraura(instruccionAstraura(frase)))) {
            aplicarCambio(c);
            desdeAstraura++;
          }
          if (desdeAstraura === 0) aviso = "Astraura no devolvió cambios con el formato del ADN: no se aplicó nada de lo que no entendí.";
        } catch {
          aviso = "Astraura no respondió: no se aplicó nada de lo que no entendí.";
        }
      }
    }
    return { cambios, sinEntender, desdeAstraura, aviso };
  }, [aplicarCambio, deps]);

  return {
    adn, aplicarCambio, deshacer, rehacer, puedeDeshacer, puedeRehacer,
    emitirLotes, tickGuardar, aplicarMidi, aplicarFrase, falloGuardado,
  };
}

/* ── Puro: valor de un mando MIDI a deslizador ── */

/** CC 0…127 → 0…1 (redondeado a 3 decimales); fuera de rango o no entero, `null`. */
export function valor01DeCC(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 127 || !Number.isInteger(v)) return null;
  return Math.round((v / 127) * 1000) / 1000;
}

const esCampoMovimiento = (v: string): v is keyof EstiloMovimiento =>
  v === "energia" || v === "amplitud" || v === "ritmo" || v === "postura";

export function cambioDeDeslizador(valorCC: unknown, clave: ClaveDeslizador): CambioAvatar | null {
  const valor = valor01DeCC(valorCC);
  if (valor === null || !isClaveDeslizador(clave)) return null;
  if ((MORFOLOGIA as readonly string[]).includes(clave)) return { op: "morfologia", clave: clave as Morfologia, valor };
  if (clave === "aura.tono") return { op: "aura", campo: "tono", valor: Math.round(valor * 359) };
  if (clave === "aura.intensidad") return { op: "aura", campo: "intensidad", valor };
  const campo = clave.slice("movimiento.".length);
  return esCampoMovimiento(campo) ? { op: "movimiento", campo, valor } : null;
}

export function isClaveDeslizador(v: string): v is ClaveDeslizador {
  return (CLAVES_DESLIZADOR as readonly string[]).includes(v);
}

/* ── Puro: la puesta de Astraura y el filtro de su respuesta ── */

export function instruccionAstraura(frase: string): string {
  return [
    `Traduce esta frase a cambios del avatar: «${frase}».`,
    "Responde SOLO una lista JSON de objetos CambioAvatar, sin prosa ni markdown. Cada objeto lleva:",
    "op «morfologia» con clave entre altura, complexion, cabeza, hombros, cintura, piernas, brazos, estilizado y valor 0 a 1;",
    "op «material» con slot entre piel, cabello, ojos, ropa-1, ropa-2, acento, aura; campo «color» con #rrggbb, o metal/rugosidad/emisivo 0 a 1;",
    "op «expresion» con clave entre happy, sad, angry, surprised, relaxed, neutral y valor 0 a 1;",
    "op «aura» con campo tono (0 a 360), intensidad (0 a 1) o ligadaEmocion (booleano);",
    "op «movimiento» con campo entre energia, amplitud, ritmo, postura y valor 0 a 1;",
    "op «visibilidad» con valor privado, grupo o publico.",
  ].join(" ");
}

/** Respuesta de Astraura → cambios válidos (máximo 12): lo que no sea una lista JSON con forma de cambio se descarta. */
export function cambiosDeRespuestaAstraura(respuesta: unknown): CambioAvatar[] {
  if (typeof respuesta !== "string") return [];
  const limpio = respuesta.replace(/```(?:json)?/gi, "");
  const inicio = limpio.indexOf("[");
  const fin = limpio.lastIndexOf("]");
  if (inicio === -1 || fin <= inicio) return [];
  try {
    const lista: unknown = JSON.parse(limpio.slice(inicio, fin + 1));
    if (!Array.isArray(lista)) return [];
    return lista
      .map(sanearCambio)
      .filter((c): c is CambioAvatar => c !== null)
      .slice(0, 12);
  } catch {
    return [];
  }
}

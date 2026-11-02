"use client";
/**
 * Avatares 3D · HOOK DEL EDITOR EN TIEMPO REAL (AV1011B·2). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * Aplica cada `CambioAvatar` AL INSTANTE en tu pantalla (sin red), apila deshacer/rehacer
 * (pila de ADN, tope 50), emite a los demás presentes con `encolar`/`lote` (agrupado por
 * clave y nunca si no hay nadie mirando) y guarda en el almacén de AV1011D según
 * `debeGuardar`: tras 5 s de calma y como mucho una vez cada 30 s, o al cerrar.
 * Todo lo de fuera (emisión, guardado, cuántos miran) llega por props: aquí no hay red.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { sanearAdn, type AdnAvatar } from "@/lib/avatares/adn/adn";
import {
  aplicarCambios, crearColaEnvio, debeGuardar, encolar, lote, sanearCambio,
  type CambioAvatar,
} from "@/lib/avatares/adn/cambios";

export const TOPE_DESHACER = 50;
const JUEGA_EMISION_MS = 60;
const VIGIA_GUARDADO_MS = 1_000;

export interface OpcionesEditorAvatar {
  adn: AdnAvatar;
  otrosPresentes: number;
  emitir: (lote: CambioAvatar[]) => void;
  guardar: (adn: AdnAvatar) => Promise<void>;
}

/** La respuesta cruda de Astraura → solo cambios del formato válido (sanearCambio); lo demás se tira. */
export function cambiosDeModelo(texto: string): CambioAvatar[] {
  try {
    const lista: unknown = JSON.parse(texto);
    return (Array.isArray(lista) ? lista : []).map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
  } catch {
    return [];
  }
}

/** Instrucción SOLO lista JSON de `CambioAvatar`, para el modelo que traduce lo que el dictado no entendió (§3.3). */
export const instruccionAstraura = (frase: string): string =>
  `Traduce esta petición de avatar a una lista JSON. Responde SOLO con un array JSON de cambios, sin texto: ` +
  `cada cambio es una de estas formas: {"op":"morfologia","clave":<${"altura,complexion,cabeza,hombros,cintura,piernas,brazos,estilizado"}>,"valor":0..1}, ` +
  `{"op":"material","slot":<${"piel,cabello,ojos,ropa-1,ropa-2,acento,aura"}>,"campo":"color","valor":"#rrggbb"}, ` +
  `{"op":"aura","campo":"tono"|"intensidad"|"ligadaEmocion","valor":...}, {"op":"expresion","clave":...,"valor":0..1}, ` +
  `{"op":"movimiento","campo":"energia"|"amplitud"|"ritmo"|"postura","valor":0..1}. ` +
  `Color según el color nombrado (p. ej. azul #007fff). Petición: «${frase.slice(0, 200)}»`;

export function useEditorAvatar(op: OpcionesEditorAvatar) {
  const [adn, setAdn] = useState<AdnAvatar>(() => sanearAdn(op.adn) ?? op.adn);
  const adnRef = useRef(adn);
  const historia = useRef<{ pasado: AdnAvatar[]; futuro: AdnAvatar[] }>({ pasado: [], futuro: [] });
  const [manos, setManos] = useState({ d: 0, r: 0 });
  const cola = useRef(crearColaEnvio());
  const otros = useRef(op.otrosPresentes);
  otros.current = op.otrosPresentes;
  const emitir = useRef(op.emitir);
  emitir.current = op.emitir;
  const guardar = useRef(op.guardar);
  guardar.current = op.guardar;
  const marca = useRef({ sinGuardar: false, guardando: false, ultimoCambio: 0, ultimoGuardado: 0 });
  const [errorGuardado, setErrorGuardado] = useState("");

  const aplicar = useCallback((cs: CambioAvatar | readonly CambioAvatar[]) => {
    const lista = (Array.isArray(cs) ? cs : [cs]).map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    if (!lista.length) return;
    const actual = adnRef.current;
    const nuevo = aplicarCambios(actual, lista);
    if (nuevo === actual) return;
    const h = historia.current;
    h.pasado.push(actual);
    h.futuro = [];
    if (h.pasado.length > TOPE_DESHACER) h.pasado.splice(0, h.pasado.length - TOPE_DESHACER);
    adnRef.current = nuevo;
    setAdn(nuevo);
    setManos({ d: h.pasado.length, r: 0 });
    for (const c of lista) encolar(cola.current, c);
    marca.current = { ...marca.current, sinGuardar: true, ultimoCambio: Date.now() };
  }, []);

  const deshacer = useCallback(() => {
    const h = historia.current;
    const previo = h.pasado.pop();
    if (!previo) return;
    h.futuro.push(adnRef.current);
    adnRef.current = previo;
    setAdn(previo);
    setManos({ d: h.pasado.length, r: h.futuro.length });
    marca.current = { ...marca.current, sinGuardar: true, ultimoCambio: Date.now() };
  }, []);

  const rehacer = useCallback(() => {
    const h = historia.current;
    const proximo = h.futuro.pop();
    if (!proximo) return;
    h.pasado.push(adnRef.current);
    adnRef.current = proximo;
    setAdn(proximo);
    setManos({ d: h.pasado.length, r: h.futuro.length });
    marca.current = { ...marca.current, sinGuardar: true, ultimoCambio: Date.now() };
  }, []);

  /** Guardado al cerrar el editor (o a mano): guarda aunque no haya pasado la calma de 5 s. Se marca ANTES (mientras se guarda no se relanza) y si falla se enseña; el vigía reintenta 30 s después. */
  const guardarAhora = useCallback(async () => {
    const m = marca.current;
    if (m.guardando) return;
    marca.current = { ...m, guardando: true, sinGuardar: false, ultimoGuardado: Date.now() };
    try {
      await guardar.current(adnRef.current);
      marca.current = { ...marca.current, guardando: false, sinGuardar: false, ultimoGuardado: Date.now() };
      setErrorGuardado("");
    } catch (e) {
      marca.current = { sinGuardar: true, guardando: false, ultimoCambio: Date.now(), ultimoGuardado: Date.now() };
      setErrorGuardado(e instanceof Error ? e.message : "No se pudo guardar el avatar.");
    }
  }, []);

  // Emisión a los demás presentes: la cola manda (agrupa, respeta el tope de Hz y no emite sin nadie).
  useEffect(() => {
    const t = setInterval(() => {
      const envio = lote(cola.current, Date.now(), otros.current);
      if (envio && envio.length) emitir.current(envio);
    }, JUEGA_EMISION_MS);
    return () => clearInterval(t);
  }, []);

  // Vigía del guardado: `debeGuardar` manda (5 s de calma, 1 cada 30 s).
  useEffect(() => {
    const t = setInterval(() => {
      const m = marca.current;
      if (debeGuardar({ sinGuardar: m.sinGuardar, ultimoCambio: m.ultimoCambio, ultimoGuardado: m.ultimoGuardado, ahora: Date.now(), cerrando: false })) void guardarAhora();
    }, VIGIA_GUARDADO_MS);
    return () => clearInterval(t);
  }, [guardarAhora]);

  return {
    adn, aplicar, deshacer, rehacer, guardarAhora, errorGuardado,
    puedeDeshacer: manos.d > 0, puedeRehacer: manos.r > 0,
  };
}


"use client";
/**
 * Editor del avatar en tiempo real (AV1011B) · HOOK `useEditorAvatar` (contrato: architecture/astraura-avatares-3d.md §3).
 * Aplica cada cambio AL INSTANTE (sin red); deshacer/rehacer con pila de ADN (tope 50); emite a los demás presentes
 * agrupado y como mucho a 10 Hz (NUNCA si no hay nadie mirando); guarda tras 5 s de calma y como mucho una vez cada
 * 30 s (o al cerrar). Guardar/emitir/astraura se inyectan; el dictado sin modelo lo hace `cambiosDesdeFrase`, lo que
 * no entiende va a Astraura y se filtra con `sanearCambio`; MIDI usa el adaptador de la Protomolécula (CC → deslizador).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { aplicarCambio as aplicarUnCambio, crearColaEnvio, debeGuardar, encolar, lote, sanearCambio, type CambioAvatar } from "@/lib/avatares/adn/cambios";
import { cambiosDesdeFrase } from "@/lib/avatares/adn/dictado";
import { normalizar01, type FuenteControl } from "@/lib/protomolecula/vinculos-control";
import type { AdnAvatar, Morfologia } from "@/lib/avatares/adn/adn";

export const TOPE_DESHACER = 50, TICK_MS = 100;

export interface DepsEditorAvatar {
  guardar: (adn: AdnAvatar) => Promise<void>; // el almacén de AV1011D; inyectada para probar el hook
  emitir?: (cs: readonly CambioAvatar[]) => void; // sincronía en vivo con los demás presentes (AV1011E)
  astraura?: ((instruccion: string) => Promise<string>) | null; // null = aquí no hay modelo disponible
}

/** CC de un mando MIDI → cambio de un deslizador de morfología (0–127 → 0–1, curva de la Protomolécula). */
export function cambioMidi(numero: number, bruto: number, clave: Morfologia): CambioAvatar {
  return { op: "morfologia", clave, valor: normalizar01({ tipo: "midi", mensaje: "cc", canal: 1, numero }, bruto) };
}

/** Instrucción que pide a Astraura SOLO una lista JSON de `CambioAvatar` (§3.3). */
export function instruccionAstraura(sinEntender: readonly string[]): string {
  return [
    "Traduce la petición del final a cambios del ADN del avatar. Responde SOLO una lista JSON; ejemplo: [{\"op\":\"morfologia\",\"clave\":\"altura\",\"valor\":0.6}].",
    "Claves de morfología: altura, complexion, cabeza, hombros, cintura, piernas, brazos, estilizado. Una pieza es {\"op\":\"pieza\",\"slot\":\"cabello\",\"ref\":\"biblioteca:<id>\"}.",
    `Petición que no se entendió: «${sinEntender.join(", ")}»`,
  ].join("\n");
}

/** Respuesta de Astraura → cambios válidos: solo la lista JSON, filtrada con `sanearCambio`. */
export function extraerCambios(respuesta: string): CambioAvatar[] {
  const ini = respuesta.indexOf("["), fin = respuesta.lastIndexOf("]");
  if (ini < 0 || fin <= ini) return [];
  try {
    const v: unknown = JSON.parse(respuesta.slice(ini, fin + 1));
    return Array.isArray(v) ? v.map(sanearCambio).filter((c): c is CambioAvatar => c !== null) : [];
  } catch { return []; }
}

export function useEditorAvatar(inicial: AdnAvatar, deps: DepsEditorAvatar, opciones?: { otrosPresentes?: number }) {
  const [adn, setAdn] = useState(inicial);
  const [pilas, setPilas] = useState({ pasado: 0, futuro: 0 });
  const [nota, setNota] = useState<string | null>(null);
  const [vinculos, setVinculos] = useState<Partial<Record<string, Morfologia>>>({});
  const adnRef = useRef(inicial); const depsRef = useRef(deps); depsRef.current = deps;
  const otros = useRef(opciones?.otrosPresentes ?? 0); otros.current = opciones?.otrosPresentes ?? otros.current;
  const pilasRef = useRef({ pasado: [] as AdnAvatar[], futuro: [] as AdnAvatar[] });
  const cola = useRef(crearColaEnvio());
  const marca = useRef({ ultimoCambio: 0, ultimoGuardado: 0, sinGuardar: false, cerrando: false });
  const vinculosRef = useRef(vinculos); vinculosRef.current = vinculos;
  const avanzar = useCallback((siguiente: AdnAvatar): boolean => {
    if (siguiente === adnRef.current) return false;
    const p = pilasRef.current;
    p.pasado = [...p.pasado.slice(-(TOPE_DESHACER - 1)), adnRef.current];
    p.futuro = [];
    adnRef.current = siguiente; setAdn(siguiente);
    setPilas({ pasado: p.pasado.length, futuro: 0 });
    marca.current.ultimoCambio = Date.now(); marca.current.sinGuardar = true;
    return true;
  }, []);
  const deshacerOhacer = useCallback((de: "pasado" | "futuro", a: "pasado" | "futuro"): void => {
    const p = pilasRef.current, to = p[de][p[de].length - 1];
    if (!to) return;
    p[de] = p[de].slice(0, -1); p[a] = [...p[a], adnRef.current];
    adnRef.current = to; setAdn(to); setPilas({ pasado: p.pasado.length, futuro: p.futuro.length });
    marca.current.ultimoCambio = Date.now(); marca.current.sinGuardar = true;
  }, []);
  const deshacer = useCallback(() => deshacerOhacer("pasado", "futuro"), [deshacerOhacer]);
  const rehacer = useCallback(() => deshacerOhacer("futuro", "pasado"), [deshacerOhacer]);
  const aplicarCambio = useCallback((cambio: CambioAvatar): void => {
    if (!avanzar(aplicarUnCambio(adnRef.current, cambio))) return;
    if (otros.current > 0 && depsRef.current.emitir) encolar(cola.current, cambio);
  }, [avanzar]);
  const guardarPendiente = useCallback(async (): Promise<void> => {
    const m = marca.current, ahora = Date.now();
    if (!debeGuardar({ sinGuardar: m.sinGuardar, ultimoCambio: m.ultimoCambio, ultimoGuardado: m.ultimoGuardado, ahora, cerrando: m.cerrando })) return;
    m.sinGuardar = false; m.ultimoGuardado = ahora;
    try { await depsRef.current.guardar(adnRef.current); setNota(null); }
    catch { m.sinGuardar = true; setNota("No se pudo guardar el avatar en la Biblioteca: se reintenta en la próxima calma o al cerrar."); }
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      const cs = lote(cola.current, Date.now(), otros.current);
      if (cs && depsRef.current.emitir) depsRef.current.emitir(cs);
      void guardarPendiente();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [guardarPendiente]);
  const cerrar = useCallback((): void => { marca.current.cerrando = true; void guardarPendiente(); }, [guardarPendiente]);
  const enviarFrase = useCallback(async (frase: string): Promise<void> => {
    const r = cambiosDesdeFrase(frase, adnRef.current);
    for (const c of r.cambios) aplicarCambio(c);
    if (!r.sinEntender.length) { if (!r.cambios.length) setNota("No entendí la frase: prueba con «pelo azul», «más alto» o «sonríe»."); return; }
    const pedir = depsRef.current.astraura;
    if (!pedir) {
      const resto = r.cambios.length ? `Aplicé ${r.cambios.length} cambio(s); lo demás` : "La frase";
      setNota(`${resto} «${r.sinEntender.join(", ")}» lo tiene que traducir Astraura y aquí no hay modelo disponible.`);
      return;
    }
    setNota("Lo que faltó lo está traduciendo Astraura…");
    try {
      const cs = extraerCambios(await pedir(instruccionAstraura(r.sinEntender)));
      for (const c of cs) aplicarCambio(c);
      setNota(cs.length ? null : "Astraura respondió sin cambios aplicables.");
    } catch { setNota("Astraura no pudo traducir la frase."); }
  }, [aplicarCambio]);
  const mapearMidi = useCallback((cc: number, clave: Morfologia): void => setVinculos((v) => ({ ...v, [String(cc)]: clave })), []);
  const recibirMidi = useCallback((m: { fuente: FuenteControl; bruto: number }): void => {
    if (m.fuente.tipo !== "midi" || m.fuente.mensaje !== "cc") return;
    const clave = vinculosRef.current[String(m.fuente.numero)];
    if (clave) aplicarCambio(cambioMidi(m.fuente.numero, m.bruto, clave));
  }, [aplicarCambio]);
  return {
    adn, nota, vinculos, aplicarCambio, deshacer, rehacer, guardarPendiente, cerrar, enviarFrase, mapearMidi, recibirMidi,
    puedeDeshacer: pilas.pasado > 0, puedeRehacer: pilas.futuro > 0,
  };
}

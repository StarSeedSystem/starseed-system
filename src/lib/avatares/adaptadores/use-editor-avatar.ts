"use client";

import { act, useCallback, useEffect, useState, useRef } from "react";
import { useStore } from "@/lib/store";
import type { AdnAvatar, CambioAvatar, EstiloMovimiento } from "@/lib/avatares/adn/adn";
import { sanearCambio, aplicarCambio as aplicarCambioPuro, diffAdn, claveCambio, MAX_ADN_GUARDADOS } from "@/lib/avatares/adn/cambios";
import { cambiosDesdeFrase, normalizar, COLORES } from "@/lib/avatares/adn/dictado";
import { adnPorDefecto, sanearAdn } from "@/lib/avatares/adn/adn";
import { saveAdnToLibrary, loadAdnEntry, refDeAdn, suscribirCambiosAdn } from "@/lib/avatares/adaptadores/almacen-adn";
import { encolar, lote, crearColaEnvio, CALMA_GUARDADO_MS, ENTRE_GUARDADOS_MS, debeGuardar } from "@/lib/avatares/adn/cambios";
import { sintetizarEnDaemon } from "@/lib/aurora/voz-starseed/daemon";
import { hayMidi, pedirAccesoMidi, analizarMensaje } from "@/lib/protomolecula/adaptador-midi";
import { procesar } from "@/lib/protomolecula/vinculos-control";
import { CURVA_LINEAL } from "@/lib/protomolecula/vinculos-control";
import { useStore as useStoreV2 } from "@/lib/store";

const PILA_MAX = 50;

export interface UseEditorAvatar {
  adn: AdnAvatar | null;
  setAdn: (adn: AdnAvatar | null) => void;
  historial: readonly CambioAvatar[];
  /** Índice actual en el historial (-1 = nada, 0 = primer cambio, ...). */
  historialIndice: number;
  visibilidad: "privado" | "grupo" | "publico";
  setVisibilidad: (v: "privado" | "grupo" | "publico") => void;
  /** Aplica un cambio sin mutar el original; invierte si inválido. */
  aplicarCambio: (c: CambioAvatar) => boolean;
  /** Deshacer un cambio. */
  deshacer: () => boolean;
  /** Rehacer un cambio. */
  rehacer: boolean;
  /** Guardar ADN actual en la Biblioteca (AV1011D). */
  guardar: () => Promise<boolean>;
  /** Cambiar visibilidad. */
  cambiarVisibilidad: (v: "privado" | "grupo" | "publico") => void;
  /** Dictado: procesa una frase y aplica los cambios entendidos. */
  dictado: (frase: string) => { cambios: CambioAvatar[]; sinEntender: string[] };
  /** Sincroniza cola en vivo: emite lote si hay otros presentes. */
  sincronizarLote: (otrosPresentes: number, ahora: number) => CambioAvatar[] | null;
  /** Sincroniza guarda con calma. */
  sincronizarGuardar: (p: { sinGuardar: boolean; ultimoCambio: number; ultimoGuardado: number; ahora: number; cerrando: boolean }) => boolean;
}

export function useEditorAvatar(adnInicial: AdnAvatar | null = null): UseEditorAvatar {
  const [adn, setAdnState] = useState<AdnAvatar | null>(adnInicial ?? adnPorDefecto("editor", "Avatar {sesión}", { tipo: "perfil", id: "editor" }));
  const [historial, setHistorial] = useState<CambioAvatar[]>([]);
  const [historialIndice, setHistorialIndice] = useState(-1);
  const [visibilidad, setVisibilidad] = useState("privado");
  const colaRef = useRef<ReturnType<typeof crearColaEnvio>>(crearColaEnvio());
  const ultimaEmisionRef = useRef<number>(-Infinity);
  const ultimaGuardadoRef = useRef<number>(-Infinity);
  const sinGuardarRef = useRef(true);

  // Initialize sinGuardarRef
  useEffect(() => { sinGuardarRef.current = true; }, []);

  // Apply a change (internal implementation)
  const interiorAplicarCambio = useCallback((c: CambioAvatar): boolean => {
    const base = adn ?? adnPorDefecto("editor", "Avatar {sesión}", { tipo: "perfil", id: "editor" });
    const nuevo = aplicarCambioPuro(base, c);
    if (!nuevo) return false;
    const sanitized = sanearAdn(nuevo);
    if (!sanitized) return false;

    // Push to history
    const nuevoIndice = historialIndice + 1;
    const nuevaHistorial = historialIndice >= 0 && historialIndice < historial.length - 1
      ? historial.slice(0, historialIndice + 1)
      : historial;
    const conNuevo = [...nuevaHistorial, c];
    setHistorial(conNuevo.length > PILA_MAX ? conNuevo.slice(conNuevo.length - PILA_MAX) : conNuevo);
    setHistorialIndice(nuevoIndice);
    setAdnState(sanitized);

    // Marcar que hubo cambio para el guardado
    sinGuardarRef.current = true;

    // Intentar encolar para emisión en vivo
    if (colaRef.current) {
      encolar(colaRef.current, c);
    }

    return true;
  }, [adn, historialIndice]);

  // Aplicar cambio (exported wrapper)
  const aplicarCambio = useCallback((c: CambioAvatar): boolean => interiorAplicarCambio(c), []);

  // Undo
  const deshacer = useCallback(() => {
    if (historialIndice <= 0) return false;
    const nuevoIndice = historialIndice - 1;
    const anterior = historial[nuevoIndice];
    if (!anterior) return false;
    const aplicado = interiorAplicarCambio(anterior);
    if (aplicado) {
      setHistorialIndice(nuevoIndice);
      return true;
    }
    return false;
  }, [historialIndice]);

  // Redo
  const rehacer = useCallback(() => {
    if (historialIndice < 0 || historialIndice >= historial.length) return false;
    const proximo = historial[historialIndice];
    if (!proximo) return false;
    const aplicado = interiorAplicarCambio(proximo);
    if (aplicado) {
      setHistorialIndice(historialIndice + 1);
      return true;
    }
    return false;
  }, [historialIndice]);

  // Efecto: sync historial cuándo adn cambia (solo lectura, no empuja)
  useEffect(() => {
    if (historialIndice >= 0 && historialIndice < historial.length) {
      const nueva = [...historial.slice(0, historialIndice + 1)];
      setHistorial(nueva);
    }
  }, [adn, historialIndice]);

  // Guardar ADN en la Biblioteca
  const guardar = useCallback(async (): Promise<boolean> => {
    if (!adn) return false;
    sinGuardarRef.current = false;
    const ref = await saveAdnToLibrary(adn, visibilidad);
    sinGuardarRef.current = true;
    ultimaGuardadoRef.current = Date.now();
    return true;
  }, [adn, visibilidad]);

  // Cambiar visibilidad
  const cambiarVisibilidad = useCallback((v: "privado" | "grupo" | "publico") => {
    setVisibilidad(v);
    if (adn) {
      interiorAplicarCambio({ op: "visibilidad", valor: v });
    }
  }, [adn]);

  // Dictado: procesa frase y devuelve cambios + sin entender
  const dictado = useCallback((frase: string) => {
    const adnBase = adn ?? adnPorDefecto("editor", "Avatar {sesión}", { tipo: "perfil", id: "editor" });
    const { cambios, sinEntender } = cambiosDesdeFrase(frase, adnBase);
    return { cambios, sinEntender };
  }, [adn]);

  // Sincroniza lote en vivo
  const sincronizarLote = useCallback((otrosPresentes: number, ahora: number): CambioAvatar[] | null => {
    if (!colaRef.current) return null;
    return lote(colaRef.current, otrosPresentes, ahora);
  }, []);

  // Sincroniza guarda con calma
  const sincronizarGuardar = useCallback((p: { sinGuardar: boolean; ultimoCambio: number; ultimoGuardado: number; ahora: number; cerrando: boolean }): boolean => {
    return debeGuardar(p);
  }, []);

  // Effect: suscribe a cambios del almacén ADN cuando el componente monta
  useEffect(() => {
    let vivo = true;
    const onChange = () => {
      if (!vivo) return;
      // Recargar ADN desde el almacén
      void loadAdnEntry(refDeAdn(adn?.id ?? "")).then((entry) => {
        if (!vivo) return;
        if (entry) {
          void parseAdnEntry(entry).then((parsed) => {
            if (!vivo) return;
            if (parsed) setAdnState(parsed);
          });
        }
      });
    };
    const cleanup = suscribirCambiosAdn(onChange);
    return () => {
      vivo = false;
      cleanup();
    };
  }, [adn]);

  // Efecto: cuando adn inicial cambia, asegúrate de tener ADN
  useEffect(() => {
    if (!adn) {
      setAdnState(adnPorDefecto("editor", "Avatar {sesión}", { tipo: "perfil", id: "editor" }));
    }
  }, [adn]);

  return {
    adn,
    setAdn: setAdnState,
    historial,
    historialIndice,
    visibilidad,
    setVisibilidad,
    aplicarCambio,
    deshacer,
    rehacer,
    guardar,
    cambiarVisibilidad,
    dictado,
    sincronizarLote,
    sincronizarGuardar,
  };
}
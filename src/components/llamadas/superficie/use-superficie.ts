"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { esAppNativa, puenteNativo } from "@/lib/nativa/puente";
import { COMANDO_PANTALLA_VENTANA } from "@/lib/nativa/pantalla-completa";
import { SUPERFICIE_INICIAL, duracionHablada, reducirSuperficie, type Superficie, type EventoSuperficie, type TamanoSuperficie } from "@/lib/llamadas/superficie/maquina";
import { eventosParaVista } from "@/lib/llamadas/superficie/sincronizar";
import type { VistaLlamada } from "@/lib/llamadas/superficie/vista";

/** Hora que se refresca cada segundo mientras haya llamada (cronómetro). */
export function useAhora(activo: boolean): number {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    if (!activo) return;
    setN(Date.now());
    const id = setInterval(() => setN(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activo]);
  return n;
}

export function useMovimientoReducido(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(mq.matches);
    f();
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, []);
  return r;
}

/**
 * Pantalla completa de la ventana (PER1108A): en la app nativa se usa el comando de VENTANA (`set_fullscreen`),
 * nunca la de un elemento (WebKit congelaba el Mac). En la web, la del documento. El modo «completo» de la
 * superficie se pinta siempre a viewport completo, así que si la pantalla completa del sistema falla, igual
 * se ve a pantalla completa dentro de la ventana.
 */
async function pedirPantallaSistema(activo: boolean): Promise<void> {
  try {
    if (typeof document === "undefined") return;
    if (esAppNativa()) {
      await puenteNativo().llamar<unknown>(COMANDO_PANTALLA_VENTANA, { activo });
      return;
    }
    if (activo && !document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else if (!activo && document.fullscreenElement) await document.exitFullscreen?.();
  } catch {
    /* sin pantalla completa del sistema: queda la del viewport */
  }
}

export function useSuperficie(vista: VistaLlamada) {
  const [s, despachar] = useReducer(reducirSuperficie, SUPERFICIE_INICIAL);
  const sRef = useRef(s);
  sRef.current = s;
  // El motor manda: cada cambio de la vista se traduce a eventos de la máquina.
  useEffect(() => {
    for (const ev of eventosParaVista(sRef.current, vista, Date.now())) despachar(ev);
  }, [vista.estado, vista.tipo, vista.fin, vista.medioUsado]); // eslint-disable-line react-hooks/exhaustive-deps

  const ahora = useAhora(s.estado === "conectada" || s.estado === "en-espera" || s.estado === "reconectando");
  const duracion = duracionHablada(s, ahora);

  // Pantalla completa del sistema acompaña al tamaño.
  const eraCompleta = useRef(false);
  useEffect(() => {
    const es = s.tamano === "pantalla-completa";
    if (es !== eraCompleta.current) {
      eraCompleta.current = es;
      void pedirPantallaSistema(es);
    }
  }, [s.tamano]);
  useEffect(() => () => { if (eraCompleta.current) void pedirPantallaSistema(false); }, []);

  // Esc sale de pantalla completa (y de ahí vuelve al tamaño previo).
  useEffect(() => {
    if (s.tamano !== "pantalla-completa") return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") despachar({ t: "escape" });
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [s.tamano]);

  // Si el sistema sale de pantalla completa por su cuenta (web), la superficie también.
  useEffect(() => {
    if (typeof document === "undefined" || esAppNativa()) return;
    const f = () => {
      if (!document.fullscreenElement && sRef.current.tamano === "pantalla-completa") despachar({ t: "escape" });
    };
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const tamano = useCallback((t: TamanoSuperficie) => despachar({ t: "tamano", tamano: t }), []);
  return { s: s as Superficie, despachar: despachar as (e: EventoSuperficie) => void, ahora, duracion, tamano };
}

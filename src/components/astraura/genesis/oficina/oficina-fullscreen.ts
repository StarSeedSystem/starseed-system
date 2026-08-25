"use client";

/**
 * oficina-fullscreen.ts — Pantalla completa DE VERDAD para la oficina.
 *
 * Alex lo pidió explícito: Fullscreen API real, salida por Escape, botón
 * visible, y que la escena se redimensione bien al entrar y salir — con un
 * respaldo cuando el navegador la deniega. Hermes3D no tiene nada parecido
 * (se comprobó: cero referencias a `requestFullscreen` en todo el repo), así
 * que esto NO es un puerto — es nuevo, construido sobre lo que el propio OS
 * ya tenía: `useFullscreen` (`src/hooks/useFullscreen.ts`), que ya resuelve
 * los prefijos de proveedor y el evento `fullscreenchange`. Aquí solo se le
 * añade lo que a ESTE componente le falta:
 *
 *   1. Un contenedor propio (no `document.documentElement`, que pondría TODA
 *      la página en pantalla completa) — vía una ref de callback + estado,
 *      no una `useRef` plana: `useFullscreen` depende de su argumento
 *      `target` en un `useCallback`, así que si se le pasara `ref.current`
 *      directamente, la primera llamada (con `ref.current` aún `null` porque
 *      React todavía no ha montado el nodo) quedaría CONGELADA — una
 *      `useRef` mutar `.current` no dispara un re-render que vuelva a crear
 *      `request`/`exit` con el nodo correcto. Un estado sí lo hace.
 *   2. Detección de DENEGACIÓN: `useFullscreen().request()` traga sus propios
 *      errores (los registra y sigue) para no romper a quien la use sin
 *      manejo de errores — así que aquí, tras esperarla, se comprueba
 *      `document.fullscreenElement` a mano; si el navegador la denegó (o si
 *      ni siquiera la soporta), se cae a un modo "interno": el propio
 *      contenedor ocupa el viewport por CSS (`fixed inset-0`), sin pedir
 *      nada al navegador. La escena se redimensiona igual de bien en los dos
 *      modos porque el Canvas de R3F usa un `ResizeObserver` sobre su propio
 *      contenedor (ver `oficina-escena-3d.tsx`) — no le importa SI el cambio
 *      de tamaño vino de la Fullscreen API o de una clase CSS.
 *   3. Escape para el modo interno: la Fullscreen API real ya dispara
 *      `fullscreenchange` sola con Escape (eso ya lo cablea `useFullscreen`);
 *      el modo interno no es fullscreen de verdad para el navegador, así que
 *      aquí se escucha Escape a mano SOLO mientras ese modo está activo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFullscreen } from "@/hooks/useFullscreen";

export type ModoPantallaOficina = "normal" | "nativo" | "interno";

export interface ApiPantallaCompletaOficina {
  readonly modo: ModoPantallaOficina;
  /** Ref de CALLBACK (no un objeto ref plano) — pásala como `ref` del
   * contenedor que debe ocupar la pantalla. Ver el porqué en la cabecera. */
  readonly contenedorRef: (nodo: HTMLDivElement | null) => void;
  readonly soportaNativo: boolean;
  readonly activar: () => Promise<void>;
  readonly salir: () => Promise<void>;
  readonly alternar: () => Promise<void>;
}

/** Cuánto esperar tras `request()` antes de comprobar si de verdad se
 * concedió — un tick de animación basta (el navegador ya habrá actualizado
 * `document.fullscreenElement` para cuando pinte el siguiente frame). */
function esperarUnFrame(): Promise<void> {
  return new Promise((resolver) => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) {
      resolver();
      return;
    }
    window.requestAnimationFrame(() => resolver());
  });
}

export function useOficinaPantallaCompleta(): ApiPantallaCompletaOficina {
  const [contenedor, setContenedor] = useState<HTMLDivElement | null>(null);
  const { isFullscreen: nativoActivo, isSupported: soportaNativo, request, exit } = useFullscreen(contenedor);
  const [internoActivo, setInternoActivo] = useState(false);
  // Evita una carrera: si el usuario pulsa el botón dos veces seguidas antes
  // de que se resuelva la primera petición, la segunda no debe volver a
  // pedir fullscreen sobre un intento que ya está en curso.
  const activandoRef = useRef(false);

  const contenedorRef = useCallback((nodo: HTMLDivElement | null) => setContenedor(nodo), []);

  const activar = useCallback(async () => {
    if (nativoActivo || internoActivo || activandoRef.current) return;
    activandoRef.current = true;
    try {
      if (soportaNativo && contenedor) {
        await request();
        await esperarUnFrame();
        // `request()` nunca rechaza (lo captura internamente) — la única
        // forma fiable de saber si de verdad se concedió es mirar el DOM.
        if (document.fullscreenElement === contenedor) return;
      }
      // Sin soporte, sin contenedor todavía montado, o denegada: respaldo
      // "pantalla completa dentro de la app" — nunca deja al usuario sin
      // nada tras pulsar el botón.
      setInternoActivo(true);
    } finally {
      activandoRef.current = false;
    }
  }, [nativoActivo, internoActivo, soportaNativo, contenedor, request]);

  const salir = useCallback(async () => {
    if (nativoActivo) await exit();
    if (internoActivo) setInternoActivo(false);
  }, [nativoActivo, internoActivo, exit]);

  const alternar = useCallback(async () => {
    if (nativoActivo || internoActivo) await salir();
    else await activar();
  }, [nativoActivo, internoActivo, salir, activar]);

  // Escape para el modo interno — el nativo ya lo resuelve el navegador
  // (y `useFullscreen` ya escucha `fullscreenchange` para reflejarlo).
  useEffect(() => {
    if (!internoActivo) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInternoActivo(false);
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [internoActivo]);

  const modo: ModoPantallaOficina = nativoActivo ? "nativo" : internoActivo ? "interno" : "normal";

  return { modo, contenedorRef, soportaNativo, activar, salir, alternar };
}

"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VariacionesPublicasWindowHost — anfitrión global de la ventana de variaciones públicas (Ola 1019V)
 * ---------------------------------------------------------------------------
 * Escucha `starseed:variaciones-publicas-open-window` (vía `subscribeVariacionesPublicasWindow`)
 * y monta `VariacionesPublicasWindow` en modo superpuesto por cada elemento abierto.
 * Permite VARIAS ventanas abiertas a la vez (pila): al reabrir un elemento ya
 * abierto, la trae al frente en vez de duplicarla. El foco en la última se
 * resuelve solo, sin coordinación aquí: cada `VariacionesPublicasWindow` se enfoca a
 * sí misma al montarse, así que la más reciente en el DOM (la última del
 * arreglo) es también la última en pedir el foco — y por eso la única que
 * responde a Escape (su `onKeyDown` vive en su propio contenedor enfocado,
 * no en `window`).
 *
 * Sin estado en módulo: todo vive en el `useState` de este componente.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import { VariacionesPublicasWindow } from "./variaciones-window"; // Nota: este componente se creará en otra tarea (ventana)
import {
  subscribeVariacionesPublicasWindow,
  type VariacionesPublicasWindowDetail,
  type VariacionesPublicasWindowTab,
} from "./variaciones-bus";

interface StackEntry {
  clave: string;
  tab?: VariacionesPublicasWindowTab;
}

/** Tope defensivo: evita que un emisor descontrolado apile ventanas sin límite. */
const MAX_STACK = 6;

export function VariacionesPublicasWindowHost() {
  const [stack, setStack] = useState<StackEntry[]>([]);

  useEffect(
    () =>
      subscribeVariacionesPublicasWindow((detail) => {
        setStack((prev) => {
          const idx = prev.findIndex((e) => e.clave === detail.clave);
          const entry: StackEntry = { clave: detail.clave, tab: detail.tab };
          // Si ya estaba abierta, la quita de su posición y la vuelve a poner al
          // final (al frente visualmente y con foco) en vez de duplicarla.
          const rest = idx >= 0 ? [...prev.slice(0, idx), ...prev.slice(idx + 1)] : prev;
          const next = [...rest, entry];
          return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
        });
      }),
    [],
  );

  const closeAt = useCallback((clave: string) => {
    setStack((prev) => prev.filter((e) => e.clave !== clave));
  }, []);

  if (stack.length === 0) return null;

  return (
    <>
      {stack.map((e) => (
        <VariacionesPublicasWindow
          key={`${e.clave}:${e.tab ?? ""}`}
          clave={e.clave}
          initialTab={e.tab}
          embedded={false}
          onClose={() => closeAt(e.clave)}
        />
      ))}
    </>
  );
}

export default VariacionesPublicasWindowHost;
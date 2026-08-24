"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Astraura158WindowHost — anfitrión global de la ventana universal (Ola 5 · Adenda 157)
 * ---------------------------------------------------------------------------
 * Escucha `starseed:astraura158-open-window` (vía `subscribeAstraura158Window`)
 * y monta `Astraura158Window` en modo superpuesto por cada entidad abierta.
 * Permite VARIAS ventanas abiertas a la vez (pila): al reabrir una entidad ya
 * abierta, la trae al frente en vez de duplicarla. El foco en la última se
 * resuelve solo, sin coordinación aquí: cada `Astraura158Window` se enfoca a
 * sí misma al montarse, así que la más reciente en el DOM (la última del
 * arreglo) es también la última en pedir el foco — y por eso la única que
 * responde a Escape (su `onKeyDown` vive en su propio contenedor enfocado,
 * no en `window`).
 *
 * Sin estado en módulo: todo vive en el `useState` de este componente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import { Astraura158Window } from "./astraura-158-window";
import { subscribeAstraura158Window, type Astraura158EntityKind, type Astraura158WindowTab } from "./astraura-158-window-bus";
import type { Astraura158Target } from "@/lib/astraura/astraura-158-client";

interface StackEntry {
  kind: Astraura158EntityKind;
  id: string;
  tab?: Astraura158WindowTab;
  target: Astraura158Target;
}

/** Tope defensivo: evita que un emisor descontrolado apile ventanas sin límite. */
const MAX_STACK = 6;

export function Astraura158WindowHost() {
  const [stack, setStack] = useState<StackEntry[]>([]);

  useEffect(
    () =>
      subscribeAstraura158Window((detail) => {
        const target: Astraura158Target = detail.target ?? "local";
        setStack((prev) => {
          const idx = prev.findIndex((e) => e.kind === detail.kind && e.id === detail.id);
          const entry: StackEntry = { kind: detail.kind, id: detail.id, tab: detail.tab, target };
          // Si ya estaba abierta, la quita de su posición y la vuelve a poner al
          // final (al frente visualmente y con foco) en vez de duplicarla.
          const rest = idx >= 0 ? [...prev.slice(0, idx), ...prev.slice(idx + 1)] : prev;
          const next = [...rest, entry];
          return next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
        });
      }),
    [],
  );

  const closeAt = useCallback((kind: Astraura158EntityKind, id: string) => {
    setStack((prev) => prev.filter((e) => !(e.kind === kind && e.id === id)));
  }, []);

  if (stack.length === 0) return null;

  return (
    <>
      {stack.map((e) => (
        <Astraura158Window
          key={`${e.kind}:${e.id}`}
          kind={e.kind}
          id={e.id}
          target={e.target}
          initialTab={e.tab}
          embedded={false}
          onClose={() => closeAt(e.kind, e.id)}
        />
      ))}
    </>
  );
}

export default Astraura158WindowHost;

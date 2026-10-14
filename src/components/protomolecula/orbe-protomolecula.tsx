"use client";

/**
 * Protomolécula · ORBE GEMELA (PM1010F0L): FAB de 56 px arrastrable (5 px
 * separan arrastre de clic), posición de `orbe-bus` limitada al viewport,
 * panel anclado con Escape/clic-fuera/botón para cerrar, eventos
 * PROTO_ORB_ABRIR/FAB + storage/focus. Apagada no monta nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Atom, X } from "lucide-react";

import { BarraDictado } from "./barra-dictado";
import { controladorActivo } from "@/lib/protomolecula/controlador-activo";
import { guardarPosicion, leerActivada, leerPosicion, limitarPosicion,
  PROTO_ORB_ABRIR_EVENT, PROTO_ORB_FAB_EVENT, TAMANO_ORBE, type Punto } from "@/lib/protomolecula/orbe-bus";

const UMBRAL = 5; // px que separan un arrastre de un clic
const viewport = () => ({ ancho: window.innerWidth, alto: window.innerHeight });

export interface PanelProtomoleculaAutonomoProps { compacto?: boolean; alCerrar: () => void }

/** Panel flotante anclado a la orbe: dicta sobre la molécula activa. */
export function PanelProtomoleculaAutonomo({ compacto = false, alCerrar }: PanelProtomoleculaAutonomoProps) {
  const c = controladorActivo();
  return (
    <div role="dialog" aria-label="Protomolécula" style={{ width: compacto ? 300 : 420, maxWidth: "calc(100vw - 80px)" }}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{c ? c.obtener().molecula.titulo : "Protomolécula"}</p>
        <button type="button" aria-label="Cerrar panel" onClick={alCerrar}
          className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {c ? (
        <BarraDictado alDictar={(f) => c.dictar(f, { tipo: "persona", id: "yo" }).resultados} />
      ) : (
        <p className="text-xs text-muted-foreground">
          Aún no hay ninguna molécula abierta. Crea una desde la barra de creación.
        </p>
      )}
    </div>
  );
}

export default function OrbeProtomolecula() {
  const [activada, setActivada] = useState(false);
  const [pos, setPos] = useState<Punto>({ x: -200, y: -200 }); // fuera hasta leer
  const [abierto, setAbierto] = useState(false);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const arrastre = useRef<{ x0: number; y0: number; px: number; py: number; movido: boolean } | null>(null);
  const releer = useCallback(() => setActivada(leerActivada(window.localStorage)), []);

  useEffect(() => {
    releer();
    setPos(leerPosicion(window.localStorage, viewport()));
    const alRedimensionar = () => setPos((p) => limitarPosicion(p, viewport()));
    const abrir = () => setAbierto(true);
    const oyentes: Array<[string, EventListener]> = [
      ["resize", alRedimensionar], ["storage", releer], ["focus", releer],
      [PROTO_ORB_FAB_EVENT, releer], [PROTO_ORB_ABRIR_EVENT, abrir],
    ];
    for (const [t, f] of oyentes) window.addEventListener(t, f);
    return () => { for (const [t, f] of oyentes) window.removeEventListener(t, f); };
  }, [releer]);

  useEffect(() => { // Escape y clic fuera, solo mientras está abierto
    if (!abierto) return;
    const alTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    const fuera = (e: PointerEvent) => { if (!raizRef.current?.contains(e.target as Node)) setAbierto(false); };
    window.addEventListener("keydown", alTeclar);
    window.addEventListener("pointerdown", fuera, true);
    return () => { window.removeEventListener("keydown", alTeclar); window.removeEventListener("pointerdown", fuera, true); };
  }, [abierto]);

  if (!activada) return null;

  const alPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    arrastre.current = { x0: pos.x, y0: pos.y, px: e.clientX, py: e.clientY, movido: false };
    e.currentTarget.setPointerCapture?.(e.pointerId); // jsdom no lo implementa
  };
  const alPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.movido && Math.hypot(e.clientX - a.px, e.clientY - a.py) < UMBRAL) return;
    a.movido = true;
    setPos(limitarPosicion({ x: a.x0 + e.clientX - a.px, y: a.y0 + e.clientY - a.py }, viewport()));
  };
  const alPointerUp = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    if (a.movido) guardarPosicion(window.localStorage, pos);
    else setAbierto((v) => !v);
  };

  return (
    <div ref={raizRef} className="fixed z-40 print:hidden" style={{ left: pos.x, top: pos.y }}>
      {abierto && (
        <div className="absolute" style={{ bottom: 0, right: TAMANO_ORBE + 12 }}>
          <PanelProtomoleculaAutonomo compacto alCerrar={() => setAbierto(false)} />
        </div>
      )}
      <button type="button" aria-label="Protomolécula" aria-expanded={abierto}
        title="Protomolécula · arrastra para mover, clic para abrir"
        onPointerDown={alPointerDown} onPointerMove={alPointerMove} onPointerUp={alPointerUp}
        className="cursor-pointer touch-none rounded-full p-[3px] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        style={{ width: TAMANO_ORBE, height: TAMANO_ORBE,
          background: "conic-gradient(from 210deg, #9fe870, #6fe6d6, #7fb8ff, #c9a8ff, #ffc247, #ff8a5c, #9fe870)" }}>
        <span className="flex h-full w-full items-center justify-center rounded-full"
          style={{ background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22), rgba(8,10,18,0.92) 60%)",
            boxShadow: "inset 0 0 12px rgba(127,184,255,0.35), 0 4px 18px rgba(111,230,214,0.35)" }}>
          <Atom className="h-6 w-6 text-cyan-200" aria-hidden />
        </span>
      </button>
    </div>
  );
}

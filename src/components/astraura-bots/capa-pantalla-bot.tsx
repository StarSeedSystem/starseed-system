"use client";

/**
 * Bots/dots de Astraura · Capas del bot sobre la pantalla (BOT1011V · contrato §6.1 y §12). Pinta las capas
 * ACTIVAS (ya normalizadas con `normalizarCapa` y apiladas con `apilar`) con el estilo de `screen-overlay.ts`
 * (cristal oscuro, borde ámbar Logic, z-index 300). Ese módulo no exporta su contenedor: este lleva el suyo,
 * con `pointer-events` solo en «Quitar» y en la columna de sueltas (para desplazarla si no caben), marcado
 * `data-aurora-exclude` para que el escáner no lo enumere. CONTROLADO: quien lleva el bucle guarda la lista;
 * aquí no se valida ni ejecuta nada. El widget es un DATO `UiSpec` y en el OS aún no hay renderizador de UiSpec
 * (buscado `RenderUiSpec` y `UiSpecRenderer`): se dice «próximamente» con lo que trae, sin pintarlo de mentira.
 */
import { useEffect, useState } from "react";
import { ArrowDownRight, Highlighter, LayoutTemplate, MapPinOff, StickyNote, X, type LucideIcon } from "lucide-react";
import type { CapaActiva, FormaCapa } from "@/lib/astraura-bots/capa-pantalla";

export interface Caja { top: number; left: number; width: number; height: number }

export interface PropsCapaPantallaBot {
  capas: readonly CapaActiva[];
  alQuitar: (id: string) => void;
  /** Dónde está el objetivo en la pantalla (inyectable en pruebas). Por defecto, `getElementById`. */
  localizar?: (objetivo: string) => Caja | null;
}

const ICONO: Record<FormaCapa, LucideIcon> = { resaltar: Highlighter, nota: StickyNote, flecha: ArrowDownRight, widget: LayoutTemplate };
const AMBAR = "#FFBF00";
const acotar = (v: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, v));

function localizarEnDom(objetivo: string): Caja | null {
  const el = document.getElementById(objetivo);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}

/** Las capas ancladas siguen a su elemento al hacer scroll o cambiar el tamaño (un repintado por fotograma). */
function usarRecolocacion(activo: boolean): void {
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let raf = 0;
    const mover = () => { if (!raf) raf = window.requestAnimationFrame(() => { raf = 0; setTic((t) => t + 1); }); };
    window.addEventListener("scroll", mover, { capture: true, passive: true });
    window.addEventListener("resize", mover, { passive: true });
    return () => {
      window.removeEventListener("scroll", mover, { capture: true });
      window.removeEventListener("resize", mover);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [activo]);
}

function Ficha({ capa, alQuitar, aviso }: { capa: CapaActiva; alQuitar: (id: string) => void; aviso?: string }) {
  const Icono = ICONO[capa.forma];
  const bloques = capa.uiSpec?.bloques.length ?? 0;
  return (
    <div className="flex w-64 max-w-[80vw] items-start gap-2 rounded-xl border border-[#FFBF00]/70 bg-[rgba(10,14,24,0.78)] px-3 py-2 text-xs text-[#FFE9B8] shadow-[0_0_10px_rgba(255,191,0,0.35),0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-md transition-opacity duration-200">
      <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: AMBAR }} aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[10px] uppercase tracking-wide text-[#FFBF00]/80">Puesta por {capa.nombreBot}</p>
        {capa.texto ? <p className="break-words">{capa.texto}</p> : null}
        {capa.forma === "widget" ? (
          <p className="text-[#FFE9B8]/75">
            {capa.uiSpec?.titulo ?? "Widget"} · {bloques} {bloques === 1 ? "bloque validado" : "bloques validados"}.
            <span className="block italic">próximamente: renderizador de UiSpec</span>
          </p>
        ) : null}
        {aviso ? <p className="flex items-center gap-1 text-[#FFE9B8]/70"><MapPinOff className="h-3 w-3" aria-hidden />{aviso}</p> : null}
      </div>
      <button type="button" onClick={() => alQuitar(capa.id)} aria-label={`Quitar la capa de ${capa.nombreBot}`}
        className="pointer-events-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#FFBF00]/40 px-1.5 py-0.5 transition-colors duration-200 hover:bg-[#FFBF00]/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
      >
        <X className="h-3 w-3" aria-hidden /> Quitar
      </button>
    </div>
  );
}

/** Capas de los bots sobre la pantalla; cada una con quién la puso y «Quitar» a un toque. */
export function CapaPantallaBot({ capas, alQuitar, localizar = localizarEnDom }: PropsCapaPantallaBot) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  usarRecolocacion(montado && capas.length > 0);
  if (!montado || capas.length === 0) return null;

  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  const sueltas: { capa: CapaActiva; aviso?: string }[] = [];
  const ancladas = capas.flatMap((capa) => {
    const caja = capa.objetivo ? localizar(capa.objetivo) : null;
    if (!caja) {
      sueltas.push({ capa, aviso: capa.objetivo ? `No encuentro «${capa.objetivo}» en esta pantalla.` : undefined });
      return [];
    }
    const fichaTop = acotar(caja.top + caja.height + 8, 4, alto - 96);
    const fichaLeft = acotar(caja.left, 4, ancho - 268);
    return [
      <div key={capa.id} data-capa-bot={capa.forma}>
        {capa.forma === "resaltar" ? (
          <div className="fixed rounded-xl transition-opacity duration-300" style={{ top: caja.top - 3, left: caja.left - 3, width: caja.width + 6, height: caja.height + 6, border: `2px solid ${AMBAR}`, boxShadow: "0 0 0 4px rgba(255,191,0,0.16), 0 0 22px rgba(255,191,0,0.45)" }} />
        ) : null}
        {capa.forma === "flecha" ? (
          <ArrowDownRight className="fixed h-8 w-8 drop-shadow-[0_0_6px_rgba(255,191,0,0.6)]" style={{ top: Math.max(0, caja.top - 30), left: Math.max(0, caja.left - 30), color: AMBAR }} aria-hidden />
        ) : null}
        <div className="fixed" style={{ top: fichaTop, left: fichaLeft }}><Ficha capa={capa} alQuitar={alQuitar} /></div>
      </div>,
    ];
  });

  return (
    <div data-aurora-exclude="" role="region" aria-label="Capas de tus bots sobre la pantalla" className="pointer-events-none fixed inset-0 z-[300]">
      {ancladas}
      {sueltas.length ? (
        <div className="pointer-events-auto fixed bottom-24 right-4 flex max-h-[60vh] flex-col gap-2 overflow-y-auto overscroll-contain">
          {sueltas.map(({ capa, aviso }) => <Ficha key={capa.id} capa={capa} alQuitar={alQuitar} aviso={aviso} />)}
        </div>
      ) : null}
    </div>
  );
}

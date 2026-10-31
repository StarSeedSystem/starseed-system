"use client";

/** ClicDerechoGlobal — el clic derecho de absolutamente todo (Ola 1019V · §3 de
 * architecture/variaciones-publicas.md). Escucha en TODO el documento `contextmenu` (ratón),
 * la pulsación larga (táctil, patrón de use-context-trigger.ts) y el teclado (tecla de menú y
 * Mayúsculas+F10). Con menú propio (data-ss-menu-propio), en el menú del texto, en campos de
 * texto o con Mayúsculas no hace nada; si hay clave de elemento muestra «Variaciones públicas»,
 * «Publicar mi variación» y «Copiar enlace al elemento». Se monta UNA vez en AppGlobals;
 * la clave nombra el TIPO, nunca datos privados. */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, Link2, Upload } from "lucide-react";
import { abrirVariaciones } from "./variaciones-bus";
import { claveDesdeElemento } from "@/lib/variaciones/clave-elemento";
import { esEditable, posicionMenu } from "@/components/traduccion/menu-texto";

/** Duración de la pulsación larga, desplazamiento que la cancela y tamaño del menú (3 dianas de 44 px). */
export const LARGO_MILIS = 500;
export const DESPLAZAMIENTO_PX = 10;
const ANCHO = 224; const ALTO = 3 * 44 + 8;

/** Decide si el clic derecho abre la ventana de variaciones por el anfitrión global. */
export function abreMenuPropio(ev: { defaultPrevented?: boolean; shiftKey?: boolean }, objetivo: Element | null): boolean {
  if (!objetivo || ev.defaultPrevented || ev.shiftKey) return false;
  if (esEditable(objetivo)) return false;
  if (objetivo.closest("[data-ss-menu-propio], [data-menu-texto]")) return false;
  return claveDesdeElemento(objetivo) !== null;
}

/** Enlace público al elemento sobre la base dada: `?elemento=<clave>`, el TIPO y nada más. */
export function enlaceElemento(clave: string, base: string): string {
  const url = new URL(base); url.searchParams.set("elemento", clave);
  return url.toString();
}

/** Copia con el portapapeles inyectable; false si no hay portapapeles o falla (nunca lanza). */
export async function copiarEnlace(texto: string, portapapeles?: { writeText(t: string): Promise<void> }): Promise<boolean> {
  const pluma = portapapeles ?? (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!pluma?.writeText) return false;
  try { await pluma.writeText(texto); return true; } catch { return false; }
}

export function ClicDerechoGlobal() {
  const [menu, setMenu] = useState<{ x: number; y: number; clave: string } | null>(null);
  const [montado, setMontado] = useState(false);
  const refMenu = useRef<HTMLDivElement>(null); const cron = useRef<ReturnType<typeof setTimeout> | null>(null); const inicio = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => setMontado(true), []);
  useEffect(() => {
    const abrirEn = (x: number, y: number, objetivo: Element): boolean => {
      const clave = claveDesdeElemento(objetivo); if (!clave) return false;
      const pos = posicionMenu(x, y, ANCHO, ALTO, { ancho: window.innerWidth, alto: window.innerHeight });
      setMenu({ x: pos.izquierda, y: pos.arriba, clave });
      return true;
    };
    const limpiarCron = () => { if (cron.current) clearTimeout(cron.current); cron.current = null; };
    const alRaton = (ev0: Event) => {
      const ev = ev0 as MouseEvent; const diana = ev.target instanceof Element ? ev.target : null;
      if (diana && abreMenuPropio(ev, diana) && abrirEn(ev.clientX, ev.clientY, diana)) ev.preventDefault();
    };
    const alTecla = (ev0: Event) => {
      const ev = ev0 as KeyboardEvent; const diana = ev.target instanceof Element ? ev.target : null;
      if (!diana || (ev.key !== "ContextMenu" && !(ev.shiftKey && ev.key === "F10"))) return;
      // Mayúsculas solo chapa el clic del ratón; el Mayúsculas+F10 es un atajo que las pide él.
      if (!abreMenuPropio({ defaultPrevented: ev.defaultPrevented }, diana)) return;
      const r = diana.getBoundingClientRect();
      if (abrirEn(r.left + r.width / 2, r.top + r.height / 2, diana)) ev.preventDefault();
    };
    const alTocar = (ev0: Event) => {
      const ev = ev0 as TouchEvent;
      if (ev.touches.length !== 1) return;
      const diana = ev.target instanceof Element ? ev.target : null; const t = ev.touches[0];
      inicio.current = { x: t.clientX, y: t.clientY };
      limpiarCron();
      cron.current = setTimeout(() => {
        try { navigator.vibrate?.(12); } catch { /* opcional */ }
        if (diana && abreMenuPropio({}, diana)) abrirEn(t.clientX, t.clientY, diana);
      }, LARGO_MILIS);
    };
    const alArrastrar = (ev0: Event) => {
      const ev = ev0 as TouchEvent;
      const t = ev.touches[0]; const s = inicio.current;
      if (t && s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > DESPLAZAMIENTO_PX) limpiarCron();
    };
    const fuera = (ev: Event) => { if (!refMenu.current?.contains(ev.target as Node)) setMenu(null); };
    const oyentes: Array<[string, (ev: Event) => void, boolean?]> = [
      ["contextmenu", alRaton], ["keydown", alTecla], ["touchstart", alTocar], ["touchmove", alArrastrar],
      ["touchend", limpiarCron], ["touchcancel", limpiarCron], ["pointerdown", fuera], ["scroll", fuera, true],
    ];
    for (const [tipo, al, bandera] of oyentes) document.addEventListener(tipo, al, bandera);
    return () => {
      for (const [tipo, al, bandera] of oyentes) document.removeEventListener(tipo, al, bandera);
      limpiarCron();
    };
  }, []);

  if (!montado || !menu) return null;
  const acciones = [
    { etiqueta: "Variaciones públicas", Icono: Layers, alPulsar: () => abrirVariaciones(menu.clave) },
    { etiqueta: "Publicar mi variación", Icono: Upload, alPulsar: () => abrirVariaciones(menu.clave, { publicar: true }) },
    { etiqueta: "Copiar enlace al elemento", Icono: Link2, alPulsar: () => void copiarEnlace(enlaceElemento(menu.clave, window.location.href)) },
  ];
  return createPortal(
    <div ref={refMenu} data-ss-menu-propio="" role="menu" aria-label="Menú de variaciones del elemento"
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[1200] w-56 rounded-2xl border border-border bg-popover/95 p-1 text-popover-foreground shadow-lg shadow-black/50 backdrop-blur-[16px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.15)]"
    >
      {acciones.map((a) => (
        <button type="button" role="menuitem" key={a.etiqueta} onClick={() => { setMenu(null); a.alPulsar(); }}
          className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none"
        >
          <a.Icono aria-hidden className="size-4 shrink-0 text-muted-foreground" />{a.etiqueta}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export default ClicDerechoGlobal;

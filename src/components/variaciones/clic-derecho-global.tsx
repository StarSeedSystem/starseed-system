"use client";
/**
 * ClicDerechoGlobal — clic derecho global «Variaciones públicas» en TODO el OS
 * (Ola 1019V · architecture/variaciones-publicas.md §3). Escucha clic derecho,
 * pulsación larga (patrón de use-context-trigger.ts) y teclado. Con
 * `data-ss-menu-propio`, campos de texto o Mayúsculas deja el menú del navegador;
 * buscando la clave de elemento más cercana muestra el menú corto.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, Upload, Link2, type LucideIcon } from "lucide-react";
import { abrirVariaciones } from "./variaciones-bus";
import { claveDesdeElemento } from "@/lib/variaciones/clave-elemento";
const LONG_PRESS_MS = 500;
const MOVE_SLOP_PX = 10;
/** Estado del menú flotante: posición y clave canónica del elemento. */
export type MenuClicDerecho = { x: number; y: number; clave: string };
/** Enlace compartible (puro, para pruebas): base sin anclaje + `#<clave>`. */
export function enlaceDeElemento(clave: string, base: string): string {
  return `${base.split("#")[0]}#${clave}`;
}
/** ¿Campo de texto (inputs, textarea, select, contenteditable)? Ahí manda el navegador. */
function esCampoTexto(el: Element): boolean {
  const e = el.getAttribute("contenteditable");
  const marca = e === "true" || e === "";
  const editable = (el as HTMLElement).isContentEditable === true;
  return editable || marca ||
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}
/** Clave del objetivo: null con menú propio (`data-ss-menu-propio`), si no la más cercana. */
export function claveDelObjetivo(objetivo: EventTarget | null): string | null {
  const el = objetivo instanceof Element ? objetivo : null;
  if (!el || el.closest("[data-ss-menu-propio]")) return null;
  return claveDesdeElemento(el);
}
export function ClicDerechoGlobal() {
  const [menu, setMenu] = useState<MenuClicDerecho | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tocaRef = useRef<{ x: number; y: number } | null>(null);
  const cerrar = useCallback(() => { clearTimeout(timerRef.current ?? undefined); setMenu(null); }, []);
  useEffect(() => {
    const limpiar = () => clearTimeout(timerRef.current ?? undefined);
    const alContextmenu = (e: Event) => { // Mayúsculas y campos de texto: navegador.
      const me = e as MouseEvent;
      const el = me.target instanceof Element && !me.shiftKey ? me.target : null;
      const clave = el && !esCampoTexto(el) ? claveDelObjetivo(el) : null;
      if (!clave) return;
      me.preventDefault();
      setMenu({ x: me.clientX, y: me.clientY, clave });
    };
    const alTeclado = (e: Event) => { // Tecla de menú y Mayúsculas+F10.
      const ke = e as KeyboardEvent;
      const ok = ke.key === "ContextMenu" || ke.key === "Menu" || (ke.key === "F10" && ke.shiftKey);
      const foco = document.activeElement instanceof Element ? document.activeElement : null;
      const clave = ok ? claveDelObjetivo(foco) : null;
      if (!clave) return;
      ke.preventDefault();
      const r = foco?.getBoundingClientRect();
      setMenu({ x: (r?.left ?? 0) + (r?.width ?? 0) / 2, y: (r?.top ?? 0) + (r?.height ?? 0) / 2, clave });
    };
    const alToca = (e: Event) => { // Pulsación larga ~500 ms, como en el Finder.
      const te = e as TouchEvent;
      if (te.touches.length !== 1) return;
      const t = te.touches[0];
      tocaRef.current = { x: t.clientX, y: t.clientY };
      timerRef.current = setTimeout(() => {
        const el = e.target instanceof Element ? e.target : null;
        const clave = el && !esCampoTexto(el) ? claveDelObjetivo(el) : null;
        if (!clave) return;
        setMenu({ x: t.clientX, y: t.clientY, clave });
      }, LONG_PRESS_MS);
    };
    const alMover = (e: Event) => { // Mover el dedo cancela la pulsación larga.
      const t = (e as TouchEvent).touches[0];
      if (tocaRef.current && t && Math.hypot(t.clientX - tocaRef.current.x, t.clientY - tocaRef.current.y) > MOVE_SLOP_PX) limpiar();
    };
    const alAbajo = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) cerrar(); };
    const alEscape = (e: Event) => { if ((e as KeyboardEvent).key === "Escape") cerrar(); };
    const pares: [string, (e: Event) => void][] = [
      ["contextmenu", alContextmenu], ["keydown", alTeclado], ["keydown", alEscape],
      ["mousedown", alAbajo], ["touchstart", alToca], ["touchmove", alMover],
      ["touchend", limpiar], ["touchcancel", limpiar], ["resize", cerrar],
    ];
    const enlazar = (metodo: "addEventListener" | "removeEventListener") => {
      for (const [ev, fn] of pares) {
        const destino: EventTarget = ev === "resize" ? window : document;
        destino[metodo](ev, fn);
      }
    };
    enlazar("addEventListener");
    return () => enlazar("removeEventListener");
  }, [cerrar]);
  if (!menu) return null;
  const base = typeof window === "undefined" ? "" : `${window.location.origin}${window.location.pathname}`;
  const items: [string, LucideIcon, () => void][] = [
    ["Variaciones públicas", Layers, () => { abrirVariaciones(menu.clave); cerrar(); }],
    ["Publicar mi variación", Upload, () => { abrirVariaciones(menu.clave, { publicar: true }); cerrar(); }],
    ["Copiar enlace al elemento", Link2, () => {
      try { navigator.clipboard?.writeText(enlaceDeElemento(menu.clave, base)); } catch { /* sin permiso */ }
      cerrar();
    }],
  ];
  return createPortal(
    <div
      ref={menuRef}
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[9999] min-w-[200px] overflow-hidden rounded-2xl border border-border/60 bg-background/85 p-1.5 shadow-xl backdrop-blur-xl"
    >
      {items.map(([etiqueta, Icono, accion]) => (
        <button key={etiqueta} type="button" onClick={accion}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors duration-200 hover:bg-accent/10"
        >
          <Icono aria-hidden className="size-4 text-muted-foreground" />
          {etiqueta}
        </button>
      ))}
    </div>,
    document.body,
  );
}

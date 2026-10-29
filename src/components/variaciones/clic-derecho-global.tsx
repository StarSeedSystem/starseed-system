"use client";

/**
 * ClicDerechoGlobal — clic derecho global (Ola 1019V · §3 de architecture/variaciones-publicas.md).
 * Con `data-ss-menu-propio`, en campos de texto o con Mayúsculas no se toca nada; el resto abre
 * «Variaciones públicas», «Publicar mi variación» y «Copiar enlace». Teclado: «Menú» y Mayús+F10.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, Link2, Upload } from "lucide-react";
import { claveDesdeElemento, leerClave } from "@/lib/variaciones/clave-elemento";
import { abrirVariaciones } from "./variaciones-bus";

const LARGA_PULSACION_MS = 500;
const HOLGURA_PX = 10;
const SEL_CAMPO = "input, textarea, select, [contenteditable='true'], [contenteditable='']";
const CAJA_MENU = { ancho: 232, alto: 156 };
const MARGEN_VISTA = 8;

export interface MenuAbierto { clave: string; x: number; y: number }

export function esCampoDeTexto(el: Element | null): boolean {
  return !!el?.closest(SEL_CAMPO);
}
export function tieneMenuPropio(el: Element | null): boolean {
  return !!el?.closest("[data-ss-menu-propio]");
}
export function esTeclaDeMenu(e: { key: string; shiftKey?: boolean }): boolean {
  return e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey === true);
}
export function claveDelObjetivo(el: Element | null): string | null {
  const clave = claveDesdeElemento(el);
  return clave && leerClave(clave) ? clave : null;
}
export function enlaceElemento(clave: string, base: string): string {
  return `${base.split("#")[0].split("?")[0]}?elemento=${encodeURIComponent(clave)}`;
}
export function acotarPosicion(x: number, y: number, vista: { ancho: number; alto: number }, caja = CAJA_MENU) {
  return {
    x: Math.max(MARGEN_VISTA, Math.min(Math.round(x), vista.ancho - caja.ancho - MARGEN_VISTA)),
    y: Math.max(MARGEN_VISTA, Math.min(Math.round(y), vista.alto - caja.alto - MARGEN_VISTA)),
  };
}

export function ClicDerechoGlobal() {
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  const caja = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let reloj: ReturnType<typeof setTimeout> | null = null;
    let ox = 0, oy = 0, oel: Element | null = null;
    const parar = () => { if (reloj) { clearTimeout(reloj); reloj = null; } };
    const abrir = (x: number, y: number, el: Element | null) => {
      if (!el || esCampoDeTexto(el) || tieneMenuPropio(el)) return false;
      const clave = claveDelObjetivo(el);
      if (!clave) return false;
      setMenu({ clave, x, y });
      return true;
    };
    const contexto = (e: MouseEvent) => {
      if (!e.shiftKey && abrir(e.clientX, e.clientY, e.target as Element | null)) e.preventDefault();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setMenu(null);
      if (!esTeclaDeMenu(e)) return;
      const el = (document.activeElement as Element | null) ?? document.body;
      const r = el.getBoundingClientRect();
      if (abrir(r.left + r.width / 2, r.bottom, el)) e.preventDefault();
    };
    const tocar = (e: TouchEvent) => {
      parar();
      if (e.touches.length !== 1) return;
      ox = e.touches[0].clientX; oy = e.touches[0].clientY; oel = e.target as Element | null;
      reloj = setTimeout(() => { reloj = null; abrir(ox, oy, oel); }, LARGA_PULSACION_MS);
    };
    const mover = (e: TouchEvent) => {
      if (!reloj || e.touches.length !== 1) return;
      if (Math.hypot(e.touches[0].clientX - ox, e.touches[0].clientY - oy) > HOLGURA_PX) parar();
    };
    const puntero = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setMenu(null);
    };
    const oyentes: [string, EventListener, AddEventListenerOptions?][] = [
      ["contextmenu", contexto as EventListener], ["keydown", tecla as EventListener], ["pointerdown", puntero as EventListener],
      ["touchstart", tocar as EventListener, { passive: true }], ["touchmove", mover as EventListener, { passive: true }],
      ["touchend", parar], ["touchcancel", parar],
    ];
    oyentes.forEach(([tipo, fn, opciones]) => document.addEventListener(tipo, fn, opciones));
    return () => {
      parar();
      oyentes.forEach(([tipo, fn]) => document.removeEventListener(tipo, fn));
    };
  }, []);
  if (!menu) return null;
  const { clave } = menu;
  const pos = acotarPosicion(menu.x, menu.y, { ancho: window.innerWidth, alto: window.innerHeight });
  const cerrar = () => setMenu(null);
  const acciones = [
    { etiqueta: "Variaciones públicas", Icono: Layers, accion: () => { abrirVariaciones(clave); cerrar(); } },
    { etiqueta: "Publicar mi variación", Icono: Upload, accion: () => { abrirVariaciones(clave, { publicar: true }); cerrar(); } },
    { etiqueta: "Copiar enlace al elemento", Icono: Link2, accion: () => {
      try { void navigator.clipboard?.writeText(enlaceElemento(clave, window.location.href)); } catch { /* sin portapapeles */ }
      cerrar();
    } },
  ];
  return createPortal(
    <div ref={caja} role="menu" aria-label="Variaciones del elemento" style={{ left: pos.x, top: pos.y }}
      className="fixed z-[120] w-56 overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
      <p className="truncate px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">{clave}</p>
      {acciones.map(({ etiqueta, Icono, accion }) => (
        <button key={etiqueta} type="button" role="menuitem" onClick={accion}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent/60">
          <Icono aria-hidden className="size-4 text-muted-foreground" />
          {etiqueta}
        </button>
      ))}
    </div>,
    document.body,
  );
}

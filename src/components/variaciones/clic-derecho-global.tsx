"use client";

// ClicDerechoGlobal — clic derecho de absolutamente todo (Ola 1019V · §3 de
// architecture/variaciones-publicas.md), montado UNA vez en app-globals.tsx.
// Escucha contextmenu, la pulsación larga (patrón de use-context-trigger.ts) y
// el teclado (tecla de menú y Mayúsculas+F10). Con menú propio ya presente
// (data-ss-menu-propio), campo de texto, Mayúsculas o sin clave deja el menú
// del navegador; con clave (§2) muestra las tres entradas de variaciones.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers, Link2, Upload, type LucideIcon } from "lucide-react";
import { leerClave } from "@/lib/variaciones/clave-elemento";
import { abrirVariaciones } from "./variaciones-bus";

// Clave deducida cuando falta data-ss-elemento: atributo → familia (§2).
const DERIVADAS: ReadonlyArray<readonly [string, string]> = [
  ["data-widget-fn", "widget"], ["data-widget-e", "widget"], ["data-ss-background", "fondo"],
  ["data-ss-material", "ajuste"], ["data-elemento", "widget"],
];
/** Ajusta (x, y) para que el menú quepa en el viewport (margen de 8 px). */
export function ajustarPosicion(x: number, y: number, ancho: number, alto: number, anchoMenu = 230, altoMenu = 170) {
  return { x: Math.max(8, Math.min(x, Math.max(ancho - anchoMenu - 8, 8))), y: Math.max(8, Math.min(y, Math.max(alto - altoMenu - 8, 8))) };
}
/** true sobre input, textarea, select o contenteditable: manda el navegador. */
export function enCampoTexto(el: Element | null): boolean {
  return !!el?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
}
/** true si el objetivo vive dentro de un menú que ya gestiona su clic derecho. */
export function conMenuPropio(el: Element | null): boolean {
  return !!el?.closest("[data-ss-menu-propio]");
}
/** Atributo con camelCase, mayúsculas o espacios a token kebab-case canónico. */
const aKebab = (crudo: string) => crudo.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/\s+/g, "-").toLowerCase();
/** Clave más cercana subiendo por el árbol: data-ss-elemento válido primero y luego los derivados. */
export function resolverClaveGlobal(origen: Element | null): string | null {
  for (let el = origen; el; el = el.parentElement) {
    const directa = el.getAttribute("data-ss-elemento");
    if (directa && leerClave(directa)) return directa;
    for (const [atributo, familia] of DERIVADAS) {
      const crudo = el.getAttribute(atributo);
      if (!crudo) continue;
      const clave = `${familia}:${aKebab(crudo)}`;
      if (leerClave(clave)) return clave;
    }
  }
  return null;
}
/** Enlace compartible solo con la clave (nunca datos privados ni secretos). */
export function enlaceDeElemento(clave: string, origen: string): string {
  const url = new URL(origen);
  url.searchParams.set("elemento", clave);
  return url.toString();
}

export function ClicDerechoGlobal() {
  const [menu, setMenu] = useState<{ clave: string; x: number; y: number } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicioToque = useRef<{ x: number; y: number } | null>(null);
  // El menú solo nace de eventos del navegador: nunca se pinta en SSR.
  useEffect(() => {
    const parar = () => { if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; } };
    const objetivoDe = (e: Event): Element | null => (e.target instanceof Element ? e.target : null);
    const abrirEn = (clave: string, x: number, y: number) => setMenu({ clave, ...ajustarPosicion(x, y, window.innerWidth, window.innerHeight) });
    const esLibre = (objetivo: Element | null) => !conMenuPropio(objetivo) && !enCampoTexto(objetivo);
    const alContexto = (e: MouseEvent) => {
      const objetivo = objetivoDe(e);
      if (e.shiftKey || objetivo?.closest("[data-ss-menu-clic-derecho]") || !esLibre(objetivo)) return;
      const clave = resolverClaveGlobal(objetivo);
      if (!clave) return;
      e.preventDefault(); abrirEn(clave, e.clientX, e.clientY);
    };
    // Pulsación larga (patrón de use-context-trigger.ts): 500 ms sin desplazamiento.
    const alToqueInicio = (e: TouchEvent) => {
      parar(); if (e.touches.length !== 1) return;
      const t = e.touches[0], objetivo = objetivoDe(e);
      inicioToque.current = { x: t.clientX, y: t.clientY };
      if (!esLibre(objetivo)) return;
      temporizador.current = setTimeout(() => {
        const clave = resolverClaveGlobal(objetivo);
        if (!clave) return;
        try { navigator.vibrate?.(12); } catch { /* opcional */ } abrirEn(clave, t.clientX, t.clientY);
      }, 500);
    };
    const alMovimiento = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && inicioToque.current && Math.hypot(t.clientX - inicioToque.current.x, t.clientY - inicioToque.current.y) > 10) parar();
    };
    // Tecla de menú y Mayúsculas+F10 abren sobre el elemento con el foco.
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenu(null); return; }
      if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
      const objetivo = document.activeElement instanceof Element ? document.activeElement : null;
      const clave = resolverClaveGlobal(objetivo);
      if (!clave || !esLibre(objetivo)) return;
      e.preventDefault(); abrirEn(clave, window.innerWidth / 2, window.innerHeight / 2);
    };
    // Clic fuera del menú (ratón o dedo) lo cierra; dentro no lo reabre.
    const alPuntero = (e: PointerEvent) => setMenu((m) => (m && e.target instanceof Element && !e.target.closest("[data-ss-menu-clic-derecho]") ? null : m));
    const registrar = (evento: string, al: EventListener) => { document.addEventListener(evento, al); return () => document.removeEventListener(evento, al); };
    const bajas = [registrar("contextmenu", alContexto as EventListener), registrar("keydown", alTeclado as EventListener), registrar("touchstart", alToqueInicio as EventListener), registrar("touchmove", alMovimiento as EventListener), registrar("touchend", parar), registrar("touchcancel", parar), registrar("pointerdown", alPuntero as EventListener)];
    return () => { for (const baja of bajas) baja(); parar(); };
  }, []);
  if (!menu) return null;
  const abrirVentana = (publicar: boolean) => { abrirVariaciones(menu.clave, publicar ? { publicar: true } : {}); setMenu(null); };
  // El portapapeles puede no estar disponible (navegador o permiso); se ignora sin romper nada.
  // El portapapeles puede faltar (navegador sin permiso): se ignora sin romper nada.
  const copiarEnlace = () => { try { navigator.clipboard.writeText(enlaceDeElemento(menu.clave, window.location.href)).catch(() => undefined); } catch { setMenu(null); } setMenu(null); };
  const items: ReadonlyArray<readonly [LucideIcon, string, () => void]> = [[Layers, "Variaciones públicas", () => abrirVentana(false)], [Upload, "Publicar mi variación", () => abrirVentana(true)], [Link2, "Copiar enlace al elemento", copiarEnlace]];
  const claseItem = "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50";
  return createPortal(
    <div data-ss-menu-clic-derecho={menu.clave} role="menu" style={{ left: menu.x, top: menu.y }}
      className="fixed z-[9999] w-56 overflow-hidden rounded-2xl border border-border/60 bg-popover/95 p-1 shadow-lg backdrop-blur-xl">
      {items.map(([Icono, texto, al]) => (
        <button key={texto} type="button" role="menuitem" className={claseItem} onClick={al}>
          <Icono className="h-3.5 w-3.5 text-muted-foreground" /> {texto}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export default ClicDerechoGlobal;

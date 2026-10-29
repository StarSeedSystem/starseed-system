"use client";
/**
 * ClicDerechoGlobal — anfitrión global del clic derecho «Variaciones públicas»
 * (Ola 1019V · §3 de architecture/variaciones-publicas.md). Escucha `contextmenu` y la
 * pulsación larga en todo el documento: si el elemento tiene menú propio no interviene; en
 * campos de texto y con Mayúsculas deja el menú del navegador; si hay clave muestra
 * «Variaciones públicas», «Publicar mi variación» y «Copiar enlace al elemento».
 * Teclado: tecla de menú y Mayúsculas+F10. Las decisiones son funciones puras.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Layers, Link2, PenSquare } from "lucide-react";
import { claveDesdeElemento, leerClave } from "@/lib/variaciones/clave-elemento";
import { abrirVariaciones } from "./variaciones-bus";
import { ETIQUETA_VARIACIONES } from "./accion-variaciones";

const ATRIBUTO_MENU_PROPIO = "data-ss-menu-propio";
const PULSACION_LARGA_MS = 500;
const TOLERANCIA_PULSACION_PX = 10;
const TIPOS_DE_TEXTO = new Set(["text", "search", "email", "url", "tel", "password", "number"]);
export type AccionClicDerecho = "navegador" | "propio" | "menu";
export interface DecisionClicDerecho { accion: AccionClicDerecho; clave: string | null }
/** Un input/textarea/select/contenteditable conserva su menú nativo (contrato §3). */
function esCampoDeTexto(el: Element | null): boolean {
  if (!el) return false;
  const etiqueta = el.tagName.toUpperCase();
  if (etiqueta === "TEXTAREA" || etiqueta === "SELECT") return true;
  if (etiqueta === "INPUT") return TIPOS_DE_TEXTO.has((el.getAttribute("type") ?? "text").toLowerCase());
  const editable = el.getAttribute("contenteditable");
  return editable === "" || editable === "true" || editable === "plaintext-only" || el.getAttribute("role") === "textbox";
}
/** El elemento o cualquiera de sus ancestros declara menú propio: el anfitrión no actúa. */
function tieneMenuPropio(el: Element | null): boolean {
  return Boolean(el?.closest(`[${ATRIBUTO_MENU_PROPIO}]`));
}
/** Decide sin tocar el DOM del menú: Mayúsculas gana, luego menú propio, texto y clave. */
function decidirClicDerecho(objetivo: Element | null, mayusculas = false): DecisionClicDerecho {
  if (mayusculas) return { accion: "navegador", clave: null };
  if (tieneMenuPropio(objetivo)) return { accion: "propio", clave: null };
  if (esCampoDeTexto(objetivo)) return { accion: "navegador", clave: null };
  const clave = claveDesdeElemento(objetivo);
  return clave ? { accion: "menu", clave } : { accion: "navegador", clave: null };
}
/** Enlace compartible al elemento: limpia query/ancla previas y añade `#elemento=<clave>`. */
function enlaceElemento(clave: string, base: string): string | null {
  if (!leerClave(clave)) return null;
  const limpia = base.split("#")[0].split("?")[0] || "/";
  return `${limpia}#elemento=${encodeURIComponent(clave)}`;
}
/** Pulsación larga: sin desplazarse más allá del margen táctil. */
function dentroDeTolerancia(desde: { x: number; y: number }, hasta: { x: number; y: number }): boolean {
  return Math.hypot(hasta.x - desde.x, hasta.y - desde.y) <= TOLERANCIA_PULSACION_PX;
}
/** Encaja el menú dentro de la ventana con un margen; nunca lo deja salir por los bordes. */
function limitarPosicion(x: number, y: number, anchoVista: number, altoVista: number, ancho = 260, alto = 132): { x: number; y: number } {
  return {
    x: Math.min(Math.max(8, x), Math.max(8, anchoVista - ancho - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, altoVista - alto - 8)),
  };
}
/** Coloca el menú bajo el elemento enfocado para teclado; si no cabe, encima. */
function posicionDeMenu(rect: { left: number; top: number; bottom: number }, anchoVista: number, altoVista: number, ancho = 260, alto = 132): { x: number; y: number } {
  const abajo = rect.bottom + 6;
  const y = abajo + alto <= altoVista - 8 ? abajo : Math.max(8, rect.top - alto - 6);
  return limitarPosicion(rect.left, y, anchoVista, altoVista, ancho, alto);
}
interface MenuAbierto { x: number; y: number; clave: string }
function ClicDerechoGlobal() {
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicioToque = useRef<{ x: number; y: number; el: Element | null } | null>(null);
  const limpiar = useCallback(() => { if (temporizador.current) clearTimeout(temporizador.current); temporizador.current = null; }, []);
  const abrir = useCallback((decision: DecisionClicDerecho, x: number, y: number) => {
    if (decision.accion !== "menu" || !decision.clave) { setMenu(null); return; }
    setMenu({ ...limitarPosicion(x, y, window.innerWidth, window.innerHeight), clave: decision.clave });
  }, []);
  useEffect(() => {
    const alContexto = (e: MouseEvent) => { const objetivo = e.target instanceof Element ? e.target : null; const decision = decidirClicDerecho(objetivo, e.shiftKey); if (decision.accion === "menu") e.preventDefault(); abrir(decision, e.clientX, e.clientY); };
    const alTocar = (e: TouchEvent) => {
      limpiar(); if (e.touches.length !== 1) { inicioToque.current = null; return; }
      const { clientX, clientY } = e.touches[0];
      inicioToque.current = { x: clientX, y: clientY, el: e.target instanceof Element ? e.target : null };
      temporizador.current = setTimeout(() => { const inicio = inicioToque.current; if (inicio) abrir(decidirClicDerecho(inicio.el), inicio.x, inicio.y); }, PULSACION_LARGA_MS);
    };
    const alMover = (e: TouchEvent) => { const inicio = inicioToque.current; if (!inicio || e.touches.length !== 1) return; const { clientX, clientY } = e.touches[0]; if (!dentroDeTolerancia(inicio, { x: clientX, y: clientY })) { inicioToque.current = null; limpiar(); } };
    const alSoltar = () => { inicioToque.current = null; limpiar(); };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenu(null); return; }
      if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
      const objetivo = document.activeElement instanceof Element ? document.activeElement : null;
      const decision = decidirClicDerecho(objetivo); if (decision.accion !== "menu") return;
      e.preventDefault(); const rect = objetivo?.getBoundingClientRect();
      const pos = rect ? posicionDeMenu(rect, window.innerWidth, window.innerHeight) : limitarPosicion(window.innerWidth / 2, window.innerHeight / 2, window.innerWidth, window.innerHeight);
      abrir(decision, pos.x, pos.y);
    };
    const alPulsar = (e: PointerEvent) => { const objetivo = e.target instanceof Element ? e.target : null; if (!objetivo?.closest("[data-ss-clic-derecho-global]")) setMenu(null); };
    document.addEventListener("contextmenu", alContexto); document.addEventListener("touchstart", alTocar, { passive: true }); document.addEventListener("touchmove", alMover, { passive: true });
    document.addEventListener("touchend", alSoltar); document.addEventListener("touchcancel", alSoltar); document.addEventListener("keydown", alTeclear); document.addEventListener("pointerdown", alPulsar);
    return () => { document.removeEventListener("contextmenu", alContexto); document.removeEventListener("touchstart", alTocar); document.removeEventListener("touchmove", alMover); document.removeEventListener("touchend", alSoltar); document.removeEventListener("touchcancel", alSoltar); document.removeEventListener("keydown", alTeclear); document.removeEventListener("pointerdown", alPulsar); limpiar(); };
  }, [abrir, limpiar]);
  const copiar = useCallback(async (clave: string) => { const enlace = enlaceElemento(clave, window.location.href); if (!enlace) return; try { await navigator.clipboard?.writeText(enlace); } catch { /* sin permiso del portapapeles */ } }, []);
  if (!menu) return null;
  const acciones = [
    { icono: Layers, texto: ETIQUETA_VARIACIONES, accion: () => abrirVariaciones(menu.clave) },
    { icono: PenSquare, texto: "Publicar mi variación", accion: () => abrirVariaciones(menu.clave, { publicar: true }) },
    { icono: Link2, texto: "Copiar enlace al elemento", accion: () => void copiar(menu.clave) },
  ];
  return (
    <div data-ss-clic-derecho-global={menu.clave} role="menu" aria-label="Acciones del elemento" style={{ left: menu.x, top: menu.y }} className="fixed z-[120] flex w-64 flex-col gap-1 rounded-2xl border border-border/60 bg-card/80 p-1.5 shadow-2xl backdrop-blur-2xl">
      <span className="px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{menu.clave}</span>
      {acciones.map(({ icono: Icono, texto, accion }) => (
        <button key={texto} type="button" role="menuitem" onClick={() => { accion(); setMenu(null); }} className="flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary">
          <Icono className="h-3.5 w-3.5 text-primary" /> {texto}
        </button>
      ))}
    </div>
  );
}

export { ATRIBUTO_MENU_PROPIO, PULSACION_LARGA_MS, TOLERANCIA_PULSACION_PX, esCampoDeTexto, tieneMenuPropio, decidirClicDerecho, enlaceElemento, dentroDeTolerancia, limitarPosicion, posicionDeMenu, ClicDerechoGlobal, ClicDerechoGlobal as default };

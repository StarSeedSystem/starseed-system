"use client";

/**
 * ClicDerechoGlobal — anfitrión del clic derecho «Variaciones públicas» en TODO el OS
 * (Ola 1019V · tarea N · contrato: architecture/variaciones-publicas.md §3–§7).
 * Si el objetivo tiene clave de elemento y no menú propio, muestra su menú con las tres
 * entradas; en campos de texto y con MAYÚSCULAS deja el menú del navegador.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Layers, Link, Send } from "lucide-react";
import { abrirVariaciones } from "./variaciones-bus";
import { claveDesdeElemento } from "@/lib/variaciones/clave-elemento";

/** Milisegundos de pulsación larga (mismo patrón que use-context-trigger.ts del Finder). */
export const LONG_PRESS_MS = 500;
const SLOP_TOQUE_PX = 10;

export interface ResolucionContexto {
  /** Clave canónica del elemento más cercano; null si no hay o no procede. */
  clave: string | null;
  /** El objetivo ya tiene menú propio (data-ss-menu-propio): no hacer nada. */
  propio: boolean;
  /** Campo de texto o MAYÚSCULAS: dejar pasar el menú del navegador. */
  navegador: boolean;
}

/** ¿El objetivo vive dentro de un campo de texto (input, textarea o contenteditable)? */
export function esCampoTexto(el: Element | null): boolean {
  return Boolean(el && el.closest("input, textarea, [contenteditable='true']"));
}

/** Clasifica el objetivo de un contexto: menú propio, menú del navegador o clave de elemento. */
export function resolverContexto(objetivo: Element | null, conMayusculas: boolean): ResolucionContexto {
  if (objetivo && objetivo.closest("[data-ss-menu-propio]")) {
    return { clave: null, propio: true, navegador: false };
  }
  if (conMayusculas || esCampoTexto(objetivo)) {
    return { clave: null, propio: false, navegador: true };
  }
  return { clave: claveDesdeElemento(objetivo), propio: false, navegador: false };
}

/** Enlace público y compartible a un elemento: ancla `#elemento=<clave>` en la página actual. */
export function enlaceDeElemento(
  clave: string,
  url: { origin: string; pathname: string } | null,
): string | null {
  if (!url) return null;
  return `${url.origin}${url.pathname}#elemento=${encodeURIComponent(clave)}`;
}

export interface ClicDerechoGlobalProps {
  /** Portapapeles inyectable para ver el enlace copiado en las pruebas. */
  portapapeles?: { writeText: (texto: string) => Promise<void> };
}

interface EstadoMenu { x: number; y: number; clave: string }

export function ClicDerechoGlobal({ portapapeles }: ClicDerechoGlobalProps) {
  const [menu, setMenu] = useState<EstadoMenu | null>(null);
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const toque = useRef<{ x: number; y: number; objetivo: Element | null } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarToque = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  const abrirEn = useCallback((x: number, y: number, objetivo: Element | null) => {
    const r = resolverContexto(objetivo, false);
    if (r.clave) setMenu({ x, y, clave: r.clave });
  }, []);

  // Oyentes permanentes del documento: clic derecho, pulsación larga y teclado.
  useEffect(() => {
    const alContexto = (e: Event) => {
      const me = e as MouseEvent;
      const objetivo = me.target instanceof Element ? me.target : null;
      const r = resolverContexto(objetivo, me.shiftKey);
      if (r.navegador || r.propio || !r.clave) return;
      me.preventDefault();
      setMenu({ x: me.clientX, y: me.clientY, clave: r.clave });
    };
    const alTocar = (e: Event) => {
      const te = e as TouchEvent;
      if (te.touches.length !== 1) return;
      const t = te.touches[0];
      toque.current = {
        x: t.clientX,
        y: t.clientY,
        objetivo: te.target instanceof Element ? te.target : null,
      };
      limpiarToque();
      temporizador.current = setTimeout(() => {
        try { navigator.vibrate?.(12); } catch { /* opcional */ }
        const actual = toque.current;
        if (actual) abrirEn(actual.x, actual.y, actual.objetivo);
      }, LONG_PRESS_MS);
    };
    const alMover = (e: Event) => {
      const te = e as TouchEvent;
      const inicio = toque.current;
      if (!inicio || te.touches.length !== 1 || !temporizador.current) return;
      const t = te.touches[0];
      if (Math.hypot(t.clientX - inicio.x, t.clientY - inicio.y) > SLOP_TOQUE_PX) limpiarToque();
    };
    const alTeclado = (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== "ContextMenu" && !(ke.shiftKey && ke.key === "F10")) return;
      const foco = document.activeElement instanceof Element ? document.activeElement : null;
      const objetivo = foco ?? (ke.target instanceof Element ? ke.target : null);
      const r = resolverContexto(objetivo, false);
      if (!r.clave) return;
      ke.preventDefault();
      const rect = foco?.getBoundingClientRect();
      const x = rect ? rect.left + 8 : Math.max(16, Math.round((window.innerWidth || 800) / 2 - 116));
      const y = rect ? rect.bottom + 8 : Math.max(16, Math.round((window.innerHeight || 600) / 2 - 40));
      setMenu({ x, y, clave: r.clave });
    };
    document.addEventListener("contextmenu", alContexto);
    document.addEventListener("touchstart", alTocar);
    document.addEventListener("touchmove", alMover);
    document.addEventListener("touchend", limpiarToque);
    document.addEventListener("touchcancel", limpiarToque);
    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("contextmenu", alContexto);
      document.removeEventListener("touchstart", alTocar);
      document.removeEventListener("touchmove", alMover);
      document.removeEventListener("touchend", limpiarToque);
      document.removeEventListener("touchcancel", limpiarToque);
      document.removeEventListener("keydown", alTeclado);
      limpiarToque();
    };
  }, [abrirEn, limpiarToque]);

  // Con el menú abierto: clic fuera, Escape y desplazamiento lo cierran.
  useEffect(() => {
    if (!menu) return;
    const alFuera = (e: Event) => {
      if (cajaRef.current && e.target instanceof Node && cajaRef.current.contains(e.target)) return;
      setMenu(null);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", alFuera, true);
    document.addEventListener("keydown", alEscape);
    window.addEventListener("scroll", alFuera, true);
    return () => {
      document.removeEventListener("mousedown", alFuera, true);
      document.removeEventListener("keydown", alEscape);
      window.removeEventListener("scroll", alFuera, true);
    };
  }, [menu]);

  if (!menu) return null;

  const abrirVariacion = (publicar: boolean) => () => {
    abrirVariaciones(menu.clave, publicar ? { publicar: true } : {});
    setMenu(null);
  };
  const copiar = () => {
    const enlace = enlaceDeElemento(menu.clave, typeof window === "undefined" ? null : window.location);
    setMenu(null);
    if (!enlace) return;
    const destino = portapapeles ?? navigator.clipboard;
    try { void destino?.writeText(enlace); } catch { /* sin portapapeles: nada pasa */ }
  };

  const entradas: ReadonlyArray<{ etiqueta: string; Icono: typeof Layers; al: () => void }> = [
    { etiqueta: "Variaciones públicas", Icono: Layers, al: abrirVariacion(false) },
    { etiqueta: "Publicar mi variación", Icono: Send, al: abrirVariacion(true) },
    { etiqueta: "Copiar enlace al elemento", Icono: Link, al: copiar },
  ];

  return (
    <div
      ref={cajaRef}
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[9999] min-w-[232px] overflow-hidden rounded-[var(--radius)] border border-border/60 bg-card/80 p-1.5 shadow-lg backdrop-blur-xl"
    >
      <span className="block px-3 pb-1 pt-1.5 font-mono text-[0.618rem] text-muted-foreground">{menu.clave}</span>
      {entradas.map(({ etiqueta, Icono, al }) => (
        <button
          key={etiqueta}
          type="button"
          role="menuitem"
          onClick={al}
          className="flex w-full cursor-pointer items-center gap-3 rounded-full px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground"
        >
          <Icono aria-hidden="true" className="size-4 opacity-70" />
          {etiqueta}
        </button>
      ))}
    </div>
  );
}

export default ClicDerechoGlobal;

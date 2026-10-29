"use client";

/**
 * `MenuTextoGlobal` (TRD1020E) — el único menú del clic derecho sobre texto del OS.
 * ---------------------------------------------------------------------------
 * Montado en `AppGlobals` (dentro de `SoloFueraDeConsola`), escucha `contextmenu`
 * en todo el documento. Si el evento ya viene atendido (`defaultPrevented`), se
 * pulsa Mayúsculas o el objetivo es editable, no hace nada: manda el menú del
 * navegador. Sobre texto, abre un menú propio en el puntero.
 *
 * Otras funciones (Traducir, Variaciones públicas) añaden entradas AL MISMO menú
 * con `registrarEntradaMenuTexto({id, etiqueta, visible, ejecutar})`. `ctx` lleva
 * la selección, el bloque bajo el puntero y si la página está traducida.
 *
 * Accesible: `role=menu` + `menuitem`, flechas, Escape y clic fuera cierran,
 * dianas de 44 px, cursor pointer y cristal líquido de la marca (igual que
 * `panel-orbe`: fondo #0A0F1D translúcido, blur, borde blanco/10).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export interface ContextoMenuTexto {
  /** Texto seleccionado en el momento de abrir (cadena vacía si no lo hay). */
  seleccion: string;
  /** Elemento bajo el puntero (`[data-bloque-texto]` si lo hay, si no el propio objetivo). */
  bloque: HTMLElement | null;
  /** Si la página está traducida (TRD1020C lo declara con `declararPaginaTraducida`). */
  paginaTraducida: boolean;
}

export interface EntradaMenuTexto {
  id: string;
  etiqueta: string;
  /** Icono opcional junto a la etiqueta (por defecto, solo texto). */
  icono?: LucideIcon;
  visible?: (ctx: ContextoMenuTexto) => boolean;
  ejecutar: (ctx: ContextoMenuTexto) => void;
}

const registros = new Map<string, EntradaMenuTexto>();

let paginaTraducidaAhora = false;
export function declararPaginaTraducida(traducida: boolean): void {
  paginaTraducidaAhora = traducida;
}
export function paginaEstaTraducida(): boolean {
  return paginaTraducidaAhora;
}

export function registrarEntradaMenuTexto(entrada: EntradaMenuTexto): () => void {
  registros.set(entrada.id, entrada);
  return () => {
    if (registros.get(entrada.id) === entrada) registros.delete(entrada.id);
  };
}

export function entradasVisiblesMenuTexto(ctx: ContextoMenuTexto): EntradaMenuTexto[] {
  return Array.from(registros.values()).filter((e) => e.visible?.(ctx) ?? true);
}

/** Ancho del menú (`w-56` = 224 px), margen con el borde y alto de diana. */
const ANCHO_MENU = 224;
const MARGEN = 8;
const PX_ITEM = 44;

/** Punto (left/top) donde el menú cabe entero en la ventana (alto estimado del menú). */
export function acoplarPuntoMenu(
  x: number,
  y: number,
  items: number,
  ventana: { interiorAncho: number; interiorAlto: number },
): { x: number; y: number } {
  const alto = items * PX_ITEM + MARGEN * 2;
  const x2 = Math.max(MARGEN, Math.min(x, ventana.interiorAncho - ANCHO_MENU - MARGEN));
  const y2 = Math.max(MARGEN, Math.min(y, ventana.interiorAlto - alto - MARGEN));
  return { x: x2, y: y2 };
}

/** ¿Procede abrir el menú propio, o toca el menú del navegador? */
export function menuDebeAbrir(
  evento: { defaultPrevented: boolean; shiftKey: boolean },
  objetivo: HTMLElement | null,
): boolean {
  if (evento.defaultPrevented || evento.shiftKey) return false;
  if (!objetivo) return false;
  if (objetivo.isContentEditable) return false;
  const editable = objetivo.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
  return !editable;
}

// Se completa abajo: el componente MenuTextoGlobal.

export function MenuTextoGlobal() {
  const [abierto, setAbierto] = useState<{ x: number; y: number; ctx: ContextoMenuTexto } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const cerrar = useCallback(() => setAbierto(null), []);

  useEffect(() => {
    const alClicDerecho = (evento: MouseEvent) => {
      const objetivo = evento.target instanceof HTMLElement ? evento.target : null;
      if (!menuDebeAbrir(evento, objetivo)) return; // el menú del navegador sigue
      const ctx: ContextoMenuTexto = {
        seleccion: window.getSelection?.()?.toString() ?? "",
        bloque: (objetivo?.closest("[data-bloque-texto]") as HTMLElement | null) ?? objetivo,
        paginaTraducida: paginaEstaTraducida(),
      };
      if (entradasVisiblesMenuTexto(ctx).length === 0) return; // nada que enseñar
      evento.preventDefault();
      setAbierto({ x: evento.clientX, y: evento.clientY, ctx });
    };
    document.addEventListener("contextmenu", alClicDerecho);
    return () => document.removeEventListener("contextmenu", alClicDerecho);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: Event) => {
      if (caja.current && !caja.current.contains(evento.target as Node)) cerrar();
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") cerrar();
    };
    document.addEventListener("pointerdown", fuera, true);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    items.current[0]?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", fuera, true);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto, cerrar]);

  const alTecladoMenu = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    const visibles = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = visibles.indexOf(document.activeElement as HTMLButtonElement);
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      visibles[(i + 1) % visibles.length]?.focus();
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      visibles[(i - 1 + visibles.length) % visibles.length]?.focus();
    } else if (evento.key === "Tab") {
      cerrar();
    }
  };

  if (!abierto) return null;
  const lista = entradasVisiblesMenuTexto(abierto.ctx);
  if (lista.length === 0) return null;
  const punto = acoplarPuntoMenu(abierto.x, abierto.y, lista.length, {
    interiorAncho: window.innerWidth,
    interiorAlto: window.innerHeight,
  });
  return (
    <div
      ref={caja}
      role="menu"
      aria-label="Acciones sobre el texto"
      onKeyDown={alTecladoMenu}
      className="fixed z-[1100] w-56 rounded-2xl border border-white/10 bg-[#0A0F1D]/95 p-1 text-white shadow-lg shadow-black/50 backdrop-blur-[16px]"
      style={{ left: `${punto.x}px`, top: `${punto.y}px` }}
    >
      {lista.map((entrada, i) => {
        const Icono = entrada.icono;
        return (
          <button
            key={entrada.id}
            ref={(el) => { items.current[i] = el; }}
            type="button"
            role="menuitem"
            onClick={() => {
              const ctx = abierto.ctx;
              cerrar();
              entrada.ejecutar(ctx);
            }}
            className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
          >
            {Icono ? <Icono className="h-4 w-4 shrink-0 text-[#00F0FF]" aria-hidden="true" /> : null}
            {entrada.etiqueta}
          </button>
        );
      })}
    </div>
  );
}

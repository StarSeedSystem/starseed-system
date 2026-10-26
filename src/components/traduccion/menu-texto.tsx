"use client";

/**
 * Menú global del clic derecho sobre texto (Ola 1020U · TRD1020E · contrato
 * architecture/repos-libreria-1020d.md §4). Montado en `AppGlobals`, dentro de
 * `SoloFueraDeConsola`, escucha `contextmenu` en todo el documento:
 *
 *   · si el evento ya viene atendido (`defaultPrevented`), se pulsa Mayúsculas o
 *     el objetivo es editable → el menú del navegador, y este no hace nada;
 *   · sobre texto, abre UN menú propio en el puntero, con las entradas que otras
 *     piezas del OS registran (`registrarEntradaMenuTexto`: «Traducir selección»,
 *     «Variaciones públicas»…). Sin entradas visibles no se abre nada: manda el
 *     navegador, que siempre es honesto y gratuito.
 *   · `ctx` lleva la selección, el bloque bajo el puntero y si la página está traducida.
 *
 * Accesible: `role=menu`/`menuitem`, flechas, Escape y clic fuera cierran, dianas
 * de 44 px y cristal líquido de la marca (como `panel-orbe.tsx`).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextoMenuTexto {
  seleccion: string;
  bloque: string | null;
  paginaTraducida: boolean;
}

export type EntradaMenuTexto = {
  id: string;
  etiqueta: string;
  visible?: (ctx: ContextoMenuTexto) => boolean;
  ejecutar: (ctx: ContextoMenuTexto) => void;
};

interface Ubicacion { x: number; y: number; ctx: ContextoMenuTexto; entradas: EntradaMenuTexto[] }

/** Registro compartido (una sola capa de menú, también para Variaciones públicas). */
const ENTRADAS: EntradaMenuTexto[] = [];

/** Añade una entrada al menú global del clic derecho. No duplica por `id`. */
export function registrarEntradaMenuTexto(e: EntradaMenuTexto): void {
  const i = ENTRADAS.findIndex((x) => x.id === e.id);
  if (i >= 0) ENTRADAS[i] = e;
  else ENTRADAS.push(e);
}

/** Limpia el registro (solo lo usan las pruebas; deja el menú como al cargar). */
export function reiniciarEntradasMenuTexto(): void {
  ENTRADAS.splice(0, ENTRADAS.length);
}

/** ¿El objetivo pide el menú del navegador (campo editable o contenido editable)? */
export function esObjetivoEditable(objetivo: Element | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false;
  return objetivo.isContentEditable || Boolean(objetivo.closest("input, textarea, select, [contenteditable]"));
}

/** Reduce la selección y el bloque a un tamaño prudente y quita espacios sobrantes. */
export function prepararContexto(seleccion: string, bloque: string | null, paginaTraducida: boolean): ContextoMenuTexto {
  const limpiar = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 280);
  return { seleccion: limpiar(seleccion), bloque: bloque === null ? null : limpiar(bloque), paginaTraducida };
}

/** Sujeta el menú a la ventana (58 px por debajo y a la derecha: se ve entero). */
export function posicionMenu(x: number, y: number, viewport?: { innerWidth: number; innerHeight: number }): { x: number; y: number } {
  const w = viewport?.innerWidth ?? (typeof window === "undefined" ? 1024 : window.innerWidth);
  const h = viewport?.innerHeight ?? (typeof window === "undefined" ? 768 : window.innerHeight);
  return { x: Math.min(Math.max(x, 8), Math.max(w - 190, 8)), y: Math.min(Math.max(y, 8), Math.max(h - 58, 8)) };
}

/** Bloque de texto bajo el puntero: el ancestro con significado más cercano. */
const SELECTOR_BLOQUE = "p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, figcaption, dt, dd, span";

function hijosBloque(objetivo: Element | null): string | null {
  const el = objetivo?.closest(SELECTOR_BLOQUE) ?? null;
  return el && el.textContent?.trim() ? el.textContent : null;
}

/** ¿El documento habla el idioma del lector? Lo marca TRD1020C («data-pagina-traducida») al traducir entera. */
function estaTraducida(): boolean {
  return document.documentElement.getAttribute("data-pagina-traducida") === "1";
}

/** Componente anfitrión: escucha `contextmenu` y dibuja el menú cuando hay entradas. */
export function MenuTextoGlobal() {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const ventanita = useRef<HTMLDivElement>(null);

  // Al abrirse el menú, el foco entra en su primera entrada (teclado completo).
  useEffect(() => {
    if (!ubicacion) return;
    ventanita.current?.focus({ preventScroll: true });
    ventanita.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [ubicacion]);

  useEffect(() => {
    const alAbrir = (e: MouseEvent) => {
      if (e.defaultPrevented || e.shiftKey || esObjetivoEditable(e.target instanceof Element ? e.target : null)) return;
      const seleccion = (window.getSelection()?.toString() ?? "").trim();
      const ctx = prepararContexto(seleccion, hijosBloque(e.target instanceof Element ? e.target : null), estaTraducida());
      const visibles = ENTRADAS.filter((x) => !x.visible || x.visible(ctx));
      if (visibles.length === 0) return;
      e.preventDefault();
      setUbicacion({ ...posicionMenu(e.clientX, e.clientY), ctx, entradas: visibles });
    };
    document.addEventListener("contextmenu", alAbrir);
    const alCerrar = () => setUbicacion(null);
    window.addEventListener("pointerdown", alCerrar);
    window.addEventListener("blur", alCerrar);
    return () => {
      document.removeEventListener("contextmenu", alAbrir);
      window.removeEventListener("pointerdown", alCerrar);
      window.removeEventListener("blur", alCerrar);
    };
  }, []);

  if (!ubicacion) return null;
  return createPortal(
    <div
      ref={ventanita}
      role="menu"
      aria-label="Menú del texto"
      onKeyDown={(e) => {
        const vis = ubicacion.entradas;
        if (e.key === "Escape") { e.preventDefault(); setUbicacion(null); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const items = ventanita.current?.querySelectorAll<HTMLElement>("[role=menuitem]");
          if (!items || items.length === 0) return;
          const actuales = Array.from(items);
          const i = actuales.findIndex((el) => el === document.activeElement);
          const paso = e.key === "ArrowDown" ? 1 : -1;
          const destino = actuales[(Math.max(i, 0) + paso + vis.length) % vis.length];
          destino?.focus();
        }
      }}
      style={{ left: ubicacion.x, top: ubicacion.y }}
      className="fixed z-[80] min-w-[176px] overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b10]/90 shadow-2xl shadow-black/50 backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {ubicacion.entradas.map((entrada) => (
        <button
          key={entrada.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          data-id-entrada={entrada.id}
          onClick={() => {
            setUbicacion(null);
            entrada.ejecutar(ubicacion.ctx);
          }}
          className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm text-white/85 transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
        >
          {entrada.etiqueta}
        </button>
      ))}
    </div>,
    document.body,
  );
}



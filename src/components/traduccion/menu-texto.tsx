"use client";
/**
 * Menú del clic derecho sobre textos del OS (Ola 1020U · TRD1020E).
 * Escucha `contextmenu` en todo el documento: si el navegador ya atendió el evento
 * (`defaultPrevented`), se pulsa Mayúsculas o el objetivo es editable, manda el menú del
 * navegador; si no, y hay texto, abre el menú propio en el puntero con las entradas
 * registradas (Traducir, Variaciones públicas…). Cristal líquido, role=menu, flechas,
 * Escape y clic fuera cierran, dianas de 44 px.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Lo que ve una entrada: la selección, el bloque bajo el puntero y si la página está traducida. */
export interface ContextoMenuTexto {
  readonly seleccion: string;
  readonly objetivo: Element | null;
  readonly paginaTraducida: boolean;
}

export interface EntradaMenuTexto {
  readonly id: string;
  readonly etiqueta: string;
  /** Si no se declara, la entrada se ve siempre. */
  readonly visible?: (ctx: ContextoMenuTexto) => boolean;
  readonly ejecutar: (ctx: ContextoMenuTexto) => void;
}

let entradas: EntradaMenuTexto[] = [];
let paginaTraducida = false;

/** Marca que la página está traducida por el motor de la marca (TRD1020C lo llama). */
export function establecerPaginaTraducida(valor: boolean): void {
  paginaTraducida = valor;
}

/** Añade una entrada al MISMO menú; devuelve cómo la quita. */
export function registrarEntradaMenuTexto(entrada: EntradaMenuTexto): () => void {
  entradas = [...entradas.filter((x) => x.id !== entrada.id), entrada];
  return () => {
    entradas = entradas.filter((x) => x.id !== entrada.id);
  };
}

/** Solo entradas que quieren verse en este contexto. */
export function entradasVisibles(
  lista: readonly EntradaMenuTexto[],
  ctx: ContextoMenuTexto,
): EntradaMenuTexto[] {
  return lista.filter((e) => e.visible?.(ctx) ?? true);
}

/** Un campo editable manda el menú del navegador, no el nuestro. */
export function esEditable(objetivo: Element | null): boolean {
  if (!objetivo) return false;
  if ((objetivo as HTMLElement).isContentEditable) return true;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(objetivo.tagName)) return true;
  return objetivo.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") !== null;
}

/** Decide si el clic derecho abre el menú de la marca o se lo deja al navegador. */
export function abreMenuTexto(
  evento: { defaultPrevented?: boolean; shiftKey?: boolean },
  objetivo: Element | null,
  hayTexto: boolean,
): boolean {
  return (
    objetivo !== null && !evento.defaultPrevented && !evento.shiftKey && hayTexto && !esEditable(objetivo)
  );
}

/** Coloca el menú en el puntero sin salirse de la ventana (margen de 8 px). */
export function posicionMenu(
  x: number,
  y: number,
  ancho: number,
  alto: number,
  vista: { ancho: number; alto: number },
): { izquierda: number; arriba: number } {
  const margen = 8;
  return {
    izquierda: Math.round(Math.max(margen, Math.min(x, vista.ancho - ancho - margen))),
    arriba: Math.round(Math.max(margen, Math.min(y, vista.alto - alto - margen))),
  };
}

const ANCHO = 224;
const ALTO_ITEM = 44;

/** Se monta UNA vez en AppGlobals; el resto del OS solo registra entradas. */
export function MenuTexto() {
  const [abierto, setAbierto] = useState(false);
  const [ctx, setCtx] = useState<ContextoMenuTexto | null>(null);
  const [visibles, setVisibles] = useState<EntradaMenuTexto[]>([]);
  const [pos, setPos] = useState({ izquierda: 0, arriba: 0 });
  const refMenu = useRef<HTMLDivElement>(null);
  const cerrar = useCallback(() => setAbierto(false), []);

  useEffect(() => {
    const abrir = (e: MouseEvent) => {
      const objetivo = e.target instanceof Element ? e.target : null;
      const seleccion = window.getSelection?.()?.toString().trim() ?? "";
      const hayTexto = seleccion.length > 0 || Boolean(objetivo?.textContent?.trim());
      if (!abreMenuTexto(e, objetivo, hayTexto) || objetivo?.closest("[data-menu-texto]")) return;
      const contexto: ContextoMenuTexto = { seleccion, objetivo, paginaTraducida };
      const aVer = entradasVisibles(entradas, contexto);
      if (aVer.length === 0) return;
      e.preventDefault();
      setPos(
        posicionMenu(e.clientX, e.clientY, ANCHO, aVer.length * ALTO_ITEM + 8, {
          ancho: window.innerWidth,
          alto: window.innerHeight,
        }),
      );
      setCtx(contexto);
      setVisibles(aVer);
      setAbierto(true);
    };
    const fuera = (e: Event) => {
      if (!refMenu.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("contextmenu", abrir);
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("scroll", cerrar, true);
    return () => {
      document.removeEventListener("contextmenu", abrir);
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("scroll", cerrar, true);
    };
  }, [cerrar]);

  useEffect(() => {
    if (abierto) refMenu.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [abierto]);

  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); cerrar(); return; }
    if (e.key === "Tab") { cerrar(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const botones = Array.from(refMenu.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    botones[(i + (e.key === "ArrowDown" ? 1 : botones.length - 1)) % botones.length]?.focus();
  };

  return (
    <>
      {abierto && ctx && (
        <div
          ref={refMenu}
          data-menu-texto=""
          role="menu"
          aria-label="Menú del texto"
          onKeyDown={alTeclado}
          style={{ left: pos.izquierda, top: pos.arriba }}
          className="fixed z-[1200] w-56 rounded-2xl border border-white/10 bg-[#0A0F1D]/95 p-1 text-white shadow-lg shadow-black/50 backdrop-blur-[16px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.15)]"
        >
          {visibles.map((entrada) => (
            <button
              key={entrada.id}
              type="button"
              role="menuitem"
              onClick={() => {
                if (!ctx) return;
                cerrar();
                entrada.ejecutar(ctx);
              }}
              className="flex min-h-[44px] w-full cursor-pointer items-center rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
            >
              {entrada.etiqueta}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

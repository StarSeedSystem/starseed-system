"use client";
/**
 * Menú del clic derecho sobre textos (Ola 1020U · TRD1020E) — contrato: architecture/repos-libreria-1020d.md §4.
 * UNA capa de menú sobre el texto de cualquiera; las funciones que quieran (Traducir TRD1020G, las Variaciones
 * públicas…) registran ahí sus entradas con `registrarEntradaMenuTexto`. Con `defaultPrevented`, Mayúsculas
 * o un objetivo editable no hace nada (manda el menú del navegador); sin texto o sin entradas visibles
 * tampoco abre. role="menu"/menuitem, flechas, Escape y clic fuera cierran; dianas de 44 px y cristal líquido
 * de la marca (como src/components/protomolecula/panel-orbe.tsx).
 */
import { useEffect, useRef, useState, type KeyboardEvent as TecladoReact } from "react";

/** Lo que ve cada entrada en el momento del clic: la selección, el bloque bajo el puntero y si la
 * página va traducida; ese estado lo avisa el módulo de la página entera (TRD1020C). */
export interface ContextoMenuTexto { seleccion: string; bloque: string; paginaTraducida: boolean }

/** Entrada registrada por otra función (id único: el mismo id sustituye); el componente solo las hospeda. */
export interface EntradaMenuTexto { id: string; etiqueta: string; visible?(ctx: ContextoMenuTexto): boolean; ejecutar?(ctx: ContextoMenuTexto): void | Promise<void> }

const ENTRADAS = new Map<string, EntradaMenuTexto>();
let paginaAhora = false;

/** Añade (o sustituye) una entrada del menú del clic derecho; devuelve cómo quitarla. */
export function registrarEntradaMenuTexto(e: EntradaMenuTexto): () => void {
  ENTRADAS.set(e.id, e);
  return () => { ENTRADAS.delete(e.id); };
}
/** Foto del registro (para las pruebas y para depurar). */
export function entradasMenuTexto(): EntradaMenuTexto[] { return [...ENTRADAS.values()]; }
/** El módulo de la página entera avisa aquí su estado. */
export function marcarPaginaTraducida(estaTraducida: boolean): void { paginaAhora = estaTraducida; }
/** Reinicia el registro y el estado de página (uso de las pruebas). */
export function _reiniciarMenuTexto(): void { ENTRADAS.clear(); paginaAhora = false; }

const CAMPOS_EDITABLES = "input, textarea, select";
const BLOQUES = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "TD", "TH", "CAPTION", "FIGCAPTION", "DT", "DD", "PRE", "SUMMARY"]);

/** Campos y contenteditable: ahí manda el menú del navegador, no el nuestro. */
const esEditable = (el: Element): boolean =>
  Boolean(el.closest(CAMPOS_EDITABLES) || el.closest('[contenteditable="true"], [role="textbox"]') || (el instanceof HTMLElement && el.isContentEditable));

/** Texto del bloque bajo el puntero: el antepasado de bloque conocido más cercano con texto; si no lo hay, lo que haya bajo el puntero (una página entera de una vez no es bloque). */
function textoDeBloque(el: Element): string {
  let deBloque: Element | null = null;
  let conTexto: Element | null = null;
  for (let n: Element | null = el, i = 0; n && n !== document.body && i < 8; i += 1, n = n.parentElement) {
    if (!deBloque && BLOQUES.has(n.tagName)) deBloque = n;
    if (!conTexto && Boolean((n.textContent || "").trim())) conTexto = n;
  }
  const texto = conTexto ? (conTexto.textContent || "").trim() : "";
  return deBloque ? texto : texto.length > 400 ? "" : texto;
}
/** El menú abierto: puntero, entradas que pasaron el filtro y contexto del clic. */
interface MenuAbierto { x: number; y: number; entradas: EntradaMenuTexto[]; ctx: ContextoMenuTexto }

/** Escucha el `contextmenu` de toda la app y hospeda el menú compartido de los textos. */
export function MenuTexto() {
  const [menu, setMenu] = useState<MenuAbierto | null>(null);
  const menuVivo = useRef<MenuAbierto | null>(null);
  menuVivo.current = menu;
  const raiz = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const cerrar = () => setMenu(null);
    const alClicDerecho = (e: PointerEvent) => {
      if (e.defaultPrevented || e.shiftKey) return;
      const objetivo = e.target instanceof Element ? e.target : null;
      if (!objetivo || esEditable(objetivo)) return;
      const ctx: ContextoMenuTexto = { seleccion: (window.getSelection()?.toString() ?? "").trim(),
        bloque: textoDeBloque(objetivo), paginaTraducida: paginaAhora };
      if (!ctx.seleccion && !ctx.bloque) return;
      const entradas = entradasMenuTexto().filter((x) => x.visible?.(ctx) ?? true);
      if (!entradas.length) return;
      e.preventDefault();
      items.current = [];
      setMenu({ x: Math.min(Math.max(e.clientX, 8), Math.max(window.innerWidth - 264, 8)),
        y: Math.min(Math.max(e.clientY, 8), Math.max(window.innerHeight - 8 - entradas.length * 44, 8)), entradas, ctx });
    };
    const alEscape = (e: KeyboardEvent) => { if (e.key === "Escape" && menuVivo.current) cerrar(); };
    const alFuera = (e: Event) => { if (menuVivo.current && e.target instanceof Node && !raiz.current?.contains(e.target)) cerrar(); };
    document.addEventListener("contextmenu", alClicDerecho);
    document.addEventListener("keydown", alEscape);
    document.addEventListener("pointerdown", alFuera);
    document.addEventListener("scroll", cerrar, { capture: true });
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("contextmenu", alClicDerecho);
      document.removeEventListener("keydown", alEscape);
      document.removeEventListener("pointerdown", alFuera);
      document.removeEventListener("scroll", cerrar, { capture: true });
      window.removeEventListener("resize", cerrar);
    };
  }, []);

  useEffect(() => { if (menu) items.current[0]?.focus({ preventScroll: true }); }, [menu]);

  const alTecladoMenu = (e: TecladoReact<HTMLDivElement>) => {
    const lista = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = lista.findIndex((b) => b === document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); lista[(i + 1) % lista.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); lista[(i - 1 + lista.length) % lista.length]?.focus(); }
    else if (e.key === "Tab") setMenu(null);
  };

  if (!menu) return null;
  return (
    <div ref={raiz} role="menu" aria-label="Acciones sobre el texto" onKeyDown={alTecladoMenu}
      style={{ left: menu.x, top: menu.y }}
      className="fixed z-[1200] w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-white/10 bg-[#0A0F1D]/85 p-1 text-white shadow-xl shadow-black/40 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-[16px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200">
      {menu.entradas.map((entrada, i) => (
        <button key={entrada.id} ref={(el) => { items.current[i] = el; }} type="button" role="menuitem"
          onClick={() => { setMenu(null); try { void entrada.ejecutar?.(menu.ctx); } catch (e) { console.error("La entrada del menú de textos falló:", e); } }}
          className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/80">
          {entrada.etiqueta}
        </button>
      ))}
    </div>
  );
}

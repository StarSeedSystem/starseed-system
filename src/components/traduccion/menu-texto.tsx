"use client";
/**
 * Menú del clic derecho sobre texto (TRD1020E · Ola 1020U, contrato
 * architecture/repos-libreria-1020d.md §4). Se monta UNA vez en AppGlobals
 * (SoloFueraDeConsola). UNA capa de menú contextual: si el evento ya viene
 * atendido, con Mayúsculas o sobre un campo editable manda el del navegador;
 * sobre texto abre el menú propio en el puntero con las entradas del registro
 * compartido de Traducir, «Variaciones públicas» y las que se añadan.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
/** Contexto que recibe cada entrada: la selección, el bloque bajo el puntero y si la página está traducida. */
export interface ContextoMenuTexto {
  seleccion: string; // sin bordes; "" si no hay
  bloque: string | null; // texto del párrafo, encabezado… bajo el puntero
  paginaTraducida: boolean; // TRD1020C lo avisa con `starseed:traduccion-pagina`
}
/** Entrada del menú compartido; la registra su función de origen (Traducir, Variaciones públicas…). */
export interface EntradaMenuTexto {
  id: string; // clave estable y única en el registro
  etiqueta: string;
  visible?(ctx: ContextoMenuTexto): boolean; // ¿se ve en este contexto? por defecto, siempre
  ejecutar(ctx: ContextoMenuTexto): void; // el menú se cierra antes de llamarla
}
// Registro compartido: todos los menús de texto son ESE (una sola capa de menú, no dos).
const REGISTRO = new Map<string, EntradaMenuTexto>();
/** Añade una entrada al menú del clic derecho y devuelve su baja (para desmontajes y pruebas). */
export function registrarEntradaMenuTexto(entrada: EntradaMenuTexto): () => void {
  REGISTRO.set(entrada.id, entrada);
  return () => {
    if (REGISTRO.get(entrada.id) === entrada) REGISTRO.delete(entrada.id);
  };
}
const ANCLAS_TEXTO = "p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,figcaption,dt,dd,label,a,pre,code,summary,time,span";
/** Texto del bloque bajo el puntero: el antepasado textual más cercano y, si no, el propio objetivo. */
function textoDeBloque(objetivo: HTMLElement): string | null {
  const ancla = objetivo.closest<HTMLElement>(ANCLAS_TEXTO) ?? objetivo;
  return (ancla.textContent ?? "").trim() || null;
}
/** Campos editables del navegador: ahí manda su menú, no el nuestro. */
function esEditable(nodo: HTMLElement): boolean {
  const t = nodo.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || nodo.isContentEditable;
}
// Medidas para que el menú abierto junto a un borde no salga de la pantalla.
const ANCHO_MENU = 232, ALTO_MENU = 160; // px
export function MenuTexto() {
  const [abierto, setAbierto] = useState(false);
  const [ctx, setCtx] = useState<ContextoMenuTexto | null>(null);
  const [visibles, setVisibles] = useState<EntradaMenuTexto[]>([]);
  const [pos, setPos] = useState({ x: 8, y: 8 });
  const paginaTraducida = useRef(false);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const raiz = useRef<HTMLDivElement>(null);
  // TRD1020C avisa con `starseed:traduccion-pagina` (detail.traducida); el próximo clic lo lleva en ctx.
  useEffect(() => {
    const oir = (e: Event) => {
      const detalle = (e as CustomEvent<{ traducida?: unknown }>).detail;
      if (detalle && typeof detalle.traducida === "boolean") paginaTraducida.current = detalle.traducida;
    };
    const abrir = (e: MouseEvent) => {
      if (e.defaultPrevented || e.shiftKey) return; // ya atendido o Mayúsculas: menú del navegador.
      const objetivo = e.target instanceof HTMLElement ? e.target : null;
      if (!objetivo || esEditable(objetivo) || raiz.current?.contains(objetivo)) return;
      const nuevoCtx: ContextoMenuTexto = {
        seleccion: (window.getSelection?.()?.toString() ?? "").trim(),
        bloque: textoDeBloque(objetivo),
        paginaTraducida: paginaTraducida.current,
      };
      if (!nuevoCtx.bloque) return; // sin texto debajo no es «sobre texto».
      const lista = [...REGISTRO.values()].filter((en) => !en.visible || en.visible(nuevoCtx));
      if (lista.length === 0) return; // nada que enseñar: el navegador decide.
      e.preventDefault();
      items.current = []; setCtx(nuevoCtx); setVisibles(lista);
      setPos({ x: Math.max(8, Math.min(e.clientX, window.innerWidth - ANCHO_MENU - 8)), y: Math.max(8, Math.min(e.clientY, window.innerHeight - ALTO_MENU - 8)) });
      setAbierto(true);
    };
    const alCerrar = () => { window.removeEventListener("starseed:traduccion-pagina", oir); window.removeEventListener("contextmenu", abrir); };
    window.addEventListener("starseed:traduccion-pagina", oir);
    window.addEventListener("contextmenu", abrir);
    return alCerrar;
  }, []);

  // Al abrirse el foco entra al primer elemento; mientras abierto, un clic fuera (cualquier botón) cierra.
  useEffect(() => {
    if (!abierto) return;
    items.current[0]?.focus();
    const fuera = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLElement) || !raiz.current?.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  // Flechas recorren con eco (la vuelta llega al otro extremo); Escape y Tab cierran.
  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); if (e.key === "Escape") e.stopPropagation(); setAbierto(false); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const n = visibles.length, i = items.current.findIndex((x) => x === document.activeElement);
    const paso = e.key === "ArrowDown" ? 1 : -1;
    items.current[(((i + paso) % n) + n) % n]?.focus();
  };

  if (!abierto || !ctx) return null;
  return createPortal(
    <div ref={raiz} role="menu" aria-label="Acciones de texto" style={{ left: pos.x, top: pos.y }}
      onKeyDown={alTeclado}
      className="fixed z-[1200] w-56 rounded-2xl border border-white/10 bg-[#0A0F1D]/95 p-1 text-white shadow-lg shadow-black/50 backdrop-blur-[16px] animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none">
      {visibles.map((en, i) => (
        <button key={en.id} type="button" role="menuitem" ref={(el) => { items.current[i] = el; }}
          onClick={() => { setAbierto(false); en.ejecutar(ctx); }}
          className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none">
          {en.etiqueta}
        </button>
      ))}
    </div>,
    document.body,
  );
}

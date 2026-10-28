"use client";
/**
 * Menú del clic derecho sobre textos (TRD1020E · repos-libreria-1020d.md §4). Sobre texto abre
 * el menú propio en el puntero; si el evento ya viene atendido, con Mayúsculas o en un campo
 * editable manda el del navegador. `registrarEntradaMenuTexto` es el REGISTRO compartido:
 * Traducir (TRD1020G) y «Variaciones públicas» ponen sus entradas en ESTE mismo menú.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface CtxMenuTexto {
    seleccion: string;
    bloque: string;
    paginaTraducida: boolean;
    x: number;
    y: number;
    objetivo: HTMLElement | null;
}

export interface EntradaMenuTexto {
    id: string;
    etiqueta: string;
    visible?: (ctx: CtxMenuTexto) => boolean;
    ejecutar: (ctx: CtxMenuTexto) => void;
}

const entradas = new Map<string, EntradaMenuTexto>();

/** Marca una entrada y devuelve la baja. El mismo `id` reemplaza la anterior. */
export function registrarEntradaMenuTexto(entrada: EntradaMenuTexto): () => void {
    entradas.set(entrada.id, entrada);
    return () => { if (entradas.get(entrada.id) === entrada) entradas.delete(entrada.id); };
}

/** Campos y editores: ahí manda el menú del navegador (misma regla que `pagina.ts`). */
export function objetivoEditable(objetivo: EventTarget | null): boolean {
    return objetivo instanceof Element && objetivo.closest("input, textarea, select, [contenteditable]") !== null;
}

/** Marca que deja `aplicar` de `pagina.ts` (TRD1020C): la página quedó traducida. */
export function paginaTraducida(raiz: ParentNode): boolean {
    return raiz.querySelector('[data-traducido="true"]') !== null;
}

/** ¿Abre el menú propio? Solo: sin atender antes, sin Mayúsculas, no editable y con texto delante. */
export function abrirMenuTexto(o: { atendido: boolean; mayusculas: boolean; editable: boolean; conTexto: boolean }): boolean {
    return !o.atendido && !o.mayusculas && !o.editable && o.conTexto;
}

/** Pone la caja (224 px de ancho) dentro de la ventana, con margen de 8 px. */
export function posicionMenu(x: number, y: number, alto: number, v: { innerWidth: number; innerHeight: number }): { left: number; top: number } {
    return { left: Math.max(8, Math.min(x, v.innerWidth - 232)), top: Math.max(8, Math.min(y, v.innerHeight - alto - 8)) };
}

export function MenuTexto() {
    const [ctx, setCtx] = useState<CtxMenuTexto | null>(null);
    const del = useRef<Array<HTMLButtonElement | null>>([]);
    const caja = useRef<HTMLDivElement>(null);
    const cerrar = useCallback(() => setCtx(null), []);

    useEffect(() => {
        const alContexto = (e: MouseEvent) => {
            const objetivo = e.target instanceof Element ? e.target : null;
            const texto = window.getSelection()?.toString().trim() ?? "";
            const conTexto = texto.length > 0 || Boolean(objetivo?.textContent?.trim());
            if (!abrirMenuTexto({ atendido: e.defaultPrevented, mayusculas: e.shiftKey, editable: objetivoEditable(e.target), conTexto })) return;
            e.preventDefault();
            setCtx({
                seleccion: texto,
                bloque: (objetivo?.textContent ?? "").trim().slice(0, 240),
                paginaTraducida: paginaTraducida(document),
                x: e.clientX,
                y: e.clientY,
                objetivo: objetivo instanceof HTMLElement ? objetivo : null,
            });
        };
        window.addEventListener("contextmenu", alContexto);
        return () => window.removeEventListener("contextmenu", alContexto);
    }, []);

    useEffect(() => {
        if (!ctx) return;
        const delPuntero = (e: Event) => { if (!caja.current?.contains(e.target as Node)) cerrar(); };
        const delTecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
        window.addEventListener("pointerdown", delPuntero, true);
        window.addEventListener("keydown", delTecla);
        return () => {
            window.removeEventListener("pointerdown", delPuntero, true);
            window.removeEventListener("keydown", delTecla);
        };
    }, [ctx, cerrar]);

    const visibles = ctx ? Array.from(entradas.values()).filter((c) => c.visible?.(ctx) !== false) : [];

    useEffect(() => { if (ctx) del.current.find((b) => b?.isConnected)?.focus(); }, [ctx]);

    const alFlechas = (e: React.KeyboardEvent) => {
        const items = del.current.filter((b): b is HTMLButtonElement => Boolean(b?.isConnected));
        const i = items.findIndex((b) => b === document.activeElement);
        const paso = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
        if (paso === 0 || i < 0) return;
        e.preventDefault();
        items[(((i + paso) % items.length) + items.length) % items.length]?.focus();
    };

    if (!ctx || visibles.length === 0) return null;
    const pos = posicionMenu(ctx.x, ctx.y, visibles.length * 44 + 8, window);
    return (
        <div ref={caja} role="menu" aria-label="Acciones del texto" onKeyDown={alFlechas} style={pos}
            className="fixed z-[1002] w-56 rounded-2xl border border-white/10 bg-[#0A0F1D]/90 p-1 shadow-lg shadow-black/50 backdrop-blur-[16px] [box-shadow:inset_0_1px_0_rgba(255,255,255,0.15)] animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none">
            {visibles.map((c, i) => (
                <button key={c.id} ref={(el) => { del.current[i] = el; }} type="button" role="menuitem"
                    onClick={() => { cerrar(); c.ejecutar(ctx); }}
                    className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm text-white transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none">
                    {c.etiqueta}
                </button>
            ))}
        </div>
    );
}

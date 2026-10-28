"use client";

/*
 * Menú del clic derecho sobre texto (TRD1020E · repos-libreria-1020d.md §4). Montado UNA vez en
 * AppGlobals dentro de SoloFueraDeConsola. Escucha `contextmenu`: si el evento ya viene atendido
 * (defaultPrevented), se pulsa Mayúsculas o el objetivo es editable, no hace nada (manda el menú
 * del navegador); sobre texto, abre UN menú propio en el puntero. Traducir (TRD1020G), Variaciones
 * públicas y demás añaden entradas al MISMO menú con `registrarEntradaMenuTexto`. Accesible:
 * role=menu/menuitem, flechas, Escape y clic fuera cierran, dianas de 44 px, cristal líquido.
 */
import { useEffect, useRef, useState } from "react";

/** Contexto que recibe cada entrada al abrirse: la selección (vacío si no la había),
 * el texto del elemento bajo el puntero (null si no hay) y si la página está traducida. */
export interface ContextoMenuTexto {
    seleccion: string;
    bloque: string | null;
    paginaTraducida: boolean;
}

/** Una acción del menú. `visible` decide por contexto (se omite: siempre visible). */
export interface EntradaMenuTexto {
    id: string;
    etiqueta: string;
    visible?: (ctx: ContextoMenuTexto) => boolean;
    ejecutar: (ctx: ContextoMenuTexto) => void;
}

/* Registro COMPARTIDO de entradas, en el orden de registro y sin duplicar id. */
const entradas: EntradaMenuTexto[] = [];
const oyentes = new Set<() => void>();
const avisa = () => { for (const oyente of oyentes) oyente(); };

/** Registro compartido del menú: Traducir, Variaciones públicas y quien quiera. */
export function registrarEntradaMenuTexto(entrada: EntradaMenuTexto): void {
    if (entradas.some((e) => e.id === entrada.id)) return;
    entradas.push(entrada);
    avisa();
}

/** Solo para pruebas del registro compartido: lo deja vacío. */
export function limpiarEntradasMenuTexto(): void {
    entradas.length = 0; avisa();
}

interface EstadoMenu { x: number; y: number; ctx: ContextoMenuTexto }
export function MenuTexto() {
    const [estado, setEstado] = useState<EstadoMenu | null>(null);
    const [, refresca] = useState(0);
    const refMenu = useRef<HTMLDivElement>(null);

    // El registro es a nivel de módulo (UNO solo en el OS): consulta al abrirse, avisa al cambiar.
    useEffect(() => {
        oyentes.add(() => refresca((v) => v + 1));
        return () => { oyentes.clear(); };
    }, []);

    // Apertura: solo si el evento no viene atendido, sin Mayúsculas y sobre texto no editable.
    useEffect(() => {
        const abrir = (evento: MouseEvent) => {
            const objetivo = evento.target instanceof Element ? evento.target : null;
            if (evento.defaultPrevented || evento.shiftKey ||
                objetivo?.closest("input, textarea, select, [contenteditable]") || refMenu.current?.contains(objetivo)) return;
            const seleccion = window.getSelection()?.toString() ?? "";
            const bloqueTexto = objetivo?.textContent?.trim() ?? "";
            if (!seleccion.trim() && !bloqueTexto) return;
            // El menú del navegador queda detenido solo aquí: el propio se abre en su lugar.
            evento.preventDefault();
            const ctx: ContextoMenuTexto = { seleccion, bloque: bloqueTexto || null,
                paginaTraducida: Boolean(document.querySelector("[data-traducido]")) };
            // Encaje en la pantalla: ancho de w-56 (224 px) y 44 px estimados por entrada.
            const visibles = entradas.filter((e) => e.visible?.(ctx) ?? true);
            setEstado({
                x: Math.max(4, Math.min(evento.clientX, window.innerWidth - 228)),
                y: Math.max(4, Math.min(evento.clientY, window.innerHeight - visibles.length * 44 - 12)), ctx,
            });
        };
        document.addEventListener("contextmenu", abrir);
        return () => document.removeEventListener("contextmenu", abrir);
    }, []);

    // Clic fuera y Escape cierran; al abrirse, el foco entra en el primer ítem (teclado completo).
    useEffect(() => {
        if (!estado) return;
        const fuera = (evento: PointerEvent) => {
            if (refMenu.current?.contains(evento.target as Node)) return; setEstado(null);
        };
        const teclas = (evento: KeyboardEvent) => { if (evento.key === "Escape") setEstado(null); };
        document.addEventListener("pointerdown", fuera);
        document.addEventListener("keydown", teclas);
        refMenu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
        return () => {
            document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", teclas);
        };
    }, [estado]);

    if (!estado) return null;
    const alItem = (entrada: EntradaMenuTexto) => () => {
        setEstado(null); entrada.ejecutar(estado.ctx);
    };
    const alTeclado = (evento: React.KeyboardEvent) => {
        if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return; evento.preventDefault();
        const items = Array.from(refMenu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
        const i = items.indexOf(document.activeElement as HTMLElement);
        const paso = evento.key === "ArrowDown" ? 1 : -1;
        items[(i + paso + items.length) % items.length]?.focus();
    };
    return (
        <div ref={refMenu} role="menu" aria-label="Acciones del clic derecho" onKeyDown={alTeclado}
            style={{ left: estado.x, top: estado.y }}
            className="fixed z-[1001] w-56 rounded-2xl border border-white/10 bg-[#0A0F1D]/90 p-1 shadow-lg shadow-black/50 backdrop-blur-[16px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
            {entradas.filter((e) => e.visible?.(estado.ctx) ?? true).map((e) => (
                    <button key={e.id} type="button" role="menuitem" onClick={alItem(e)}
                        className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm text-white transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none">
                        {e.etiqueta}
                    </button>
                ))}
        </div>
    );
}

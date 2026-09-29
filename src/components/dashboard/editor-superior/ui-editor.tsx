"use client";
/**
 * Piezas visuales del editor superior: el material de cristal, las pastillas de grupo, los
 * botones de herramienta, los segmentados y la hoja inferior del móvil. Un solo lenguaje para
 * todos los paneles (cristal oscuro, acento por grupo, pastillas fantasma, 150–300 ms).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    Blocks, LayoutTemplate, Palette, PanelTop, Settings2, SquareDashed, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstiloBarra, GrupoEditor } from "./tipos";

// ── Material ────────────────────────────────────────────────────────────────
export const CRISTAL: React.CSSProperties = {
    background: "rgba(12,14,34,.55)",
    backdropFilter: "blur(20px) saturate(140%)",
    WebkitBackdropFilter: "blur(20px) saturate(140%)",
    border: "1px solid rgba(255,255,255,.08)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 18px 40px -24px rgba(0,0,0,.8)",
};

/** Material de la barra según el estilo elegido (hereda los tres de la antigua barra lateral). */
export function materialBarra(estilo: EstiloBarra): React.CSSProperties {
    if (estilo === "cyber-neon") {
        return { ...CRISTAL, background: "rgba(2,6,23,.78)", border: "1px solid rgba(34,211,238,.35)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.05), 0 0 22px -8px rgba(34,211,238,.45)" };
    }
    if (estilo === "aurora-minimal") {
        return { ...CRISTAL, background: "linear-gradient(120deg, rgba(88,28,135,.28), rgba(6,78,59,.24)), rgba(10,12,28,.5)", border: "1px solid rgba(255,255,255,.06)" };
    }
    return CRISTAL;
}

export const pildoraFantasma = (color: string): React.CSSProperties => ({
    background: `${color}1f`,
    boxShadow: `inset 0 0 0 1px ${color}66`,
});

// ── Grupos ──────────────────────────────────────────────────────────────────
export const DEF_GRUPOS: Record<GrupoEditor, { etiqueta: string; icono: LucideIcon; acento: string; descripcion: string }> = {
    widgets: { etiqueta: "Widgets", icono: Blocks, acento: "#7C5CFF", descripcion: "Busca, elige el tamaño y añade: toca una ficha o arrástrala al tablero." },
    acomodo: { etiqueta: "Acomodo", icono: SquareDashed, acento: "#007FFF", descripcion: "Ordena, compacta, bloquea y mira cómo queda en cada pantalla." },
    pestana: { etiqueta: "Pestaña", icono: PanelTop, acento: "#14B8A6", descripcion: "Nombre, icono, color, orden, dispositivos y acciones de esta pestaña." },
    apariencia: { etiqueta: "Apariencia", icono: Palette, acento: "#FFBF00", descripcion: "Marco de los widgets, densidad, fondo, temas y vista." },
    plantillas: { etiqueta: "Plantillas", icono: LayoutTemplate, acento: "#10B981", descripcion: "Composiciones listas: aplícalas aquí o ábrelas en una pestaña nueva." },
    sistema: { etiqueta: "Sistema", icono: Settings2, acento: "#DC143C", descripcion: "Perfiles, memoria, inteligencia, conexiones, servidores y ubicación." },
};

// ── Hooks ───────────────────────────────────────────────────────────────────
/** true por debajo de 640 px (el `sm` de Tailwind): los paneles se abren como hoja inferior. */
export function useEsMovil(): boolean {
    const [movil, setMovil] = React.useState(false);
    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(max-width: 639px)");
        const actualizar = () => setMovil(mq.matches);
        actualizar();
        try { mq.addEventListener("change", actualizar); } catch { /* Safari viejo */ }
        return () => { try { mq.removeEventListener("change", actualizar); } catch { /* noop */ } };
    }, []);
    return movil;
}

/** true con puntero fino (ratón): solo entonces se puede arrastrar del catálogo a la rejilla. */
export function usePunteroFino(): boolean {
    const [fino, setFino] = React.useState(false);
    React.useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(pointer: fine)");
        setFino(mq.matches);
    }, []);
    return fino;
}

/** Transición de los paneles: 250 ms, o nada con movimiento reducido / modo eco. */
export function useTransicionEditor() {
    const reducir = useReducedMotion();
    const eco = typeof document !== "undefined" && document.documentElement?.dataset?.perf === "eco";
    return reducir || eco ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const };
}

// ── Piezas ──────────────────────────────────────────────────────────────────
export function Seccion({ titulo, ayuda, children, className, accion }: { titulo: string; ayuda?: string; children: React.ReactNode; className?: string; accion?: React.ReactNode }) {
    const id = React.useId();
    return (
        <section aria-labelledby={id} className={cn("space-y-2", className)}>
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                    <h4 id={id} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{titulo}</h4>
                    {ayuda && <p className="mt-0.5 text-[12px] leading-snug text-white/50">{ayuda}</p>}
                </div>
                {accion}
            </div>
            {children}
        </section>
    );
}

/** Botón de herramienta: icono + título + una línea de ayuda. Nunca recorta el texto. */
export function BotonHerramienta({
    icono: Icono, titulo, ayuda, acento = "#22D3EE", onClick, disabled, peligro, activo, ...resto
}: {
    icono: LucideIcon; titulo: string; ayuda?: string; acento?: string; onClick?: () => void; disabled?: boolean; peligro?: boolean; activo?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title">) {
    const color = peligro ? "#DC143C" : acento;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={activo === undefined ? undefined : activo}
            {...resto}
            className={cn(
                "group flex w-full items-start gap-3 rounded-2xl p-3 text-left cursor-pointer transition-[background,box-shadow,transform] duration-200",
                "hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
                resto.className,
            )}
            style={{ background: activo ? `${color}1f` : "rgba(255,255,255,.03)", boxShadow: `inset 0 0 0 1px ${activo ? `${color}66` : "rgba(255,255,255,.07)"}`, outlineColor: color }}
        >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={pildoraFantasma(color)}>
                <Icono className="size-[18px]" style={{ color }} aria-hidden />
            </span>
            <span className="min-w-0">
                <span className={cn("block text-[14px] font-semibold leading-tight", peligro ? "text-red-200" : "text-white/90")}>{titulo}</span>
                {ayuda && <span className="mt-0.5 block text-[12px] leading-snug text-white/55">{ayuda}</span>}
            </span>
        </button>
    );
}

export interface OpcionSegmentada<T extends string> {
    valor: T;
    etiqueta: string;
    ayuda?: string;
    icono?: LucideIcon;
}

/** Elección entre pocas opciones: pastillas que se envuelven (nunca una tira con scroll). */
export function Segmentado<T extends string>({ opciones, valor, onCambiar, acento = "#22D3EE", etiqueta }: { opciones: readonly OpcionSegmentada<T>[]; valor: T; onCambiar: (v: T) => void; acento?: string; etiqueta: string }) {
    return (
        <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
            {opciones.map((o) => {
                const activo = o.valor === valor;
                const Icono = o.icono;
                return (
                    <button
                        key={o.valor}
                        type="button"
                        role="radio"
                        aria-checked={activo}
                        title={o.ayuda}
                        onClick={() => onCambiar(o.valor)}
                        className={cn(
                            "ss-redondo inline-flex min-h-9 [@media(pointer:coarse)]:min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer transition-[background,box-shadow,color] duration-200",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                            activo ? "text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white",
                        )}
                        style={activo ? { ...pildoraFantasma(acento), outlineColor: acento } : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)", outlineColor: acento }}
                    >
                        {Icono && <Icono className="size-3.5" style={{ color: activo ? acento : undefined }} aria-hidden />}
                        {o.etiqueta}
                    </button>
                );
            })}
        </div>
    );
}

/** Hoja inferior (móvil): se alcanza con el pulgar, se cierra al tocar fuera, con Escape o con su botón. */
export function HojaInferior({ abierta, titulo, descripcion, acento, onCerrar, children, id }: {
    abierta: boolean; titulo: string; descripcion?: string; acento: string; onCerrar: () => void; children: React.ReactNode; id?: string;
}) {
    const reducir = useReducedMotion();
    const refHoja = React.useRef<HTMLDivElement>(null);
    const idTitulo = React.useId();
    React.useEffect(() => {
        if (!abierta) return;
        const alTeclado = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        window.addEventListener("keydown", alTeclado);
        refHoja.current?.focus({ preventScroll: true });
        return () => window.removeEventListener("keydown", alTeclado);
    }, [abierta, onCerrar]);
    if (typeof document === "undefined") return null;
    return createPortal(
        <AnimatePresence>
            {abierta && (
                <div className="fixed inset-0 z-[95] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby={idTitulo} id={id}>
                    <motion.button
                        type="button"
                        aria-label="Cerrar el panel"
                        className="absolute inset-0 cursor-pointer bg-black/60"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: reducir ? 0 : 0.2 }}
                        onClick={onCerrar}
                    />
                    <motion.div
                        ref={refHoja}
                        tabIndex={-1}
                        initial={reducir ? false : { y: "100%" }}
                        animate={{ y: 0 }}
                        exit={reducir ? { opacity: 0 } : { y: "100%" }}
                        transition={reducir ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                        className="relative z-10 flex max-h-[82dvh] w-full flex-col overflow-hidden rounded-t-[24px] pb-[env(safe-area-inset-bottom)] outline-none"
                        style={{ ...CRISTAL, background: "rgba(10,12,28,.94)" }}
                    >
                        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20" aria-hidden />
                        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-2">
                            <div className="min-w-0">
                                <h3 id={idTitulo} className="text-[15px] font-semibold text-white" style={{ textShadow: `0 0 18px ${acento}55` }}>{titulo}</h3>
                                {descripcion && <p className="mt-0.5 text-[12.5px] leading-snug text-white/55">{descripcion}</p>}
                            </div>
                            <button type="button" onClick={onCerrar} aria-label="Cerrar el panel" className="ss-redondo grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-white">
                                <X className="size-4" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 custom-scrollbar">{children}</div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body,
    );
}

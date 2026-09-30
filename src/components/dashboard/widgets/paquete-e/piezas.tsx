"use client";
/**
 * Piezas visuales del paquete E (Ola 0929). Sin cajas dentro de cajas: la raíz se apoya en el vidrio
 * del MarcoUnificado, los botones son halos del acento y los estados vacíos hablan claro y ofrecen
 * el siguiente paso. Todo lo clicable lleva cursor-pointer, foco visible y, en táctil, 44 px.
 */
import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AlertOctagon, RotateCw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { accionDe, EstadoMicro, frase } from "@/components/dashboard/kit/estado-micro";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { mezclar } from "@/components/widgets-libres/familias/comun";
import type { LienzoE } from "./lienzo";
import estilos from "./paquete-e.module.css";

export { estilos as estilosE };

/** Tinta legible del acento (el acento aclarado un 35 %). */
export function tintaE(acento: string): string {
    return /^#[0-9a-f]{6}$/i.test(acento) ? mezclar(acento, "#ffffff", 0.35) : "#ffffff";
}

// ── Raíz ──────────────────────────────────────────────────────────────

export interface RaizEProps {
    lienzo: LienzoE;
    refRaiz: React.Ref<HTMLDivElement>;
    etiqueta: string;
    children: React.ReactNode;
    className?: string;
    /** Atajos de teclado del propio widget (solo cuando tiene el foco). */
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    tabIndex?: number;
    tipo?: string;
}

/**
 * Raíz de todo widget del paquete: mide, publica la clase y el dispositivo como `data-*`, pausa sus
 * animaciones si no se ve y, fuera del marco unificado, se pinta su propia tarjeta de vidrio.
 */
export function RaizE({ lienzo, refRaiz, etiqueta, children, className, onKeyDown, tabIndex, tipo }: RaizEProps) {
    return (
        <div
            ref={refRaiz}
            role="region"
            aria-label={etiqueta}
            data-paquete="e"
            data-widget-e={tipo}
            data-clase={lienzo.clase}
            data-dispositivo={lienzo.dispositivo}
            data-pausa={lienzo.visible ? "no" : "si"}
            onKeyDown={onKeyDown}
            tabIndex={tabIndex}
            className={cn(estilos.raiz, !lienzo.enMarco && estilos.tarjeta, "text-white outline-none", className)}
            style={{ ["--e-acento" as string]: lienzo.acento, ["--e-acento-2" as string]: lienzo.acento2 } as React.CSSProperties}
        >
            {children}
        </div>
    );
}

// ── Cabecera ligera ───────────────────────────────────────────────────

export function EncabezadoE({
    lienzo, icono: Icono, titulo, detalle, acciones, vivo, className,
}: {
    lienzo: LienzoE;
    icono?: LucideIcon;
    titulo: string;
    detalle?: React.ReactNode;
    acciones?: React.ReactNode;
    vivo?: boolean;
    className?: string;
}) {
    const tinta = tintaE(lienzo.acento);
    return (
        // (Pulido 0929) Si las acciones no caben junto al título, bajan a otra línea (flex-wrap) en
        // vez de salirse de la tarjeta; el título nunca se queda en cero.
        <header className={cn("relative z-10 flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1", className)}>
            {Icono && (
                <Icono aria-hidden className={lienzo.tv ? "size-5 shrink-0" : "size-4 shrink-0"} style={{ color: tinta, filter: `drop-shadow(0 0 6px ${conAlfa(lienzo.acento, 0.6)})` }} strokeWidth={2} />
            )}
            <h3 className="min-w-[4.5rem] max-w-full flex-1 basis-0 truncate font-semibold uppercase tracking-[0.14em] text-white/70" style={{ fontSize: lienzo.tv ? 13 : 11 }} title={titulo}>
                {titulo}
            </h3>
            {vivo && (
                <span className="inline-flex shrink-0 items-center gap-1" title="En vivo">
                    <span aria-hidden className={cn("size-1.5 rounded-full", lienzo.animar && "ss-respirar")} style={{ background: lienzo.acento, boxShadow: `0 0 8px ${lienzo.acento}` }} />
                    <span className="sr-only">En vivo</span>
                </span>
            )}
            {detalle && <span className="min-w-0 max-w-[45%] truncate text-[11px] text-white/50" title={typeof detalle === "string" ? detalle : undefined}>{detalle}</span>}
            {acciones && <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">{acciones}</div>}
        </header>
    );
}

// ── Botones ───────────────────────────────────────────────────────────

type VarianteBoton = "primario" | "suave" | "fantasma";

function claseBoton(v: VarianteBoton, tactil: boolean, compacto: boolean, soloIcono: boolean) {
    return cn(
        "ss-redondo inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
        "transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out hover:-translate-y-px active:scale-95",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0",
        soloIcono
            ? tactil ? "size-11" : compacto ? "size-7" : "size-8"
            : tactil ? "min-h-11 px-4 text-[13px]" : compacto ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[12px]",
        v === "primario" ? "text-white" : "text-white/90",
    );
}

function estiloBoton(v: VarianteBoton, acento: string): React.CSSProperties {
    if (v === "primario") {
        return {
            background: `linear-gradient(135deg, ${acento}, ${mezclar(/^#[0-9a-f]{6}$/i.test(acento) ? acento : "#7c5cff", "#000000", 0.25)})`,
            boxShadow: `0 6px 18px -8px ${conAlfa(acento, 0.8)}, inset 0 1px 0 rgba(255,255,255,.25)`,
            outlineColor: acento,
        };
    }
    if (v === "suave") return { background: conAlfa(acento, 0.14), boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.42)}`, outlineColor: acento };
    return { background: "transparent", outlineColor: acento };
}

export interface BotonEProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    lienzo: Pick<LienzoE, "acento" | "tactil">;
    variante?: VarianteBoton;
    icono?: LucideIcon;
    compacto?: boolean;
    /** Texto accesible cuando el botón es solo un icono. */
    etiqueta?: string;
}

export const BotonE = React.forwardRef<HTMLButtonElement, BotonEProps>(function BotonE(
    { lienzo, variante = "suave", icono: Icono, compacto = false, etiqueta, children, className, style, ...resto },
    ref,
) {
    const soloIcono = !children && !!Icono;
    return (
        <button
            ref={ref}
            type="button"
            aria-label={soloIcono ? etiqueta : resto["aria-label"]}
            title={resto.title ?? (soloIcono ? etiqueta : undefined)}
            {...resto}
            className={cn(claseBoton(variante, lienzo.tactil, compacto, soloIcono), variante === "fantasma" && "hover:bg-white/10", className)}
            style={{ ...estiloBoton(variante, lienzo.acento), ...style }}
        >
            {Icono && <Icono aria-hidden className={soloIcono ? (lienzo.tactil ? "size-5" : "size-4") : "size-3.5"} strokeWidth={2.2} />}
            {children}
        </button>
    );
});

export function EnlaceE({
    lienzo, href, variante = "suave", icono: Icono, compacto = false, children, className, externo, ...resto
}: {
    lienzo: Pick<LienzoE, "acento" | "tactil">;
    href: string;
    variante?: VarianteBoton;
    icono?: LucideIcon;
    compacto?: boolean;
    children: React.ReactNode;
    className?: string;
    externo?: boolean;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
    const cls = cn(claseBoton(variante, lienzo.tactil, compacto, false), variante === "fantasma" && "hover:bg-white/10", className);
    const inner = (<>{Icono && <Icono aria-hidden className="size-3.5" strokeWidth={2.2} />}{children}</>);
    if (externo) {
        return <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={estiloBoton(variante, lienzo.acento)} {...resto}>{inner}</a>;
    }
    return <Link href={href} className={cls} style={estiloBoton(variante, lienzo.acento)} {...resto}>{inner}</Link>;
}

// ── Sellos y estados honestos ─────────────────────────────────────────

/** Sello pequeño: «demostración», «local», «en vivo»… */
export function SelloE({ children, color = "#fbbf24", title }: { children: React.ReactNode; color?: string; title?: string }) {
    return (
        <span
            title={title}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ background: conAlfa(color, 0.14), boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.45)}`, color: mezclar(color, "#ffffff", 0.3) }}
        >
            {children}
        </span>
    );
}

export function VacioE({
    lienzo, icono: Icono, titulo, texto, children, compacto,
}: {
    lienzo: LienzoE;
    icono: LucideIcon;
    titulo: string;
    texto?: string;
    children?: React.ReactNode;
    compacto?: boolean;
}) {
    const tinta = tintaE(lienzo.acento);
    // (Pulido 0930) En micro: un glifo (la acción de los hijos, si la hay) y una etiqueta corta.
    if (lienzo.base === "micro") {
        const accion = accionDe(children);
        return (
            <EstadoMicro kit="vacio" icono={Icono} color={lienzo.acento} etiqueta={accion?.etiqueta ?? titulo}
                descripcion={frase(titulo, texto)} href={accion?.href} onClick={accion?.href ? undefined : accion?.onClick} />
        );
    }
    return (
        <div role="status" className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 px-2 text-center">
            <span aria-hidden className="relative grid place-items-center" style={{ width: compacto ? 36 : 48, height: compacto ? 36 : 48 }}>
                <span className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(closest-side, ${conAlfa(lienzo.acento, 0.35)}, transparent)` }} />
                <Icono className={compacto ? "relative size-5" : "relative size-6"} style={{ color: tinta }} strokeWidth={1.8} />
            </span>
            <p className="max-w-[26ch] text-[13px] font-semibold leading-snug text-white/90">{titulo}</p>
            {texto && !compacto && <p className="max-w-[32ch] text-[12px] leading-snug text-white/60">{texto}</p>}
            {children && <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">{children}</div>}
        </div>
    );
}

export function ErrorE({ lienzo, texto = "No se pudo cargar.", onReintentar }: { lienzo: LienzoE; texto?: string; onReintentar?: () => void }) {
    if (lienzo.base === "micro") {
        return (
            <EstadoMicro kit="error" icono={onReintentar ? RotateCw : AlertOctagon} color="#f43f5e" etiqueta={onReintentar ? "Reintentar" : "Sin datos"}
                descripcion={frase(texto, onReintentar ? "Toca para reintentar" : null)} onClick={onReintentar} />
        );
    }
    return (
        <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center">
            <p className="max-w-[30ch] text-[12px] font-medium text-rose-200/90">{texto}</p>
            {onReintentar && <BotonE lienzo={{ ...lienzo, acento: "#f43f5e" }} compacto onClick={onReintentar}>Reintentar</BotonE>}
        </div>
    );
}

/** Esqueleto de carga: líneas que brillan (se quedan quietas en «ligero»). */
export function CargandoE({ filas = 3, etiqueta = "Cargando…" }: { filas?: number; etiqueta?: string }) {
    return (
        // El nombre accesible ya es la etiqueta: sin un sr-only duplicado que se maqueta fuera.
        <div role="status" aria-label={etiqueta} title={etiqueta} className="flex h-full w-full flex-col justify-center gap-2 overflow-hidden px-1">
            {Array.from({ length: filas }, (_, i) => (
                <span key={i} className={cn("block h-3 shrink-0 rounded-full", estilos.brillo)} style={{ width: `${90 - i * 18}%` }} />
            ))}
        </div>
    );
}

// ── Rango con la voz del acento ───────────────────────────────────────

export function RangoE({
    lienzo, valor, min = 0, max = 1, paso = 0.01, onCambio, etiqueta, textoValor, className,
}: {
    lienzo: Pick<LienzoE, "acento" | "tactil">;
    valor: number;
    min?: number;
    max?: number;
    paso?: number;
    onCambio: (v: number) => void;
    etiqueta: string;
    textoValor?: string;
    className?: string;
}) {
    const pct = max > min ? ((valor - min) / (max - min)) * 100 : 0;
    return (
        <input
            type="range"
            min={min}
            max={max}
            step={paso}
            value={valor}
            onChange={(e) => onCambio(Number(e.target.value))}
            aria-label={etiqueta}
            aria-valuetext={textoValor}
            data-grueso={lienzo.tactil ? "si" : "no"}
            className={cn(estilos.rango, "w-full min-w-0", className)}
            style={{ ["--e-valor" as string]: `${Math.max(0, Math.min(100, pct))}%`, ["--e-acento" as string]: lienzo.acento, outlineColor: lienzo.acento } as React.CSSProperties}
        />
    );
}

// ── Menú vertical (acciones de una ficha) ─────────────────────────────

export interface OpcionMenuE {
    id: string;
    etiqueta: string;
    icono?: LucideIcon;
    peligro?: boolean;
    alElegir: () => void;
}

/**
 * Menú de acciones SIEMPRE vertical (regla del dueño: nada de tiras horizontales). Se porta a
 * `body` para no recortarse, se cierra con Escape o al tocar fuera y se navega con flechas.
 */
export function MenuE({ x, y, titulo, opciones, onCerrar, acento }: { x: number; y: number; titulo?: string; opciones: OpcionMenuE[]; onCerrar: () => void; acento: string }) {
    const lista = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        lista.current?.querySelector<HTMLButtonElement>("button")?.focus();
        const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
        window.addEventListener("keydown", tecla);
        return () => window.removeEventListener("keydown", tecla);
    }, [onCerrar]);
    if (typeof document === "undefined") return null;
    const ancho = 220;
    const left = Math.max(8, Math.min(x, window.innerWidth - ancho - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - 52 - opciones.length * 40));
    const mover = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const botones = Array.from(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        const i = botones.indexOf(document.activeElement as HTMLButtonElement);
        const j = e.key === "ArrowDown" ? (i + 1) % botones.length : (i - 1 + botones.length) % botones.length;
        botones[j]?.focus();
    };
    return createPortal(
        <div className="fixed inset-0 z-[140]" onClick={onCerrar} onContextMenu={(e) => { e.preventDefault(); onCerrar(); }} role="presentation">
            <div
                ref={lista}
                role="menu"
                aria-label={titulo ?? "Acciones"}
                onKeyDown={mover}
                onClick={(e) => e.stopPropagation()}
                className="absolute flex flex-col gap-0.5 rounded-2xl p-1.5 text-white shadow-2xl"
                style={{ left, top, width: ancho, background: "rgba(14,16,38,.94)", boxShadow: `0 20px 50px -20px rgba(0,0,0,.8), inset 0 0 0 1px ${conAlfa(acento, 0.35)}`, backdropFilter: "blur(18px)" }}
            >
                {titulo && <p className="truncate px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{titulo}</p>}
                {opciones.map((o) => {
                    const Ic = o.icono;
                    return (
                        <button
                            key={o.id}
                            type="button"
                            role="menuitem"
                            onClick={() => { o.alElegir(); onCerrar(); }}
                            className={cn(
                                "flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 text-left text-[13px] transition-colors duration-150 focus-visible:outline-none",
                                o.peligro ? "text-rose-200 hover:bg-rose-500/15 focus-visible:bg-rose-500/15" : "hover:bg-white/10 focus-visible:bg-white/10",
                            )}
                        >
                            {Ic && <Ic aria-hidden className="size-4 shrink-0 opacity-80" />}
                            <span className="min-w-0 flex-1">{o.etiqueta}</span>
                        </button>
                    );
                })}
            </div>
        </div>,
        document.body,
    );
}

// ── Pestañas (l/xl) ───────────────────────────────────────────────────

export function PestanasE<T extends string>({
    lienzo, valor, opciones, onCambio, etiqueta,
}: {
    lienzo: Pick<LienzoE, "acento" | "tactil" | "tv">;
    valor: T;
    opciones: { id: T; etiqueta: string; cuenta?: number }[];
    onCambio: (v: T) => void;
    etiqueta: string;
}) {
    const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
    const mover = (e: React.KeyboardEvent, i: number) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const j = e.key === "ArrowRight" ? (i + 1) % opciones.length : (i - 1 + opciones.length) % opciones.length;
        onCambio(opciones[j].id);
        refs.current[j]?.focus();
    };
    return (
        <div role="tablist" aria-label={etiqueta} className="flex min-w-0 flex-wrap items-center gap-1">
            {opciones.map((o, i) => {
                const activa = o.id === valor;
                return (
                    <button
                        key={o.id}
                        ref={(el) => { refs.current[i] = el; }}
                        type="button"
                        role="tab"
                        aria-selected={activa}
                        tabIndex={activa ? 0 : -1}
                        onClick={() => onCambio(o.id)}
                        onKeyDown={(e) => mover(e, i)}
                        className={cn(
                            "ss-redondo inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full font-semibold transition-colors duration-200",
                            lienzo.tactil ? "min-h-11 px-4 text-[13px]" : lienzo.tv ? "h-9 px-4 text-[14px]" : "h-7 px-3 text-[11px]",
                            activa ? "text-white" : "text-white/60 hover:text-white",
                        )}
                        style={activa ? { background: conAlfa(lienzo.acento, 0.2), boxShadow: `inset 0 0 0 1px ${conAlfa(lienzo.acento, 0.5)}` } : undefined}
                    >
                        {o.etiqueta}
                        {typeof o.cuenta === "number" && <span className="tabular-nums text-white/50">{o.cuenta}</span>}
                    </button>
                );
            })}
        </div>
    );
}

// ── Anillo de progreso (objeto de luz, no una barra en una caja) ──────

/**
 * Anillo con degradado del acento al segundo tono y halo suave. `valor` 0-1, o `null` cuando no
 * hay dato (se dibuja la pista punteada y un «—» honesto en vez de un 0 %).
 */
export function AnilloE({
    valor, lado, grosor, acento, acento2, children, etiqueta,
}: {
    valor: number | null;
    lado: number;
    grosor?: number;
    acento: string;
    acento2: string;
    children?: React.ReactNode;
    etiqueta?: string;
}) {
    const id = React.useId().replace(/:/g, "");
    const g = grosor ?? Math.max(4, lado * 0.09);
    const r = (lado - g) / 2 - 2;
    const c = 2 * Math.PI * r;
    const v = valor === null ? 0 : Math.max(0, Math.min(1, valor));
    return (
        <span className="relative inline-grid shrink-0 place-items-center" style={{ width: lado, height: lado }} role={etiqueta ? "img" : undefined} aria-label={etiqueta}>
            <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} className="absolute inset-0 -rotate-90 overflow-visible" aria-hidden>
                <defs>
                    <linearGradient id={`an-${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={acento} />
                        <stop offset="100%" stopColor={acento2} />
                    </linearGradient>
                    <radialGradient id={`ha-${id}`}>
                        <stop offset="55%" stopColor={acento} stopOpacity={0.18} />
                        <stop offset="100%" stopColor={acento} stopOpacity={0} />
                    </radialGradient>
                </defs>
                <circle cx={lado / 2} cy={lado / 2} r={lado / 2} fill={`url(#ha-${id})`} />
                <circle cx={lado / 2} cy={lado / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={g} strokeDasharray={valor === null ? `${g * 0.4} ${g * 1.2}` : undefined} />
                {valor !== null && v > 0 && (
                    <circle cx={lado / 2} cy={lado / 2} r={r} fill="none" stroke={`url(#an-${id})`} strokeWidth={g} strokeLinecap="round"
                        strokeDasharray={`${c * v} ${c}`} style={{ transition: "stroke-dasharray 600ms cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 ${Math.max(2, g * 0.6)}px ${conAlfa(acento, 0.7)})` }} />
                )}
            </svg>
            <span className="relative grid place-items-center text-center leading-none">{children}</span>
        </span>
    );
}

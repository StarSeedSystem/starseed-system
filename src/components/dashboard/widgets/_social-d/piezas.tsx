"use client";
/**
 * Piezas del paquete D (Ola 0929) — avatares con presencia, segmentos, buscador, pastillas,
 * miniaturas con respaldo, cifras y esqueletos. Todo sobre el material común (vidrio + acento de
 * la familia): nada de cajas dentro de cajas, filas que se iluminan y halos del acento.
 */
import * as React from "react";
import Link from "next/link";
import { RefreshCw, Search, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mezclar } from "@/components/widgets-libres/familias/comun";
import { conAlfa, esHex, normalizarHex } from "@/components/widgets-libres/acentos-categoria";
import { colorDe, esImagen, esVideo, fechaLarga, iniciales, tiempoCorto, tiempoRelativo } from "./formato";
import estilos from "./social.module.css";

export { estilos as estilosSocial };

/** Tinta legible de un acento sobre el vidrio. */
export function tintaDe(color: string): string {
    return esHex(color) ? mezclar(normalizarHex(color), "#ffffff", 0.35) : color;
}

/** Solo URLs que un <img> puede pedir sin sorpresas (http/https, data:image, blob). */
export function urlSegura(url: string | null | undefined): string | null {
    if (!url) return null;
    const u = url.trim();
    if (/^https?:\/\//i.test(u) || /^data:image\//i.test(u) || /^blob:/i.test(u) || u.startsWith("/")) return u;
    return null;
}

// ── Avatar ────────────────────────────────────────────────────────────

export type Presencia = "en-linea" | "reciente" | null;

export function Avatar({
    nombre, url, tam = 32, presencia = null, acento, anillo = false, forma = "circulo", className,
}: {
    nombre: string | null | undefined;
    url?: string | null;
    tam?: number;
    presencia?: Presencia;
    acento?: string;
    anillo?: boolean;
    forma?: "circulo" | "gota";
    className?: string;
}) {
    const [fallo, setFallo] = React.useState(false);
    const src = fallo ? null : urlSegura(url);
    const color = colorDe(nombre);
    const radio = forma === "gota" ? "34% 50% 50% 50%" : "9999px";
    return (
        <span aria-hidden className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: tam, height: tam }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)}
                    className="size-full object-cover" style={{ borderRadius: radio }} />
            ) : (
                <span className="grid size-full place-items-center font-semibold text-white"
                    style={{
                        borderRadius: radio,
                        fontSize: Math.max(9, tam * 0.36),
                        background: `radial-gradient(circle at 30% 25%, ${mezclar(color, "#ffffff", 0.3)}, ${color} 55%, ${mezclar(color, "#0c0e22", 0.5)})`,
                    }}>
                    {iniciales(nombre)}
                </span>
            )}
            {anillo && acento && <span className="pointer-events-none absolute -inset-[3px]" style={{ borderRadius: radio, boxShadow: `0 0 0 1.5px ${acento}, 0 0 12px -2px ${acento}` }} />}
            {presencia && (
                <span className="absolute bottom-0 right-0 rounded-full"
                    style={{
                        width: Math.max(7, tam * 0.27), height: Math.max(7, tam * 0.27),
                        background: presencia === "en-linea" ? "#10B981" : "#94a3b8",
                        boxShadow: `0 0 0 2px rgba(12,14,34,.92)${presencia === "en-linea" ? ", 0 0 8px #10B981" : ""}`,
                    }} />
            )}
        </span>
    );
}

// ── Segmentos (filtros) ──────────────────────────────────────────────

export interface OpcionSegmento<T extends string> {
    id: T;
    etiqueta: string;
    n?: number;
    icono?: LucideIcon;
}

/** Filtros en pastillas que ENVUELVEN (nunca una tira con desplazamiento lateral). */
export function Segmentos<T extends string>({
    opciones, valor, onCambio, acento, etiqueta, tactil = false, className,
}: {
    opciones: OpcionSegmento<T>[];
    valor: T;
    onCambio: (v: T) => void;
    acento: string;
    etiqueta: string;
    tactil?: boolean;
    className?: string;
}) {
    return (
        <div role="group" aria-label={etiqueta} className={cn("flex flex-wrap items-center gap-1", className)}>
            {opciones.map((o) => {
                const activa = o.id === valor;
                const Icono = o.icono;
                return (
                    <button key={o.id} type="button" aria-pressed={activa} onClick={() => onCambio(o.id)}
                        className={cn(
                            "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full ss-redondo px-2.5 text-[11px] font-semibold transition-colors duration-200",
                            tactil ? "min-h-11" : "min-h-[26px]",
                            activa ? "text-white" : "text-white/60 hover:text-white",
                        )}
                        style={activa ? { background: conAlfa(acento, 0.2), boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.55)}` } : { background: "rgba(255,255,255,.03)" }}>
                        {Icono && <Icono className="size-3" aria-hidden />}
                        {o.etiqueta}
                        {typeof o.n === "number" && <span className="tabular-nums text-white/50">{o.n}</span>}
                    </button>
                );
            })}
        </div>
    );
}

// ── Buscador ─────────────────────────────────────────────────────────

export function Buscador({
    valor, onCambio, placeholder, etiqueta, acento, tactil = false, className,
}: {
    valor: string;
    onCambio: (v: string) => void;
    placeholder: string;
    etiqueta: string;
    acento: string;
    tactil?: boolean;
    className?: string;
}) {
    return (
        <label className={cn("flex items-center gap-2 rounded-full ss-redondo px-3 transition-shadow duration-200 focus-within:shadow-[0_0_0_1px_var(--social-acento)]", tactil ? "min-h-11" : "min-h-8", className)}
            style={{ background: "rgba(255,255,255,.05)", boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.22)}` }}>
            <Search className="size-3.5 shrink-0 text-white/50" aria-hidden />
            <input value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} aria-label={etiqueta}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/40" />
            {valor && (
                <button type="button" onClick={() => onCambio("")} aria-label="Borrar búsqueda" title="Borrar búsqueda"
                    className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full ss-redondo text-white/60 hover:text-white">
                    <X className="size-3" aria-hidden />
                </button>
            )}
        </label>
    );
}

// ── Pastilla de acción (enlace o botón) ──────────────────────────────

type PropsPastilla = {
    acento: string;
    icono?: LucideIcon;
    children: React.ReactNode;
    tactil?: boolean;
    solida?: boolean;
    className?: string;
    title?: string;
    "aria-label"?: string;
} & ({ href: string; onClick?: never; disabled?: never } | { href?: never; onClick: () => void; disabled?: boolean });

export function Pastilla(p: PropsPastilla) {
    const Icono = p.icono;
    const clase = cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full ss-redondo px-3 text-[11px] font-semibold text-white transition-transform duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        p.tactil ? "min-h-11 px-4 text-[12px]" : "min-h-[28px]",
        p.className,
    );
    const estilo: React.CSSProperties = p.solida
        ? { background: `linear-gradient(135deg, ${p.acento}, ${mezclar(esHex(p.acento) ? normalizarHex(p.acento) : "#7c5cff", "#0c0e22", 0.35)})`, boxShadow: `0 6px 18px -8px ${conAlfa(p.acento, 0.8)}` }
        : { background: conAlfa(p.acento, 0.12), boxShadow: `inset 0 0 0 1px ${conAlfa(p.acento, 0.42)}` };
    const dentro = (
        <>
            {Icono && <Icono className="size-3.5 shrink-0" aria-hidden />}
            <span>{p.children}</span>
        </>
    );
    if (p.href !== undefined) {
        return <Link href={p.href} className={clase} style={estilo} title={p.title} aria-label={p["aria-label"]}>{dentro}</Link>;
    }
    return <button type="button" onClick={p.onClick} disabled={p.disabled} className={clase} style={estilo} title={p.title} aria-label={p["aria-label"]}>{dentro}</button>;
}

/** Botón redondo de solo icono (siempre con nombre accesible). */
export function BotonIcono({
    icono: Icono, etiqueta, onClick, href, acento, activo = false, tactil = false, className, girando = false, disabled,
}: {
    icono: LucideIcon;
    etiqueta: string;
    onClick?: () => void;
    href?: string;
    acento: string;
    activo?: boolean;
    tactil?: boolean;
    className?: string;
    girando?: boolean;
    disabled?: boolean;
}) {
    const clase = cn(
        "inline-grid shrink-0 cursor-pointer place-items-center rounded-full ss-redondo transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        tactil ? "size-11" : "size-7",
        activo ? "text-white" : "text-white/65 hover:text-white",
        className,
    );
    const estilo: React.CSSProperties = activo
        ? { background: conAlfa(acento, 0.22), boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.55)}` }
        : { background: "rgba(255,255,255,.04)" };
    const icono = <Icono className={cn("size-3.5", girando && "animate-spin motion-reduce:animate-none")} aria-hidden />;
    if (href) return <Link href={href} aria-label={etiqueta} title={etiqueta} className={clase} style={estilo}>{icono}</Link>;
    return <button type="button" onClick={onClick} aria-label={etiqueta} title={etiqueta} aria-pressed={activo || undefined} className={clase} style={estilo} disabled={disabled}>{icono}</button>;
}

/** «Actualizar»: la única forma de pedir lo último fuera de la cadencia de 5 min. */
export function BotonActualizar({ onClick, actualizando, actualizado, acento, tactil }: { onClick: () => void; actualizando: boolean; actualizado: number; acento: string; tactil?: boolean }) {
    const cuando = actualizado > 0 ? `Actualizado ${tiempoRelativo(actualizado, Date.now())}` : "Sin leer todavía";
    return <BotonIcono icono={RefreshCw} etiqueta={`Actualizar (${cuando})`} onClick={onClick} acento={acento} tactil={tactil} girando={actualizando} disabled={actualizando} />;
}

// ── Miniatura ────────────────────────────────────────────────────────

/** Imagen o vídeo con respaldo: si no carga, un degradado del acento con el icono del tipo. */
export function Miniatura({
    url, icono: Icono, acento, alt = "", className, redondeo = 12, semilla,
}: {
    url?: string | null;
    icono: LucideIcon;
    acento: string;
    alt?: string;
    className?: string;
    redondeo?: number;
    semilla?: string;
}) {
    const [fallo, setFallo] = React.useState(false);
    const src = fallo ? null : urlSegura(url);
    const color = semilla ? colorDe(semilla) : acento;
    return (
        <span className={cn(estilos.miniatura, "block shrink-0", className)} style={{ borderRadius: redondeo }}>
            {src && esVideo(src) ? (
                <video src={src} muted playsInline preload="metadata" className="size-full object-cover" onError={() => setFallo(true)} aria-label={alt || undefined} />
            ) : src && (esImagen(src) || !esVideo(src)) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)} className="size-full object-cover" />
            ) : (
                <span aria-hidden className="grid size-full place-items-center"
                    style={{ background: `radial-gradient(120% 120% at 20% 15%, ${conAlfa(color, 0.55)}, ${conAlfa(acento, 0.12)} 60%, rgba(12,14,34,.6))` }}>
                    <Icono className="size-[38%] max-h-8 max-w-8 text-white/80" strokeWidth={1.5} />
                </span>
            )}
        </span>
    );
}

// ── Cifra ────────────────────────────────────────────────────────────

export function Cifra({ valor, etiqueta, acento, tam = "m", className }: { valor: React.ReactNode; etiqueta: string; acento?: string; tam?: "s" | "m" | "l" | "xl"; className?: string }) {
    const fs = tam === "xl" ? "text-[44px]" : tam === "l" ? "text-[32px]" : tam === "m" ? "text-[22px]" : "text-[16px]";
    return (
        <div className={cn("flex min-w-0 flex-col", className)}>
            <span className={cn("font-light leading-none tabular-nums tracking-tight text-white", fs)} style={acento ? { textShadow: `0 0 22px ${conAlfa(acento, 0.45)}` } : undefined}>{valor}</span>
            <span className="mt-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/55" title={etiqueta}>{etiqueta}</span>
        </div>
    );
}

/** Tiempo relativo con la fecha completa en el título. */
export function Tiempo({ ms, corto = false, className }: { ms: number; corto?: boolean; className?: string }) {
    if (!(ms > 0)) return null;
    const ahora = Date.now();
    return (
        <time dateTime={new Date(ms).toISOString()} title={fechaLarga(ms)} className={cn("shrink-0 tabular-nums text-white/50", className)}>
            {corto ? tiempoCorto(ms, ahora) : tiempoRelativo(ms, ahora)}
        </time>
    );
}

/** Sello honesto para lo que no es un dato vivo. */
export function SelloDemo({ texto = "demostración", title }: { texto?: string; title?: string }) {
    return (
        <span title={title ?? "Esta parte es ilustrativa: no es un dato medido"}
            className="inline-flex shrink-0 items-center rounded-full ss-redondo px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-amber-200"
            style={{ background: "rgba(255,191,0,.10)", boxShadow: "inset 0 0 0 1px rgba(255,191,0,.35)" }}>
            {texto}
        </span>
    );
}

/** Punto de color con halo (tipo de actividad, estado). */
export function Punto({ color, tam = 8, latir = false }: { color: string; tam?: number; latir?: boolean }) {
    return <span aria-hidden className={cn("inline-block shrink-0 rounded-full", latir && "ss-latir")} style={{ width: tam, height: tam, background: color, boxShadow: `0 0 8px ${conAlfa(color, 0.7)}` }} />;
}

// ── Esqueletos ───────────────────────────────────────────────────────

export type FormaEsqueleto = "lista" | "rejilla" | "tarjetas" | "cifras" | "orbe";

export function Esqueleto({ forma = "lista", filas = 3 }: { forma?: FormaEsqueleto; filas?: number }) {
    const e = estilos.esqueleto;
    if (forma === "orbe") {
        return <div aria-hidden className="grid h-full place-items-center"><span className={cn(e, "aspect-square h-3/5 max-h-40 rounded-full")} /></div>;
    }
    if (forma === "cifras") {
        return (
            <div aria-hidden className="grid h-full grid-cols-2 gap-3 p-1">
                {Array.from({ length: 4 }, (_, i) => <span key={i} className={cn(e, "rounded-[14px]")} style={{ animationDelay: `${i * 90}ms` }} />)}
            </div>
        );
    }
    if (forma === "rejilla") {
        return (
            <div aria-hidden className="grid h-full grid-cols-3 gap-2 p-1">
                {Array.from({ length: Math.max(3, filas * 3) }, (_, i) => <span key={i} className={cn(e, "aspect-square rounded-[12px]")} style={{ animationDelay: `${i * 60}ms` }} />)}
            </div>
        );
    }
    if (forma === "tarjetas") {
        return (
            <div aria-hidden className="flex h-full gap-3 p-1">
                {Array.from({ length: Math.max(2, filas) }, (_, i) => (
                    <div key={i} className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className={cn(e, "h-3/5 rounded-[14px]")} style={{ animationDelay: `${i * 90}ms` }} />
                        <span className={cn(e, "h-3 w-4/5 rounded-full")} />
                        <span className={cn(e, "h-3 w-3/5 rounded-full")} />
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div aria-hidden className="flex h-full flex-col gap-3 p-1">
            {Array.from({ length: filas }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <span className={cn(e, "size-9 shrink-0 rounded-full")} style={{ animationDelay: `${i * 90}ms` }} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className={cn(e, "h-2.5 w-2/5 rounded-full")} style={{ animationDelay: `${i * 90}ms` }} />
                        <span className={cn(e, "h-2.5 w-4/5 rounded-full")} style={{ animationDelay: `${i * 90 + 45}ms` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

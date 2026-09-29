"use client";
/**
 * Piezas de la familia económica (paquete B · Ola 0929): el glifo de la Semilla, la curva de la
 * Bolsa en SVG ligero (sin librerías de gráficos), la variación con su flecha y la etiqueta honesta
 * de la beta (bolsa y cartera simuladas: ninguna operación mueve valor real).
 */
import * as React from "react";
import { TrendingDown, TrendingUp, Minus, TestTubeDiagonal } from "lucide-react";
import { cn } from "@/lib/utils";
import { estilosB, haloB, sombraB, tintaB } from "./piezas-b";
import { porcentaje, type PuntoMercado } from "./datos-economia";

/** La Semilla: una almendra de luz con su brote. */
export function SemillaGlifo({ lado, color, className }: { lado: number; color: string; className?: string }) {
    const id = React.useId().replace(/:/g, "");
    return (
        <svg width={lado} height={lado} viewBox="0 0 48 48" aria-hidden className={cn("shrink-0 overflow-visible", className)}>
            <defs>
                <radialGradient id={`s${id}`} cx="38%" cy="32%" r="75%">
                    <stop offset="0%" stopColor={tintaB(color, 0.7)} />
                    <stop offset="55%" stopColor={color} />
                    <stop offset="100%" stopColor={sombraB(color, 0.4)} stopOpacity={0.9} />
                </radialGradient>
                <radialGradient id={`h${id}`}>
                    <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle cx={24} cy={27} r={22} fill={`url(#h${id})`} />
            <path d="M24 42c-8.5 0-13-6.4-13-13.2C11 19.6 17.6 12 24 8c6.4 4 13 11.6 13 20.8C37 35.6 32.5 42 24 42Z" fill={`url(#s${id})`} stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} />
            <path d="M24 36c0-6 0-10 4.5-15" fill="none" stroke="#0b1020" strokeOpacity={0.45} strokeWidth={1.6} strokeLinecap="round" />
            <path d="M28.2 21.5c2.6-.6 4.6.2 5.8 1.8-2.5 1-4.6.6-5.8-1.8Z" fill="#0b1020" fillOpacity={0.4} />
            <ellipse cx={19.5} cy={20} rx={3.2} ry={5.5} fill="#fff" fillOpacity={0.28} transform="rotate(-22 19.5 20)" />
        </svg>
    );
}

/** Variación con su flecha y color (verde sube, rosa baja, gris quieto). */
export function DeltaB({ v, sufijo, grande }: { v: number | null; sufijo?: string; grande?: boolean }) {
    if (v === null) return <span className="text-[11px] text-white/45">sin variación aún</span>;
    const sube = v > 0.05, baja = v < -0.05;
    const Icono = sube ? TrendingUp : baja ? TrendingDown : Minus;
    const color = sube ? "#34d399" : baja ? "#fb7185" : "#94a3b8";
    return (
        <span className={cn("inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums", grande ? "text-[13px]" : "text-[11px]")} style={{ color }}>
            <Icono className={grande ? "size-4" : "size-3.5"} aria-hidden />
            {porcentaje(v)}{sufijo ? <span className="font-normal text-white/50"> {sufijo}</span> : null}
        </span>
    );
}

/** «Beta simulada»: la bolsa y la cartera de la beta no mueven valor real. */
export function EtiquetaBeta({ texto = "Beta simulada" }: { texto?: string }) {
    const motivo = "La Bolsa de la Semilla y la cartera están en beta: cotizaciones de prueba y ninguna operación mueve valor real.";
    return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full ss-redondo px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200"
            style={haloB("#a78bfa", 0.14, 0.45)} title={motivo} aria-label={`${texto}. ${motivo}`}>
            <TestTubeDiagonal className="size-3" aria-hidden /> {texto}
        </span>
    );
}

/**
 * Curva de la Bolsa: área con degradado del acento, trazo fino que no se deforma, el último
 * punto con latido y, si se pide, las marcas de máximo y mínimo (en HTML: no se estiran).
 */
export function CurvaMercado({ serie, color, className, marcas, etiqueta }: {
    serie: PuntoMercado[];
    color: string;
    className?: string;
    marcas?: boolean;
    etiqueta: string;
}) {
    const id = React.useId().replace(/:/g, "");
    if (serie.length < 2) {
        return <div role="img" aria-label={`${etiqueta}: aún no hay cotizaciones suficientes`} className={cn("grid place-items-center text-[11px] text-white/45", className)}>sin cotizaciones suficientes</div>;
    }
    const W = 100, Hh = 40, pad = 3;
    const v = serie.map((p) => p.eur);
    const min = Math.min(...v), max = Math.max(...v), rango = max - min || 1;
    const x = (i: number) => (i / (serie.length - 1)) * W;
    const y = (e: number) => Hh - pad - ((e - min) / rango) * (Hh - pad * 2);
    const linea = v.map((e, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(e).toFixed(2)}`).join(" ");
    const area = `${linea} L${W} ${Hh} L0 ${Hh} Z`;
    const iMax = v.indexOf(max), iMin = v.indexOf(min), iFin = v.length - 1;
    const punto = (i: number) => ({ left: `${(x(i) / W) * 100}%`, top: `${(y(v[i]) / Hh) * 100}%` });
    return (
        <div role="img" aria-label={etiqueta} className={cn("relative", className)}>
            <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                <defs>
                    <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.38} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <path d={area} fill={`url(#a${id})`} />
                <path d={linea} fill="none" stroke={tintaB(color, 0.25)} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {marcas && iMax !== iFin && <Marca estilo={punto(iMax)} color="#34d399" titulo="máximo" />}
            {marcas && iMin !== iFin && <Marca estilo={punto(iMin)} color="#fb7185" titulo="mínimo" />}
            <span aria-hidden className="pointer-events-none absolute -ml-[5px] -mt-[5px] grid size-[10px] place-items-center" style={punto(iFin)}>
                <span className={cn("absolute inset-0 rounded-full", estilosB.latido)} style={{ background: color, opacity: 0.45 }} />
                <span className="size-[6px] rounded-full" style={{ background: tintaB(color, 0.5) }} />
            </span>
        </div>
    );
}

function Marca({ estilo, color, titulo }: { estilo: React.CSSProperties; color: string; titulo: string }) {
    return <span aria-hidden title={titulo} className="pointer-events-none absolute -ml-[3px] -mt-[3px] size-[6px] rounded-full" style={{ ...estilo, background: color, boxShadow: `0 0 0 2px rgba(12,14,34,.8)` }} />;
}

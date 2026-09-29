"use client";
/**
 * Familia de medios del paquete E (Ola 0929): las piezas que comparten el Reproductor, la Radio y
 * el Control de medios, para que los tres se lean como UNA familia de reproductores.
 *
 *  · PortadaE — la portada: la imagen de la pista o, si no tiene, un disco generado de su nombre
 *    (anillos deterministas) que gira mientras suena.
 *  · OndaE — forma de onda de la pista (decorativa: la silueta sale del nombre, no del audio) donde
 *    lo ya escuchado se ilumina; se toca para saltar. Para una radio en vivo: barras de ecualizador.
 *  · TransporteE, VolumenE — mandos con objetivos de 44 px en táctil y foco visible.
 * Todo el audio arranca SIEMPRE con un gesto (el motor compartido solo suena desde un clic).
 */
import * as React from "react";
import { Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { mezclar } from "@/components/widgets-libres/familias/comun";
import type { LienzoE } from "./lienzo";
import { BotonE, RangoE, estilosE } from "./piezas";

/** Hash FNV-1a de 32 bits: la misma pista, el mismo dibujo. */
export function hashE(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** Números pseudoaleatorios deterministas a partir de una semilla. */
export function serieE(semilla: number, n: number): number[] {
    let x = semilla || 1;
    return Array.from({ length: n }, () => {
        x ^= x << 13; x >>>= 0;
        x ^= x >> 17;
        x ^= x << 5; x >>>= 0;
        return (x % 1000) / 1000;
    });
}

export function tiempoE(seg: number): string {
    if (!Number.isFinite(seg) || seg < 0) return "0:00";
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Color propio de una pista (del acento, girado por su nombre) para que cada una tenga su luz. */
export function colorPista(id: string, acento: string, acento2: string): string {
    const t = (hashE(id) % 100) / 100;
    return /^#[0-9a-f]{6}$/i.test(acento) && /^#[0-9a-f]{6}$/i.test(acento2) ? mezclar(acento, acento2, t * 0.7) : acento;
}

export function PortadaE({ id, arte, lado, suena, lienzo, radio, redonda = true }: { id: string; arte?: string; lado: number; suena: boolean; lienzo: LienzoE; radio?: boolean; redonda?: boolean }) {
    const c = colorPista(id || "nada", lienzo.acento, lienzo.acento2);
    const anillos = serieE(hashE(id || "nada"), 6);
    const r = lado / 2;
    const gid = React.useId().replace(/:/g, "");
    if (arte) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={arte} alt="" aria-hidden className={cn("shrink-0 object-cover", redonda ? "rounded-full" : "rounded-2xl")} style={{ width: lado, height: lado, boxShadow: `0 10px 30px -12px ${conAlfa(c, 0.8)}` }} />
        );
    }
    return (
        <svg width={lado} height={lado} viewBox={`0 0 ${lado} ${lado}`} aria-hidden className="shrink-0 overflow-visible" style={{ filter: `drop-shadow(0 10px 18px ${conAlfa(c, 0.45)})` }}>
            <defs>
                <radialGradient id={`pv-${gid}`} cx="35%" cy="30%" r="80%">
                    <stop offset="0%" stopColor={mezclar(/^#[0-9a-f]{6}$/i.test(c) ? c : "#7c5cff", "#ffffff", 0.25)} />
                    <stop offset="55%" stopColor={c} />
                    <stop offset="100%" stopColor="#0b0c1e" />
                </radialGradient>
            </defs>
            <g className={cn(estilosE.disco)} data-quieto={suena && lienzo.animar ? "no" : "si"} style={{ ["--e-dur" as string]: radio ? "22s" : "14s" }}>
                <circle cx={r} cy={r} r={r - 1} fill={`url(#pv-${gid})`} />
                {anillos.map((v, i) => (
                    <circle key={i} cx={r} cy={r} r={r * (0.34 + i * 0.11)} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={0.6 + v * 1.2} strokeDasharray={`${4 + v * 26} ${3 + (1 - v) * 10}`} />
                ))}
                {/* un brillo que delata el giro */}
                <path d={`M${r} ${r * 0.18} A${r * 0.82} ${r * 0.82} 0 0 1 ${r + r * 0.7} ${r * 0.55}`} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth={Math.max(1, lado * 0.02)} strokeLinecap="round" />
            </g>
            <circle cx={r} cy={r} r={r * 0.2} fill="#0b0c1e" stroke={conAlfa(c, 0.8)} strokeWidth={1} />
            <circle cx={r} cy={r} r={r * 0.05} fill="#fff" opacity={0.8} />
        </svg>
    );
}

/** Barras de ecualizador: se mueven solo si suena y se permite movimiento. */
export function EqE({ suena, lienzo, barras = 5, alto = 18, color }: { suena: boolean; lienzo: LienzoE; barras?: number; alto?: number; color?: string }) {
    const c = color ?? lienzo.acento;
    const vivo = suena && lienzo.animar;
    return (
        <span aria-hidden className="inline-flex shrink-0 items-end gap-[3px]" style={{ height: alto }}>
            {Array.from({ length: barras }, (_, i) => (
                <span key={i} className={cn("w-[3px] rounded-full", vivo && estilosE.eq)}
                    style={{ height: "100%", background: `linear-gradient(180deg, ${c}, ${conAlfa(c, 0.4)})`, transform: vivo ? undefined : `scaleY(${0.25 + ((i * 37) % 60) / 100})`, transformOrigin: "50% 100%", ["--e-dur" as string]: `${600 + ((i * 173) % 500)}ms`, ["--e-retardo" as string]: `${(i * 97) % 400}ms` } as React.CSSProperties} />
            ))}
        </span>
    );
}

/** Onda de la pista con el progreso iluminado; tocar salta a ese punto. */
export function OndaE({ id, progreso, alto, lienzo, onSaltar, etiqueta, barras = 48 }: { id: string; progreso: number; alto: number; lienzo: LienzoE; onSaltar?: (f: number) => void; etiqueta: string; barras?: number }) {
    const valores = React.useMemo(() => serieE(hashE(id), barras).map((v, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.37 + v * 2.4)) * (0.55 + v * 0.45)), [id, barras]);
    const c = colorPista(id, lienzo.acento, lienzo.acento2);
    const alTocar = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onSaltar) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSaltar(Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))));
    };
    const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!onSaltar) return;
        if (e.key === "ArrowRight") { e.preventDefault(); onSaltar(Math.min(1, progreso + 0.05)); }
        if (e.key === "ArrowLeft") { e.preventDefault(); onSaltar(Math.max(0, progreso - 0.05)); }
    };
    return (
        <div
            role={onSaltar ? "slider" : "img"}
            aria-label={etiqueta}
            aria-valuemin={onSaltar ? 0 : undefined}
            aria-valuemax={onSaltar ? 100 : undefined}
            aria-valuenow={onSaltar ? Math.round(progreso * 100) : undefined}
            tabIndex={onSaltar ? 0 : undefined}
            onClick={alTocar}
            onKeyDown={alTeclear}
            className={cn("flex w-full min-w-0 items-center gap-[2px] rounded-md outline-none focus-visible:ring-2", onSaltar && "cursor-pointer")}
            style={{ height: alto, ["--tw-ring-color" as string]: c } as React.CSSProperties}
        >
            {valores.map((v, i) => {
                const hecho = (i + 0.5) / valores.length <= progreso;
                return <span key={i} className="min-w-[2px] flex-1 rounded-full transition-colors duration-300" style={{ height: `${Math.round(v * 100)}%`, background: hecho ? `linear-gradient(180deg, ${c}, ${conAlfa(lienzo.acento2, 0.8)})` : "rgba(255,255,255,.18)" }} />;
            })}
        </div>
    );
}

export function TransporteE({ lienzo, suena, cargando, hayPista, onAnterior, onAlternar, onSiguiente, grande, sinSaltos }: {
    lienzo: LienzoE; suena: boolean; cargando: boolean; hayPista: boolean;
    onAnterior?: () => void; onAlternar: () => void; onSiguiente?: () => void; grande?: boolean; sinSaltos?: boolean;
}) {
    const lado = lienzo.tactil ? 52 : grande ? 48 : 40;
    return (
        <div role="group" aria-label="Controles de reproducción" className="flex shrink-0 items-center justify-center gap-2">
            {!sinSaltos && <BotonE lienzo={lienzo} variante="fantasma" icono={SkipBack} etiqueta="Anterior" disabled={!hayPista || !onAnterior} onClick={onAnterior} />}
            <button
                type="button"
                onClick={onAlternar}
                aria-label={suena ? "Pausar" : "Reproducir"}
                title={suena ? "Pausar" : "Reproducir"}
                className="ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white outline-none transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                style={{ width: lado, height: lado, background: `linear-gradient(145deg, ${lienzo.acento}, ${conAlfa(lienzo.acento2, 0.85)})`, boxShadow: `0 10px 24px -10px ${conAlfa(lienzo.acento, 0.9)}, inset 0 1px 0 rgba(255,255,255,.35)`, ["--tw-ring-color" as string]: lienzo.acento } as React.CSSProperties}
            >
                {cargando ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : suena ? <Pause className="size-5" aria-hidden fill="currentColor" /> : <Play className="size-5 translate-x-[1px]" aria-hidden fill="currentColor" />}
            </button>
            {!sinSaltos && <BotonE lienzo={lienzo} variante="fantasma" icono={SkipForward} etiqueta="Siguiente" disabled={!hayPista || !onSiguiente} onClick={onSiguiente} />}
        </div>
    );
}

export function VolumenE({ lienzo, volumen, onCambio, className }: { lienzo: LienzoE; volumen: number; onCambio: (v: number) => void; className?: string }) {
    const previo = React.useRef(0.8);
    const Icono = volumen <= 0 ? VolumeX : volumen < 0.5 ? Volume1 : Volume2;
    return (
        <div className={cn("flex min-w-0 items-center gap-2", className)}>
            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Icono} etiqueta={volumen <= 0 ? "Activar sonido" : "Silenciar"}
                onClick={() => { if (volumen > 0) { previo.current = volumen; onCambio(0); } else onCambio(previo.current || 0.8); }} />
            <RangoE lienzo={lienzo} valor={volumen} onCambio={onCambio} etiqueta="Volumen" textoValor={`${Math.round(volumen * 100)} por ciento`} />
        </div>
    );
}

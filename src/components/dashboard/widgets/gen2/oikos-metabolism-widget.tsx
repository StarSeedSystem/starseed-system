'use client';

// ════════════════════════════════════════════════════════════════
// Metabolismo Oikos — lo que el cielo da aquí y lo que podríais captar (Ola 0929).
// ----------------------------------------------------------------
// Antes: energía, agua y alimento inventados que «respiraban» cada 3 s. Ahora, datos
// REALES y públicos (Open-Meteo, sin clave, la misma fuente del Clima): la radiación
// solar (kWh/m²), las horas de sol y la lluvia (L/m²) de hoy y los próximos 6 días en tu
// ubicación del Clima. Las captaciones son ESTIMACIONES con los supuestos a la vista
// (superficie de paneles y de tejado que eliges, rendimiento 18 %, aprovechamiento 80 %).
// Una petición por lugar y hora como mucho (caché compartida). Invariante (§3): el Oikos
// —energía, agua, alimento— es procomún; este widget ayuda a planificarlo.
//
//   micro      → el Sol de hoy en kWh/m².
//   s          → Sol y lluvia de hoy.
//   m          → + los 7 días en espejo (sol arriba, lluvia abajo).
//   panorámico → cifras a la izquierda, semana a lo ancho.   torre → todo en columna.
//   l          → + tu captación estimada (paneles y tejado) con tus supuestos.
//   xl         → semana con días, totales, supuestos editables y de dónde sale cada dato.
// Estados honestos: cargando, error con reintento y vacío (sin ubicación → elegirla en el Clima).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Leaf, RefreshCw, MapPin } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useLugarB, useSupuestosOikos, type LugarB } from "./_paquete-b/lugar";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "./_paquete-b/cache-compartida";
import {
    APROVECHAMIENTO_TEJADO, RENDIMIENTO_PANEL, aguaTejado, cargarCieloOikos, diaCorto, energiaPaneles,
    type CieloOikos, type DiaOikos,
} from "./_paquete-b/datos-oikos";
import { AccionB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#10b981", acento2: "#7c5cff" };
const SOL = "#FFBF00";
const LLUVIA = "#38bdf8";
const DEC1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const ENT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

type Lugar = LugarB;
const useLugar = useLugarB;

const useSupuestos = useSupuestosOikos;

export function OikosMetabolismWidget() {
    const marco = useMarcoUnificado();
    const lugar = useLugar();
    const clave = lugar ? `oikos.cielo.v1.${lugar.lat.toFixed(2)},${lugar.lon.toFixed(2)}` : null;
    const cargar = useCallback(() => cargarCieloOikos(lugar!.lat, lugar!.lon, lugar!.nombre), [lugar]);
    const cielo = useDatoCompartido<CieloOikos>(clave, cargar, { ttlMs: 60 * 60_000 });
    return (
        <WidgetShell
            title="Metabolismo Oikos"
            subtitle={lugar?.nombre ? `Lo que el cielo da en ${lugar.nombre}` : "Lo que el cielo da aquí"}
            icon={Leaf}
            bare={marco?.base === "micro"}
            actions={lugar ? (
                <button type="button" onClick={cielo.recargar} aria-label="Actualizar el cielo del Oikos"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", cielo.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            ) : undefined}
        >
            {(size) => <Cuerpo size={size} lugar={lugar} cielo={cielo} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, lugar, cielo }: { size: ElementSize; lugar: Lugar | null; cielo: ResultadoDato<CieloOikos> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    if (!lugar) {
        contenido = lienzo.base === "micro"
            ? <a href="/clima" aria-label="Elige tu lugar en el Clima" className={cn(estilosB.foco, "grid h-full place-items-center text-white/70")}><MapPin className="size-6" aria-hidden /></a>
            : <WidgetEmptyState icon={MapPin} title="¿Dónde está tu Oikos?" message="Elige tu lugar en el Clima para ver el sol y la lluvia que recibe." actionLabel="Elegir lugar" actionHref="/clima" accent={lienzo.acento} />;
    } else if (!cielo.dato) {
        contenido = cielo.estado === "error"
            ? <WidgetErrorState message={cielo.error ?? "No se pudo leer el cielo."} onRetry={cielo.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else {
        contenido = <Composicion dias={cielo.dato.dias} lugar={lugar} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function GlifoSol({ lado }: { lado: number }) {
    const id = useId().replace(/:/g, "");
    return (
        <svg width={lado} height={lado} viewBox="0 0 40 40" aria-hidden className="shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`sol${id}`}>
                    <stop offset="0%" stopColor="#fff8e1" />
                    <stop offset="45%" stopColor="#ffe08a" />
                    <stop offset="100%" stopColor={SOL} />
                </radialGradient>
            </defs>
            <g className={estilosB.orbita} style={{ ["--b-dur" as string]: "90s" }}>
                {Array.from({ length: 12 }, (_, i) => {
                    const a = (i * Math.PI) / 6;
                    return <line key={i} x1={20 + Math.cos(a) * 13} y1={20 + Math.sin(a) * 13} x2={20 + Math.cos(a) * (i % 2 ? 16 : 18.5)} y2={20 + Math.sin(a) * (i % 2 ? 16 : 18.5)} stroke={SOL} strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />;
                })}
            </g>
            <circle cx={20} cy={20} r={10} fill={`url(#sol${id})`} />
        </svg>
    );
}

function GlifoGota({ lado }: { lado: number }) {
    const id = useId().replace(/:/g, "");
    return (
        <svg width={lado} height={lado} viewBox="0 0 40 40" aria-hidden className="shrink-0">
            <defs>
                <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#bae6fd" />
                    <stop offset="100%" stopColor={LLUVIA} />
                </linearGradient>
            </defs>
            <path d="M20 5c5.5 8 10 13.2 10 19a10 10 0 0 1-20 0c0-5.8 4.5-11 10-19Z" fill={`url(#g${id})`} stroke="#fff" strokeOpacity={0.35} strokeWidth={0.8} />
            <ellipse cx={16} cy={24} rx={2.2} ry={4} fill="#fff" fillOpacity={0.35} />
        </svg>
    );
}

function Cifra({ glifo, valor, unidad, etiqueta, grande }: { glifo: ReactNode; valor: string; unidad: string; etiqueta: string; grande?: boolean }) {
    return (
        <div className="flex min-w-0 items-center gap-2" role="group" aria-label={`${etiqueta}: ${valor} ${unidad}`}>
            {glifo}
            <div className="min-w-0">
                <p className="flex items-baseline gap-1">
                    <span className={cn("font-light tabular-nums leading-none text-white", grande ? "text-[30px]" : "text-[24px]")}>{valor}</span>
                    <span className="text-[11px] font-semibold text-white/60">{unidad}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-white/55">{etiqueta}</p>
            </div>
        </div>
    );
}

/** La semana en espejo: el sol crece hacia arriba, la lluvia hacia abajo. */
function Espejo({ dias, conDias, className }: { dias: DiaOikos[]; conDias?: boolean; className?: string }) {
    const maxSol = Math.max(...dias.map((d) => d.solKwh), 1);
    const maxLluvia = Math.max(...dias.map((d) => d.lluviaL), 10);
    const n = dias.length;
    return (
        <div className={cn("flex min-h-0 flex-col gap-1", className)}>
            <svg viewBox={`0 0 ${n * 20} 64`} preserveAspectRatio="none" className="min-h-[40px] w-full flex-1" role="img"
                aria-label={`Próximos ${n} días: ${dias.map((d) => `${diaCorto(d.fecha)} ${DEC1.format(d.solKwh)} kWh/m² y ${DEC1.format(d.lluviaL)} L/m²`).join("; ")}`}>
                <line x1={0} x2={n * 20} y1={32} y2={32} stroke="#fff" strokeOpacity={0.15} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
                {dias.map((d, i) => {
                    const hs = (d.solKwh / maxSol) * 29;
                    const hl = (d.lluviaL / maxLluvia) * 29;
                    return (
                        <g key={d.fecha} className={estilosB.entrar} style={{ animationDelay: `${i * 40}ms` }}>
                            <rect x={i * 20 + 5} y={31 - hs} width={10} height={Math.max(0.5, hs)} rx={3} fill={SOL} opacity={i === 0 ? 1 : 0.75} />
                            {hl > 0.2 && <rect x={i * 20 + 5} y={33} width={10} height={hl} rx={3} fill={LLUVIA} opacity={i === 0 ? 1 : 0.75} />}
                        </g>
                    );
                })}
            </svg>
            {conDias && (
                <div className="grid text-center text-[10px] tabular-nums text-white/55" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
                    {dias.map((d, i) => <span key={d.fecha} className={i === 0 ? "font-semibold text-white/85" : undefined}>{i === 0 ? "hoy" : diaCorto(d.fecha)}</span>)}
                </div>
            )}
        </div>
    );
}

function Supuestos({ s, cambiar, lienzo }: { s: { paneles: number; tejado: number }; cambiar: (p: Partial<{ paneles: number; tejado: number }>) => void; lienzo: LienzoB }) {
    const id = useId().replace(/:/g, "");
    const campo = (clave: "paneles" | "tejado", etiqueta: string) => (
        <label htmlFor={`${id}-${clave}`} className="flex items-center gap-1.5 text-[12px] text-white/70">
            {etiqueta}
            <input id={`${id}-${clave}`} type="number" min={0} max={100000} inputMode="numeric" value={s[clave]}
                onChange={(e) => cambiar({ [clave]: Math.max(0, Math.min(100000, Number(e.target.value) || 0)) })}
                className={cn(estilosB.foco, lienzo.tactil ? "min-h-11" : "min-h-8", "w-20 rounded-full ss-redondo bg-white/[0.06] px-3 text-right tabular-nums text-white outline-none")} />
            m²
        </label>
    );
    return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">{campo("paneles", "Paneles")}{campo("tejado", "Tejado")}</div>;
}

function Composicion({ dias, lugar, lienzo }: { dias: DiaOikos[]; lugar: Lugar; lienzo: LienzoB }) {
    const [s, cambiar] = useSupuestos();
    const hoy = dias[0];
    const semana = useMemo(() => ({
        sol: dias.reduce((a, d) => a + d.solKwh, 0),
        lluvia: dias.reduce((a, d) => a + d.lluviaL, 0),
    }), [dias]);
    const b = lienzo.base;
    const solHoy = DEC1.format(hoy.solKwh);
    const lluviaHoy = DEC1.format(hoy.lluviaL);

    if (b === "micro") {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-0.5 text-center" role="group" aria-label={`Hoy en ${lugar.nombre}: ${solHoy} kWh/m² de sol y ${lluviaHoy} L/m² de lluvia`}>
                <GlifoSol lado={34} />
                <span className="text-[20px] font-light tabular-nums leading-none text-white">{solHoy}</span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/55">kWh/m² hoy</span>
            </div>
        );
    }

    const lado = lienzo.tv ? 40 : b === "s" ? 28 : 34;
    const cifras = (vertical: boolean) => (
        <div className={cn("flex gap-3", vertical ? "flex-col" : "flex-wrap items-center justify-between")}>
            <Cifra glifo={<GlifoSol lado={lado} />} valor={solHoy} unidad="kWh/m²" etiqueta={`sol hoy · ${DEC1.format(hoy.solHoras)} h`} grande={b === "xl"} />
            <Cifra glifo={<GlifoGota lado={lado} />} valor={lluviaHoy} unidad="L/m²" etiqueta="lluvia hoy" grande={b === "xl"} />
        </div>
    );
    const estimacion = (periodo: "hoy" | "semana") => {
        const sol = periodo === "hoy" ? hoy.solKwh : semana.sol;
        const lluvia = periodo === "hoy" ? hoy.lluviaL : semana.lluvia;
        return (
            <p className="text-[12px] leading-relaxed text-white/75">
                {periodo === "hoy" ? "Hoy" : "Esta semana"}, {s.paneles} m² de paneles darían <b className="font-semibold" style={{ color: tintaB(SOL, 0.3) }}>≈ {DEC1.format(energiaPaneles(sol, s.paneles))} kWh</b>
                {" "}y {s.tejado} m² de tejado recogerían <b className="font-semibold" style={{ color: tintaB(LLUVIA, 0.3) }}>≈ {ENT.format(aguaTejado(lluvia, s.tejado))} L</b>.
            </p>
        );
    };
    const fuente = (
        <p className="text-[10px] text-white/45">
            Fuente: Open-Meteo · estimación con rendimiento {Math.round(RENDIMIENTO_PANEL * 100)} % y aprovechamiento {Math.round(APROVECHAMIENTO_TEJADO * 100)} %.
        </p>
    );

    if (b === "s") return <div className="flex h-full flex-col justify-center gap-2">{cifras(true)}</div>;
    if (lienzo.clase === "panoramico") {
        return (
            <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 2fr)" }}>
                {cifras(true)}
                <Espejo dias={dias} conDias className="h-full" />
            </div>
        );
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2">{cifras(false)}<Espejo dias={dias} className="min-h-0 flex-1" /></div>;
    }
    if (lienzo.clase === "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-3">{cifras(true)}<Espejo dias={dias} conDias className="h-24" />{estimacion("hoy")}<div className="mt-auto">{fuente}</div></div>;
    }
    if (b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                {cifras(false)}
                <Espejo dias={dias} conDias className="min-h-[56px] flex-1" />
                <div className="flex flex-col gap-1.5">
                    <RotuloB>Tu captación estimada</RotuloB>
                    {estimacion("hoy")}
                    <Supuestos s={s} cambiar={cambiar} lienzo={lienzo} />
                </div>
                {fuente}
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
            <div className="flex min-h-0 flex-col gap-3">
                {cifras(false)}
                <Espejo dias={dias} conDias className="min-h-[96px] flex-1" />
                <dl className="grid grid-cols-2 gap-2">
                    <div><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Sol · 7 días</dt><dd className="text-[16px] tabular-nums text-white">{DEC1.format(semana.sol)} kWh/m²</dd></div>
                    <div><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Lluvia · 7 días</dt><dd className="text-[16px] tabular-nums text-white">{DEC1.format(semana.lluvia)} L/m²</dd></div>
                </dl>
            </div>
            <div className="flex min-h-0 flex-col gap-2.5 border-l border-white/[0.08] pl-4">
                <RotuloB>Tu captación estimada</RotuloB>
                {estimacion("hoy")}
                {estimacion("semana")}
                <Supuestos s={s} cambiar={cambiar} lienzo={lienzo} />
                <p className="border-l-2 pl-2.5 text-[11px] leading-relaxed text-white/65" style={{ borderColor: lienzo.acento }}>
                    El Oikos es procomún: con estas cifras la asamblea puede decidir cuántos paneles y cisternas necesita la Sangha.
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                    <AccionB href="/clima" icono={MapPin} color={lienzo.acento2} tactil={lienzo.tactil}>Cambiar lugar</AccionB>
                </div>
                {fuente}
            </div>
        </div>
    );
}

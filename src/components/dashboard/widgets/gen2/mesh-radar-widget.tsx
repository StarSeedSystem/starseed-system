'use client';

// ════════════════════════════════════════════════════════════════
// Radar de malla — tu red soberana, en vivo y sin coste (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: nodos, señales y latencias inventados cada 3,5 s. Ahora, el estado REAL que ya
// publica el motor único de la malla (`useMallaNeuronasEstado`, montado una vez en el layout):
// tus neuronas con su vínculo WebRTC (conectado · conectando · fallido · sin vínculo), la ruta
// medida (misma red local · internet directo · reenviado) y su latencia, y las neuronas
// CERCANAS de otras cuentas detectadas por faros. Solo lectura: CERO peticiones propias.
// Donde el motor no corre (p. ej. el Mando) se dice, no se inventa. Invariante (§6): red
// federada, descentralizada; el vínculo entre cuentas exige el consentimiento de ambas.
//
//   micro      → el radar con tus neuronas enlazadas.
//   s          → el radar con barrido y la cifra.
//   m          → + tus neuronas con su estado de vínculo.
//   panorámico → radar · tus neuronas · cercanas.   torre → en columna.
//   l          → + ruta y latencia de cada enlace, y las cercanas.
//   xl         → radar grande, leyenda y ambas listas completas.
// Estados honestos: cargando (el motor aún mide), vacío (solo este dispositivo) y error del
// enlace (vínculo fallido, con su motivo).
// ════════════════════════════════════════════════════════════════

import { useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Radar, Monitor, Laptop, Smartphone, Tablet, Server, Cpu, Globe2, type LucideIcon } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { useMallaNeuronasEstado, type DispositivoMallaRow, type MallaNeuronasState, type NeuronaCercanaRow, type EstadoEnlace } from "@/lib/network/malla-neuronas";
import { cn } from "@/lib/utils";
import { AccionB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "./_paquete-b/piezas-b";

const FAMILIA = { acento: "#94a3b8", acento2: "#23d5ab" };
export const COLOR_ENLACE: Record<EstadoEnlace | "este", string> = { conectado: "#10b981", conectando: "#f59e0b", fallido: "#f43f5e", "sin-vinculo": "#64748b", este: "#23d5ab" };
const ETIQUETA_ENLACE: Record<EstadoEnlace, string> = { conectado: "enlazada", conectando: "enlazando", fallido: "fallo de enlace", "sin-vinculo": "sin vínculo" };
const ETIQUETA_RUTA: Record<string, string> = { "misma-red-local": "misma red local", "internet-directo": "internet directo", "reenviado-turn": "reenviado", desconocida: "ruta sin medir" };
const ICONO_TIPO: Record<string, LucideIcon> = { desktop: Monitor, laptop: Laptop, mobile: Smartphone, tablet: Tablet, server: Server };

/** Resumen del estado de la malla (PURO). */
export function resumenMalla(s: Pick<MallaNeuronasState, "misDispositivos" | "cercanas">): { mias: number; enlazadas: number; enLinea: number; cercanas: number; fallidas: number } {
    const otras = s.misDispositivos.filter((d) => !d.esEsteDispositivo);
    return {
        mias: s.misDispositivos.length,
        enlazadas: otras.filter((d) => d.enlace.estado === "conectado").length,
        enLinea: otras.filter((d) => d.online).length,
        cercanas: s.cercanas.length,
        fallidas: otras.filter((d) => d.enlace.estado === "fallido").length,
    };
}

export function MeshRadarWidget() {
    const marco = useMarcoUnificado();
    const estado = useMallaNeuronasEstado();
    return (
        <WidgetShell title="Radar de malla" subtitle="Tu red soberana" icon={Radar} bare={marco?.base === "micro"}>
            {(size) => <Cuerpo size={size} estado={estado} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, estado }: { size: ElementSize; estado: MallaNeuronasState }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    if (estado.loading && estado.misDispositivos.length === 0) {
        contenido = lienzo.base === "micro"
            ? <WidgetSkeleton variant="rings" />
            : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center" role="status">
                    <RadarSvg estado={estado} lienzo={lienzo} lado={Math.min(120, Math.max(64, size.height - 80))} barrido={visible} etiqueta="Buscando tu malla" />
                    <p className="max-w-[28ch] text-[12px] text-white/60">Buscando tu malla… Si tarda, el motor de la malla no corre en esta vista.</p>
                </div>
            );
    } else if (estado.misDispositivos.length <= 1 && estado.cercanas.length === 0) {
        contenido = lienzo.base === "micro"
            ? <Link href="/red-mesh" aria-label="Solo este dispositivo en tu malla. Abrir la red mesh" className={cn(estilosB.foco, "grid h-full place-items-center")}><RadarSvg estado={estado} lienzo={lienzo} lado={72} barrido={visible} /></Link>
            : <WidgetEmptyState icon={Radar} title="Solo este dispositivo, por ahora" message="Entra con tu cuenta en otro dispositivo y se enlazarán solos por la malla." actionLabel="Abrir la red mesh" actionHref="/red-mesh" accent={lienzo.acento2} />;
    } else {
        contenido = <Composicion estado={estado} lienzo={lienzo} visible={visible} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ estado, lienzo, visible }: { estado: MallaNeuronasState; lienzo: LienzoB; visible: boolean }) {
    const r = resumenMalla(estado);
    const b = lienzo.base;
    const frase = `${r.enlazadas} de ${Math.max(0, r.mias - 1)} neuronas tuyas enlazadas; ${r.cercanas} ${r.cercanas === 1 ? "neurona cercana" : "neuronas cercanas"} de otras cuentas`;
    const radar = (lado: number) => <RadarSvg estado={estado} lienzo={lienzo} lado={lado} barrido={visible} etiqueta={frase} />;
    const abrir = <AccionB href="/red-mesh" icono={Radar} color={lienzo.acento2} tactil={lienzo.tactil}>Abrir la red mesh</AccionB>;
    if (b === "micro") return <Link href="/red-mesh" aria-label={`${frase}. Abrir la red mesh`} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>{radar(76)}</Link>;
    if (b === "s") return <div className="flex h-full flex-col items-center justify-center gap-1 text-center">{radar(96)}<p className="text-[12px] text-white/70"><b className="font-semibold text-white tabular-nums">{r.enlazadas}</b> enlazadas · <b className="font-semibold text-white tabular-nums">{r.cercanas}</b> cerca</p></div>;
    const mias = (max: number, detalle: boolean) => <ListaMias filas={estado.misDispositivos} max={max} detalle={detalle} lienzo={lienzo} />;
    const cercanas = (max: number) => <ListaCercanas filas={estado.cercanas} max={max} />;
    if (lienzo.clase === "panoramico") {
        return <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "auto minmax(0, 1.2fr) minmax(0, 1fr)" }}>{radar(104)}{mias(3, false)}{cercanas(3)}</div>;
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 items-center gap-3">{radar(110)}<div className="flex min-w-0 flex-1 flex-col gap-2">{mias(3, false)}</div></div>;
    }
    if (lienzo.clase === "torre" || b === "l") {
        return (
            <div className="flex h-full min-h-0 flex-col gap-2.5">
                <div className="flex items-center gap-3">{radar(120)}<RotuloB className="whitespace-normal">{frase}</RotuloB></div>
                {mias(4, true)}
                {cercanas(2)}
                <div className="mt-auto">{abrir}</div>
            </div>
        );
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)" }}>
            <div className="flex min-h-0 flex-col items-center gap-3">
                {radar(lienzo.tv ? 210 : 180)}
                <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-white/65" aria-label="Leyenda del radar">
                    {(["conectado", "conectando", "fallido", "sin-vinculo"] as EstadoEnlace[]).map((e) => (
                        <li key={e} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: COLOR_ENLACE[e] }} aria-hidden />{ETIQUETA_ENLACE[e]}</li>
                    ))}
                    <li className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${lienzo.acento2}` }} aria-hidden />cercana (otra cuenta)</li>
                </ul>
            </div>
            <div className="flex min-h-0 flex-col gap-3 border-l border-white/[0.08] pl-4">
                {mias(6, true)}
                {cercanas(4)}
                <p className="text-[11px] text-white/50">El vínculo con otras cuentas pide el consentimiento de ambas: se solicita desde la red mesh.</p>
                <div className="mt-auto">{abrir}</div>
            </div>
        </div>
    );
}

function ListaMias({ filas, max, detalle, lienzo }: { filas: DispositivoMallaRow[]; max: number; detalle: boolean; lienzo: LienzoB }) {
    return (
        <div className="flex min-h-0 flex-col gap-1">
            <RotuloB>Tus neuronas</RotuloB>
            <ul className="flex flex-col gap-0.5" aria-label="Tus neuronas en la malla">
                {filas.slice(0, max).map((d) => {
                    const Icono = ICONO_TIPO[d.tipo] ?? Cpu;
                    const color = d.esEsteDispositivo ? COLOR_ENLACE.este : COLOR_ENLACE[d.enlace.estado];
                    const ruta = d.enlace.ruta;
                    const texto = d.esEsteDispositivo ? "este dispositivo" : `${ETIQUETA_ENLACE[d.enlace.estado]}${d.enlace.estado === "fallido" && d.enlace.motivo ? ` · ${d.enlace.motivo}` : ""}`;
                    return (
                        <li key={d.neuronId} className={cn("flex items-center gap-2 text-[12px]", lienzo.tactil ? "min-h-11" : "min-h-7")}>
                            <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-white/[0.06]" aria-hidden>
                                <Icono className="size-3.5 text-white/75" />
                                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-[#0c0e22]" style={{ background: color }} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-white/85 line-clamp-1" title={d.nombre}>{d.nombre}</span>
                                <span className="block text-[10px] line-clamp-1" style={{ color: tintaB(color, 0.3) }}>{texto}</span>
                            </span>
                            {detalle && ruta && !d.esEsteDispositivo && (
                                <span className="shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-white/50">
                                    {ETIQUETA_RUTA[ruta.clase] ?? ruta.clase}{ruta.rttMs != null ? ` · ${Math.round(ruta.rttMs)} ms` : ""}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function ListaCercanas({ filas, max }: { filas: NeuronaCercanaRow[]; max: number }) {
    if (filas.length === 0) return <p className="text-[11px] text-white/50">Ninguna neurona de otra cuenta cerca ahora.</p>;
    return (
        <div className="flex min-h-0 flex-col gap-1">
            <RotuloB>Cerca, de otras cuentas</RotuloB>
            <ul className="flex flex-col gap-0.5" aria-label="Neuronas cercanas de otras cuentas">
                {filas.slice(0, max).map((c) => (
                    <li key={c.deviceId} className="flex items-center gap-2 text-[12px]">
                        <Globe2 className="size-3.5 shrink-0 text-teal-300/80" aria-hidden />
                        <span className="min-w-0 flex-1 text-white/80 line-clamp-1" title={c.etiqueta}>{c.etiqueta}</span>
                        <span className="shrink-0 text-[10px] text-white/45">{c.ofreceInternetPublico ? "ofrece internet · " : ""}hace {Math.max(1, Math.round(c.detectadaHaceMs / 60_000))} min</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** El radar: tú en el centro, tus neuronas en el anillo interior, las cercanas en el exterior. */
function RadarSvg({ estado, lienzo, lado, barrido, etiqueta }: { estado: MallaNeuronasState; lienzo: LienzoB; lado: number; barrido: boolean; etiqueta?: string }) {
    const id = useId().replace(/:/g, "");
    const vivo = lienzo.nivel !== "ligero" && barrido;
    const otras = estado.misDispositivos.filter((d) => !d.esEsteDispositivo).slice(0, 10);
    const cercanas = estado.cercanas.slice(0, 16);
    return (
        <svg width={lado} height={lado} viewBox="0 0 100 100" role={etiqueta ? "img" : undefined} aria-label={etiqueta} aria-hidden={etiqueta ? undefined : true} className="shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`f${id}`}>
                    <stop offset="0%" stopColor={lienzo.acento2} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0.02} />
                </radialGradient>
                <linearGradient id={`b${id}`} x1="50%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor={lienzo.acento2} stopOpacity={0} />
                    <stop offset="100%" stopColor={lienzo.acento2} stopOpacity={0.45} />
                </linearGradient>
            </defs>
            <circle cx={50} cy={50} r={48} fill={`url(#f${id})`} stroke="#fff" strokeOpacity={0.12} strokeWidth={0.6} />
            {[16, 32].map((r) => <circle key={r} cx={50} cy={50} r={r} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={0.5} strokeDasharray="1.5 3" />)}
            <line x1={2} y1={50} x2={98} y2={50} stroke="#fff" strokeOpacity={0.06} strokeWidth={0.4} />
            <line x1={50} y1={2} x2={50} y2={98} stroke="#fff" strokeOpacity={0.06} strokeWidth={0.4} />
            {vivo && (
                <g className={estilosB.orbita} style={{ ["--b-dur" as string]: "6s" }}>
                    <path d="M50 50 L98 50 A48 48 0 0 0 83.9 16.1 Z" fill={`url(#b${id})`} />
                </g>
            )}
            {cercanas.map((c, i) => {
                const a = (i / Math.max(1, cercanas.length)) * Math.PI * 2 + 0.4;
                const dist = 38 + Math.min(8, c.detectadaHaceMs / (10 * 60_000));
                return <circle key={c.deviceId} cx={50 + Math.cos(a) * dist} cy={50 + Math.sin(a) * dist} r={2} fill="none" stroke={lienzo.acento2} strokeOpacity={0.8} strokeWidth={0.9}><title>{c.etiqueta}</title></circle>;
            })}
            {otras.map((d, i) => {
                const a = (i / Math.max(1, otras.length)) * Math.PI * 2 - Math.PI / 2;
                const x = 50 + Math.cos(a) * 24, y = 50 + Math.sin(a) * 24;
                const color = COLOR_ENLACE[d.enlace.estado];
                return (
                    <g key={d.neuronId}>
                        {d.enlace.estado === "conectado" && <line x1={50} y1={50} x2={x} y2={y} stroke={color} strokeOpacity={0.55} strokeWidth={0.9} className={vivo ? estilosB.flujo : undefined} />}
                        <circle cx={x} cy={y} r={3.4} fill={color} opacity={d.online || d.enlace.estado === "conectado" ? 1 : 0.5}
                            className={d.enlace.estado === "conectando" && vivo ? estilosB.latido : undefined}><title>{`${d.nombre} · ${ETIQUETA_ENLACE[d.enlace.estado]}`}</title></circle>
                    </g>
                );
            })}
            <circle cx={50} cy={50} r={5} fill={COLOR_ENLACE.este} stroke="#fff" strokeOpacity={0.6} strokeWidth={0.8} />
        </svg>
    );
}

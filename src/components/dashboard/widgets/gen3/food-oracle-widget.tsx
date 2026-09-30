'use client';

// ════════════════════════════════════════════════════════════════
// Soberanía alimentaria — qué sembrar esta semana aquí (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: cosechas, reservas y «predicciones» inventadas. Ahora, un oráculo HONESTO: el tiempo
// REAL de tu lugar (Open-Meteo, sin clave, la fuente del Clima) —temperatura del suelo a 6 cm,
// mínimas, máximas y lluvia de los próximos 7 días— cruzado con reglas agronómicas generales a
// la vista (umbral de suelo para germinar, helada, calor). Por cultivo: «siembra ahora», «casi»
// o «espera», siempre con el motivo. Orienta; no sustituye el saber de tu huerta. Una petición
// por lugar y hora como mucho (caché compartida). Invariante (§3): el alimento es procomún.
//
//   micro      → el brote con cuántos cultivos puedes sembrar ya.
//   s          → los tres primeros que puedes sembrar.
//   m          → + el suelo de la semana y si hay helada.
//   panorámico → condiciones a la izquierda, cultivos a la derecha.   torre → en columna.
//   l          → pestañas Ahora / Casi / Espera con el motivo de cada cultivo.
//   xl         → + el suelo y las mínimas de los 7 días dibujados y las semanas a cosecha.
// Estados honestos: cargando, error con reintento y vacío (sin ubicación → elegirla en el Clima).
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Sprout, RefreshCw, MapPin, Snowflake, Thermometer, CloudRain } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, type ElementSize } from "../../kit";
import { cn } from "@/lib/utils";
import { useDatoCompartido, type ResultadoDato } from "../gen2/_paquete-b/cache-compartida";
import { cargarSiembra, consejos, resumenSemana, type DiaSiembra, type Veredicto } from "../gen2/_paquete-b/datos-siembra";
import { diaCorto } from "../gen2/_paquete-b/datos-oikos";
import { useLugarB, type LugarB } from "../gen2/_paquete-b/lugar";
import { AccionB, MicroB, PestanasB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "../gen2/_paquete-b/piezas-b";

const FAMILIA = { acento: "#10b981", acento2: "#7c5cff" };
export const COLOR_VEREDICTO: Record<Veredicto, string> = { ahora: "#10b981", casi: "#f59e0b", esperar: "#64748b" };
const ETIQUETA_VEREDICTO: Record<Veredicto, string> = { ahora: "Siembra ahora", casi: "Casi", esperar: "Espera" };
const DEC = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export function FoodOracleWidget() {
    const marco = useMarcoUnificado();
    const lugar = useLugarB();
    const clave = lugar ? `siembra.v1.${lugar.lat.toFixed(2)},${lugar.lon.toFixed(2)}` : null;
    const cargar = useCallback(() => cargarSiembra(lugar!.lat, lugar!.lon), [lugar]);
    const datos = useDatoCompartido<DiaSiembra[]>(clave, cargar, { ttlMs: 60 * 60_000 });
    return (
        <WidgetShell
            title="Soberanía alimentaria"
            subtitle={lugar?.nombre ? `Qué sembrar en ${lugar.nombre}` : "Qué sembrar esta semana"}
            icon={Sprout}
            bare={marco?.base === "micro"}
            actions={lugar ? (
                <button type="button" onClick={datos.recargar} aria-label="Actualizar la siembra"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            ) : undefined}
        >
            {(size) => <Cuerpo size={size} lugar={lugar} datos={datos} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, lugar, datos }: { size: ElementSize; lugar: LugarB | null; datos: ResultadoDato<DiaSiembra[]> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    let contenido: ReactNode;
    if (!lugar) {
        contenido = lienzo.base === "micro"
            ? <a href="/clima" aria-label="Elige tu lugar en el Clima" className={cn(estilosB.foco, "grid h-full place-items-center text-white/70")}><MapPin className="size-6" aria-hidden /></a>
            : <WidgetEmptyState icon={MapPin} title="¿Dónde está tu huerta?" message="Elige tu lugar en el Clima y te digo qué sembrar según el suelo y las heladas de esta semana." actionLabel="Elegir lugar" actionHref="/clima" accent={lienzo.acento} />;
    } else if (!datos.dato) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudo leer el tiempo."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "list"} rows={3} />;
    } else {
        contenido = <Composicion dias={datos.dato} lienzo={lienzo} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ dias, lienzo }: { dias: DiaSiembra[]; lienzo: LienzoB }) {
    const s = useMemo(() => resumenSemana(dias), [dias]);
    const lista = useMemo(() => consejos(s), [s]);
    const [filtro, setFiltro] = useState<Veredicto>("ahora");
    const ya = lista.filter((c) => c.veredicto === "ahora");
    const b = lienzo.base;
    const frase = `Esta semana puedes sembrar ${ya.length} ${ya.length === 1 ? "cultivo" : "cultivos"}${ya.length ? `: ${ya.slice(0, 3).map((c) => c.cultivo.nombre).join(", ")}` : ""}. Suelo a ${s.sueloMedio === null ? "sin dato" : `${DEC.format(s.sueloMedio)} °C`}${s.diaHelada ? `, helada el ${diaCorto(s.diaHelada)}` : ", sin heladas"}.`;

    if (b === "micro") {
        return <MicroB glifo={(l) => <Brote lado={l} lienzo={lienzo} />} cifra={String(ya.length)} rotulo="para sembrar" etiqueta={frase} />;
    }
    const condiciones = (vertical: boolean) => (
        <dl className={cn("grid gap-2", vertical ? "grid-cols-1" : "grid-cols-3")} aria-label="Condiciones de la semana">
            {[
                { icono: Thermometer, k: "Suelo", v: s.sueloMedio === null ? "—" : `${DEC.format(s.sueloMedio)} °C`, c: "#f59e0b" },
                { icono: Snowflake, k: "Helada", v: s.diaHelada ? diaCorto(s.diaHelada) : "no", c: s.diaHelada ? "#38bdf8" : "#10b981" },
                { icono: CloudRain, k: "Lluvia", v: `${DEC.format(s.lluvia)} L/m²`, c: "#38bdf8" },
            ].map((x) => (
                <div key={x.k} className={cn("min-w-0", vertical && "flex items-baseline gap-2")}>
                    <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/55"><x.icono className="size-3" style={{ color: x.c }} aria-hidden />{x.k}</dt>
                    <dd className="text-[16px] font-light tabular-nums text-white">{x.v}</dd>
                </div>
            ))}
        </dl>
    );
    const listaDe = (v: Veredicto | null, max: number, conMotivo: boolean) => {
        const items = v ? lista.filter((c) => c.veredicto === v) : lista;
        if (items.length === 0) return <p className="text-[12px] text-white/55" role="status">{v === "ahora" ? "Esta semana no toca sembrar nada de la lista: el suelo o las heladas no acompañan." : "Nada en este grupo."}</p>;
        return (
            <ul className="flex min-h-0 flex-col gap-0.5" aria-label={v ? ETIQUETA_VEREDICTO[v] : "Cultivos"}>
                {items.slice(0, max).map((c) => (
                    <li key={c.cultivo.nombre} className="flex items-center gap-2 text-[12px]">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: COLOR_VEREDICTO[c.veredicto] }} aria-hidden />
                        <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-white/85">{c.cultivo.nombre}</span>
                            {conMotivo && <span className="block text-[10px] text-white/50 line-clamp-1" title={c.motivo}>{c.motivo} · cosecha en ~{c.cultivo.semanas} sem.</span>}
                        </span>
                        {!conMotivo && <span className="shrink-0 text-[10px]" style={{ color: tintaB(COLOR_VEREDICTO[c.veredicto], 0.3) }}>{ETIQUETA_VEREDICTO[c.veredicto]}</span>}
                    </li>
                ))}
            </ul>
        );
    };
    const nota = <p className="text-[10px] text-white/45">Fuente: Open-Meteo · reglas generales de siembra: ajústalas a tu variedad y a tu microclima.</p>;

    if (b === "s") return <div className="flex h-full min-h-0 flex-col gap-1.5"><RotuloB>Siembra ahora</RotuloB>{listaDe("ahora", 3, false)}</div>;
    if (lienzo.clase === "panoramico") {
        return <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)" }}>{condiciones(true)}{listaDe("ahora", 4, false)}</div>;
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2">{condiciones(false)}{listaDe("ahora", 3, false)}</div>;
    }
    const pestanas = (
        <PestanasB etiqueta="Qué hacer" valor={filtro} onCambio={setFiltro} color={lienzo.acento} tactil={lienzo.tactil}
            opciones={(["ahora", "casi", "esperar"] as Veredicto[]).map((v) => ({ id: v, etiqueta: ETIQUETA_VEREDICTO[v], n: lista.filter((c) => c.veredicto === v).length }))} />
    );
    if (lienzo.clase === "torre" || b === "l") {
        return <div className="flex h-full min-h-0 flex-col gap-2.5">{condiciones(false)}{pestanas}{listaDe(filtro, b === "l" ? 4 : 6, true)}<div className="mt-auto">{nota}</div></div>;
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)" }}>
            <div className="flex min-h-0 flex-col gap-3">
                {condiciones(false)}
                <Semana dias={dias} />
                <div className="mt-auto flex flex-col gap-1.5">
                    <AccionB href="/clima" icono={MapPin} color={lienzo.acento2} tactil={lienzo.tactil}>Cambiar lugar</AccionB>
                    {nota}
                </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2.5 border-l border-white/[0.08] pl-4">
                {pestanas}
                {listaDe(filtro, 8, true)}
            </div>
        </div>
    );
}

/** Suelo (barras ámbar) y mínimas (línea azul, con copos si hiela) de los 7 días. */
function Semana({ dias }: { dias: DiaSiembra[] }) {
    const n = dias.length;
    const valores = dias.flatMap((d) => [d.sueloC ?? d.minC, d.minC]);
    const lo = Math.min(0, ...valores), hi = Math.max(20, ...valores);
    const y = (v: number) => 56 - ((v - lo) / (hi - lo || 1)) * 48;
    const linea = dias.map((d, i) => `${i ? "L" : "M"}${(i * 20 + 10).toFixed(1)} ${y(d.minC).toFixed(1)}`).join(" ");
    return (
        <div className="flex flex-col gap-1">
            <svg viewBox={`0 0 ${n * 20} 64`} className="h-20 w-full" preserveAspectRatio="none" role="img"
                aria-label={`Suelo y mínimas: ${dias.map((d) => `${diaCorto(d.fecha)} suelo ${d.sueloC === null ? "sin dato" : DEC.format(d.sueloC)}°, mínima ${DEC.format(d.minC)}°`).join("; ")}`}>
                {lo < 0 && <line x1={0} x2={n * 20} y1={y(0)} y2={y(0)} stroke="#38bdf8" strokeOpacity={0.35} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
                {dias.map((d, i) => d.sueloC === null ? null : (
                    <rect key={d.fecha} x={i * 20 + 5} y={y(d.sueloC)} width={10} height={Math.max(1, 56 - y(d.sueloC))} rx={3} fill="#f59e0b" opacity={0.7} className={estilosB.entrar} style={{ animationDelay: `${i * 40}ms` }} />
                ))}
                <path d={linea} fill="none" stroke="#7dd3fc" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="grid text-center text-[10px] text-white/55" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
                {dias.map((d, i) => <span key={d.fecha} className={cn(d.minC <= 0 && "text-sky-300")}>{i === 0 ? "hoy" : diaCorto(d.fecha)}</span>)}
            </div>
            <p className="text-[10px] text-white/45"><span className="text-amber-300">■</span> suelo a 6 cm · <span className="text-sky-300">—</span> mínima del aire</p>
        </div>
    );
}

function Brote({ lado, lienzo }: { lado: number; lienzo: LienzoB }) {
    const id = useId().replace(/:/g, "");
    const vivo = lienzo.nivel !== "ligero";
    return (
        <svg width={lado} height={lado} viewBox="0 0 40 40" aria-hidden className="overflow-visible">
            <defs>
                <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={tintaB(lienzo.acento, 0.5)} />
                    <stop offset="100%" stopColor={lienzo.acento} />
                </linearGradient>
            </defs>
            <ellipse cx={20} cy={35} rx={13} ry={3} fill="#7c2d12" opacity={0.55} />
            <path d="M20 34 C20 26 20 22 20 17" stroke={lienzo.acento} strokeWidth={1.8} fill="none" strokeLinecap="round" />
            <g className={vivo ? estilosB.latido : undefined} style={{ transformOrigin: "20px 20px" }}>
                <path d="M20 20 C12 20 8 14 9 8 C15 8 20 12 20 20Z" fill={`url(#h${id})`} />
                <path d="M20 17 C26 17 31 12 31 6 C25 6 20 10 20 17Z" fill={`url(#h${id})`} opacity={0.85} />
            </g>
        </svg>
    );
}

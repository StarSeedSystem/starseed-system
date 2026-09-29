'use client';

// ════════════════════════════════════════════════════════════════
// SpaceWeatherWidget — CLIMA ESPACIAL (SPACE_WEATHER) · Ola 0929 · paquete A
// ----------------------------------------------------------------
// El panel del cielo de arriba, con datos REALES de NOAA SWPC y GOES:
// escalas R/S/G de ahora y de los próximos 3 días, índice Kp (minuto,
// bloques de 3 h y previsión), viento solar y su puerta Bz, rayos X y
// llamaradas de 7 días y, con ubicación, el óvalo OVATION con la
// probabilidad de aurora sobre tu cielo. Todo empieza por un TITULAR en
// claro («Tranquilo…», «Tormenta G2: auroras hacia 55°…»).
//
// Diseño por tamaño (clase del marco unificado):
//   micro → punto de severidad + Kp · s → titular + R/S/G
//   m → titular + escalas + Kp, viento y rayos X
//   l → pestañas Resumen · Viento · Radiación · Aurora
//   xl → panel completo · panorámico → titular | escalas | Kp · torre → en columna.
//
// Estados honestos: cargando (esperando a NOAA), error de la fuente con
// reintento, y vacío si NOAA responde sin ninguna lectura para este
// momento. Cada cifra lleva su fuente y su hora. Una petición compartida
// por fuente para todos los widgets, cada ≥ 15 min y solo si se ve.
//
// Se conservan los ayudantes de honestidad (`hayLectura`, `numeroDe`,
// `lecturaDe`, `lecturasDisponibles`, `SelloHora`) que usa la vista app.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Activity, Clock, Satellite, Sparkles, Wind, Zap, type LucideIcon } from "lucide-react";
import type { SpaceMetric, SpaceWeatherSnapshot } from "../../apps/data-sources/space-weather-sources";
import { fuenteAurora, fuenteEscalas, fuenteKp, fuentePlasma, fuenteSol, fuenteVientoResumen, resumirKp } from "@/modules/weather/datos/noaa";
import {
    claseRayos, COLOR_SEVERIDAD, escalaG, escalaR, explicarKp, explicarLlamarada, explicarViento, latitudGeomagnetica, lineaAuroraKp,
    nombreG, severidadViento, titularCosmos, type Severidad,
} from "@/modules/weather/datos/interpretar";
import { formateadores, useFuente, useUbicacionClima } from "@/modules/weather/datos/hooks";
import { CargandoClima, ErrorClima, MarcoClima, SelloFuente, estilosClima as s, type InfoMarco } from "@/modules/weather/components/widgets/_clima/piezas";
import {
    BarrasKp, COLOR_CLASE, colorKp, FlujoViento, GraficaRayos, LineaLlamaradas, MedidorKp, OvaloAurora, PildoraSeveridad,
} from "@/modules/weather/components/widgets/_cosmos/piezas-cosmos";
import { CabeceraCosmos } from "@/modules/weather/components/widgets/_cosmos/marco-cosmos";

// ── Honestidad de la lectura ─────────────────────────────────────
// Una cifra sin hora no es una medida. Cada magnitud visible lleva su
// unidad y el momento de su lectura, y se marca «antigua» si supera la
// hora. Donde la fuente no dio lectura NO se pinta ningún número
// plausible: se cae al hueco honesto o al vacío del contrato.
const SIN_LECTURA = "—";
const ANTIGUA_MS = 3_600_000; // una hora

/** ¿La fuente entregó una lectura real para esta magnitud? */
export function hayLectura(m: SpaceMetric): boolean {
    const v = typeof m.value === "string" ? m.value.trim() : "";
    return v !== "" && v !== SIN_LECTURA;
}

/** Número crudo utilizable (gauges y series), o null si no hay lectura. */
export function numeroDe(m: SpaceMetric): number | null {
    return typeof m.raw === "number" && Number.isFinite(m.raw) ? m.raw : null;
}

/** Marca de NOAA ("2026-09-09 21:00:00.000", UTC implícito) → milisegundos. */
function msDeMarca(marca?: string): number | null {
    if (!marca) return null;
    const iso = marca.trim().replace(" ", "T");
    const conZona = /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
    const ms = Date.parse(conZona);
    return Number.isFinite(ms) ? ms : null;
}

/** Hora de una lectura: la que declara la fuente o, si no la declara, la de consulta. */
export interface Lectura {
    /** Texto listo para pintar ("Medida 21:00 UTC" / "Consultada 23:14"). */
    etiqueta: string;
    /** La lectura tiene más de una hora: se enseña como antigua, no como de ahora. */
    antigua: boolean;
}

export function lecturaDe(marca: string | undefined, consultadoEn: number): Lectura {
    const ms = msDeMarca(marca);
    const base = ms ?? consultadoEn;
    const opciones: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
    if (ms !== null) opciones.timeZone = "UTC";
    const hora = new Intl.DateTimeFormat("es-ES", opciones).format(new Date(base));
    return {
        etiqueta: ms !== null ? `Medida ${hora} UTC` : `Consultada ${hora}`,
        antigua: Date.now() - base > ANTIGUA_MS,
    };
}

/** Todas las magnitudes del snapshot que traen lectura real (0 ⇒ estado vacío). */
export function lecturasDisponibles(snap: SpaceWeatherSnapshot): SpaceMetric[] {
    return [
        snap.geomagnetic.kp, snap.geomagnetic.gScale,
        snap.solarWind.speed, snap.solarWind.density, snap.solarWind.temperature, snap.solarWind.bt, snap.solarWind.bz,
        snap.radiation.flare, snap.radiation.rScale, snap.radiation.sScale, snap.radiation.protonFlux,
        snap.indices.f107, snap.indices.sunspots, snap.aurora,
    ].filter(hayLectura);
}

/**
 * Sello de hora de una magnitud: nunca se enseña un dato sin fecha.
 * Se exporta para que la vista app del mismo clima espacial use ESTE
 * contrato de honestidad y no invente otro.
 */
export function SelloHora({ lectura, className }: { lectura: Lectura; className?: string }) {
    return (
        <span
            title={lectura.antigua ? "Lectura de hace más de una hora: puede no reflejar el momento actual." : undefined}
            className={`inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums ${lectura.antigua ? "text-amber-300/85" : "text-white/45"} ${className ?? ""}`}
        >
            <Clock className="size-2.5 shrink-0" aria-hidden />
            <span className="truncate">{lectura.etiqueta}{lectura.antigua ? " · antigua" : ""}</span>
        </span>
    );
}

// ── Piezas del panel ─────────────────────────────────────────────

const NOMBRE_ESCALA = { R: "Radio", S: "Radiación", G: "Geomagnética" } as const;
const sevDeEscala = (n: number | null): Severidad => (n === null ? "calma" : n >= 4 ? "extrema" : n === 3 ? "fuerte" : n === 2 ? "moderada" : n === 1 ? "menor" : "calma");

/** Una escala NOAA (R/S/G) con su nivel de ahora y, si lo hay, el máximo de 24 h. */
function Escala({ letra, nivel, max24, compacta }: { letra: "R" | "S" | "G"; nivel: number | null; max24?: number | null; compacta?: boolean }) {
    const color = COLOR_SEVERIDAD[sevDeEscala(nivel)];
    return (
        <div className="min-w-0 rounded-xl px-2 py-1.5 text-center" style={{ background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}44` }}
            title={`${NOMBRE_ESCALA[letra]}: ${letra}${nivel ?? "—"}${max24 ? ` (máximo de 24 h: ${letra}${max24})` : ""}`}
            aria-label={`Escala ${NOMBRE_ESCALA[letra].toLowerCase()} ${letra}${nivel ?? " sin dato"}`}>
            <span className={`${s.cifra} block font-semibold leading-none ${compacta ? "text-[16px]" : "text-[20px]"}`} style={{ color }}>{letra}{nivel ?? "—"}</span>
            {!compacta && <span className="mt-0.5 block truncate text-[10px] text-white/55">{NOMBRE_ESCALA[letra]}</span>}
        </div>
    );
}

function Dato({ t, v, u, color }: { t: string; v: string; u?: string; color?: string }) {
    return (
        <div className="min-w-0 rounded-xl bg-white/[0.05] px-2.5 py-1.5" title={`${t}: ${v}${u ? ` ${u}` : ""}`}>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">{t}</span>
            <span className={`${s.cifra} block truncate text-[16px] font-semibold`} style={{ color }}>{v}{u && <span className="ml-1 text-[11px] font-normal text-white/55">{u}</span>}</span>
        </div>
    );
}

type Pestana = "resumen" | "viento" | "radiacion" | "aurora";
const PESTANAS: { id: Pestana; etiqueta: string; icono: LucideIcon }[] = [
    { id: "resumen", etiqueta: "Resumen", icono: Activity },
    { id: "viento", etiqueta: "Viento", icono: Wind },
    { id: "radiacion", etiqueta: "Radiación", icono: Zap },
    { id: "aurora", etiqueta: "Aurora", icono: Sparkles },
];

// ── Contenido ────────────────────────────────────────────────────

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const grande = base === "l" || base === "xl" || clase === "torre";
    const escalas = useFuente(fuenteEscalas, undefined, info.visible);
    const kp = useFuente(fuenteKp, undefined, info.visible);
    const viento = useFuente(fuenteVientoResumen, undefined, info.visible && base !== "micro");
    const sol = useFuente(fuenteSol, undefined, info.visible && base !== "micro" && base !== "s");
    const plasma = useFuente(fuentePlasma, undefined, info.visible && base === "xl");
    const { ubicacion } = useUbicacionClima();
    const conAurora = grande && !!ubicacion;
    const aurora = useFuente(fuenteAurora, conAurora && ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null, info.visible && conAurora);
    const [pestana, setPestana] = React.useState<Pestana>("resumen");
    const fmt = React.useMemo(() => formateadores(), []);
    const dia = React.useCallback((t: number) => new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(new Date(t)).replace(".", ""), []);
    const id = React.useId().replace(/:/g, "");

    // Estados: cargando → leyendo; error → fuente caída con reintento; vacío → sin ninguna lectura.
    const principales = [escalas, kp];
    if (principales.every((f) => !f.datos)) {
        const err = principales.find((f) => f.error)?.error;
        if (err && principales.every((f) => f.error || f.datos)) {
            return <ErrorClima mensaje={`NOAA SWPC: ${err.toLowerCase()}`} onReintentar={() => { escalas.refrescar(); kp.refrescar(); }} />;
        }
        return <CargandoClima base={base} texto="Escuchando al Sol…" />;
    }

    const ahora = Date.now();
    const rk = kp.datos ? resumirKp(kp.datos, ahora) : null;
    const kpAhora = rk?.actual?.kp ?? null;
    const e = escalas.datos?.actual ?? { r: null, s: null, g: null };
    const ult24 = escalas.datos?.ultimas24 ?? null;
    const rayo = sol.datos?.rayos[sol.datos.rayos.length - 1] ?? null;
    const cl = claseRayos(rayo?.flujo ?? null);
    const v = viento.datos;
    const titular = titularCosmos({ g: e.g, r: e.r ?? (rayo ? escalaR(rayo.flujo) : null), s: e.s, kp: kpAhora, claseRayos: cl?.etiqueta ?? null, maxPrevistoKp: rk?.maxPrevisto?.kp ?? null });
    const sinLecturas = kpAhora === null && e.g === null && e.r === null && e.s === null;
    if (sinLecturas) {
        return (
            <div role="status" className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
                <Satellite aria-hidden className="size-5 text-white/60" />
                <p className="text-[12px] text-white/75">NOAA respondió vacío: sin lecturas para este momento.</p>
            </div>
        );
    }
    const refrescar = () => { escalas.refrescar(); kp.refrescar(); viento.refrescar(); sol.refrescar(); plasma.refrescar(); aurora.refrescar(); };
    const cabecera = <CabeceraCosmos info={info} titulo="Clima espacial" subtitulo="NOAA SWPC · en vivo" icono={Satellite} alActualizar={refrescar} conUbicacion={grande} />;
    const colorTit = COLOR_SEVERIDAD[titular.severidad];
    const titularEl = (tam = 13) => (
        <p className="flex items-start gap-2 leading-snug" style={{ fontSize: tam }}>
            <span aria-hidden className="mt-[0.35em] size-2 shrink-0 rounded-full" style={{ background: colorTit, boxShadow: `0 0 10px ${colorTit}` }} />
            <span>{titular.texto}</span>
        </p>
    );
    const escalasEl = (compacta = false) => (
        <div className="grid grid-cols-3 gap-2" aria-label="Escalas de NOAA ahora">
            <Escala letra="R" nivel={e.r} max24={ult24?.r} compacta={compacta} />
            <Escala letra="S" nivel={e.s} max24={ult24?.s} compacta={compacta} />
            <Escala letra="G" nivel={e.g ?? escalaG(kpAhora)} max24={ult24?.g} compacta={compacta} />
        </div>
    );
    const datos = (
        <div className="grid grid-cols-3 gap-2">
            <Dato t="Kp" v={kpAhora === null ? "—" : kpAhora.toFixed(1).replace(".", ",")} color={kpAhora === null ? undefined : colorKp(kpAhora)} />
            <Dato t="Viento" v={v?.velocidad == null ? "—" : String(Math.round(v.velocidad))} u="km/s" color={COLOR_SEVERIDAD[severidadViento(v?.velocidad ?? null)]} />
            <Dato t="Rayos X" v={cl?.etiqueta ?? "—"} color={cl ? COLOR_CLASE[cl.letra] : undefined} />
        </div>
    );
    const sello = (
        <div className="flex flex-wrap gap-x-3">
            <SelloFuente fuente="NOAA SWPC" en={escalas.en ?? kp.en} />
            {aurora.en && <SelloFuente fuente="OVATION" en={aurora.en} />}
        </div>
    );
    const glat = ubicacion ? latitudGeomagnetica(ubicacion.lat, ubicacion.lon) : null;
    const auroraEl = (lado: number) => ubicacion ? (
        <div className="flex items-center gap-3">
            {aurora.datos ? <OvaloAurora aurora={aurora.datos} lat={ubicacion.lat} lon={ubicacion.lon} lado={lado} /> : <div className="grid shrink-0 place-items-center text-[11px] text-white/55" style={{ width: lado, height: lado }}>{aurora.error ? "OVATION sin datos" : "Leyendo OVATION…"}</div>}
            <div className="min-w-0 flex-1 space-y-1 text-[12px]">
                <p className="font-semibold">Aurora sobre {ubicacion.nombre}</p>
                {aurora.datos && <p className="text-white/75">Encima: <b className={s.cifra}>{aurora.datos.sobreTi ?? 0} %</b> · horizonte: <b className={s.cifra}>{aurora.datos.horizonte ?? 0} %</b></p>}
                {glat !== null && kpAhora !== null && <p className="text-white/55">Con Kp {kpAhora.toFixed(1).replace(".", ",")} llega hasta ~{Math.round(lineaAuroraKp(kpAhora))}° magnéticos; tú, {Math.round(Math.abs(glat))}°.</p>}
            </div>
        </div>
    ) : <p className="text-[12px] text-white/60">Elige tu ubicación en el menú para ver la aurora sobre tu cielo.</p>;
    const previsionDias = escalas.datos?.dias.length ? (
        <ul className="grid grid-cols-3 gap-2" aria-label="Previsión de 3 días">
            {escalas.datos.dias.map((d, i) => (
                <li key={d.fecha || i} className="rounded-xl bg-white/[0.05] px-2 py-1.5 text-center text-[11px]">
                    <span className="block capitalize text-white/60">{i === 0 ? "Hoy" : d.fecha ? dia(Date.parse(`${d.fecha}T12:00:00Z`)) : "—"}</span>
                    <span className="block" style={{ color: COLOR_SEVERIDAD[sevDeEscala(d.g)] }}>G{d.g ?? 0}</span>
                    <span className="block text-white/55">R1-2 {d.probRMenor ?? "—"} %</span>
                </li>
            ))}
        </ul>
    ) : null;

    if (base === "micro") {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1" role="img" aria-label={`Clima espacial: ${titular.texto}. Kp ${kpAhora ?? "sin dato"}`}>
                <span aria-hidden className="size-3 rounded-full" style={{ background: colorTit, boxShadow: `0 0 12px ${colorTit}` }} />
                <span className={`${s.cifra} text-[20px] font-light leading-none`} style={{ color: kpAhora === null ? undefined : colorKp(kpAhora) }}>Kp {kpAhora === null ? "—" : kpAhora.toFixed(0)}</span>
            </div>
        );
    }
    if (base === "s") {
        return (
            <div className="flex h-full flex-col justify-between gap-2 p-3">
                <div className="line-clamp-3">{titularEl(12)}</div>
                {escalasEl(true)}
            </div>
        );
    }
    if (clase === "panoramico") {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: "minmax(12rem,1.1fr) minmax(10rem,0.9fr) minmax(0,1.2fr)" }}>
                <div className="min-w-0 space-y-1.5">{cabecera}<div className="line-clamp-2">{titularEl(12)}</div></div>
                {escalasEl(true)}
                {rk && <BarrasKp pasadas={rk.pasadas.slice(-6)} previstas={rk.previstas.slice(0, 6)} hora={fmt.soloHora} alto={Math.max(36, (info.alto || 130) - 70)} />}
            </div>
        );
    }
    if (clase === "torre") {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera}{titularEl(13)}{escalasEl()}
                <div className="flex justify-center"><MedidorKp kp={kpAhora} lado={Math.min(150, (info.ancho || 160) - 30)} /></div>
                {datos}{auroraEl(96)}
                <div className="mt-auto">{sello}</div>
            </div>
        );
    }
    if (base === "m") {
        return (
            <div className="flex h-full flex-col gap-2.5 p-3.5">
                {cabecera}
                <div className="line-clamp-3">{titularEl(13)}</div>
                {escalasEl()}
                {datos}
            </div>
        );
    }

    // l → pestañas · xl → panel completo
    const resumen = (
        <div className="flex flex-col gap-3">
            {titularEl(14)}
            {escalasEl()}
            <div className="flex items-center gap-3">
                <MedidorKp kp={kpAhora} lado={base === "xl" ? 130 : 104} />
                <p className="min-w-0 flex-1 text-[12px] leading-snug text-white/75">{explicarKp(kpAhora)}</p>
            </div>
            {rk && <BarrasKp pasadas={rk.pasadas} previstas={rk.previstas.slice(0, 8)} hora={fmt.soloHora} alto={base === "xl" ? 70 : 56} />}
            {previsionDias}
        </div>
    );
    const vientoEl = (
        <div className="flex flex-col gap-3">
            <FlujoViento velocidad={v?.velocidad ?? null} densidad={plasma.datos?.actual?.densidad ?? null} bz={v?.bz ?? null} animar={info.animar && info.visible} alto={96} />
            <div className="grid grid-cols-3 gap-2">
                <Dato t="Velocidad" v={v?.velocidad == null ? "—" : String(Math.round(v.velocidad))} u="km/s" color={COLOR_SEVERIDAD[severidadViento(v?.velocidad ?? null)]} />
                <Dato t="Bz" v={v?.bz == null ? "—" : v.bz.toFixed(1).replace(".", ",")} u="nT" color={v?.bz == null ? undefined : v.bz < 0 ? "#fb923c" : "#34d399"} />
                <Dato t="Bt" v={v?.bt == null ? "—" : v.bt.toFixed(1).replace(".", ",")} u="nT" />
            </div>
            <p className="text-[12px] leading-snug text-white/75">{explicarViento(v?.velocidad ?? null, v?.bz ?? null)}</p>
        </div>
    );
    const radiacion = sol.datos ? (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <PildoraSeveridad severidad={cl?.severidad ?? "calma"}>Rayos X {cl?.etiqueta ?? "—"}</PildoraSeveridad>
                <PildoraSeveridad severidad={sevDeEscala(e.s)}>Protones S{e.s ?? "—"}</PildoraSeveridad>
            </div>
            <p className="text-[12px] leading-snug text-white/75">{explicarLlamarada(cl?.letra ?? null)}</p>
            <GraficaRayos serie={sol.datos.rayos} llamaradas={sol.datos.llamaradas} hora={fmt.hora} alto={base === "xl" ? 100 : 84} id={id} />
            <LineaLlamaradas llamaradas={sol.datos.llamaradas} ahora={ahora} dia={dia} />
        </div>
    ) : sol.error ? <ErrorClima mensaje="GOES no respondió" onReintentar={sol.refrescar} /> : <CargandoClima base={base} texto="Mirando el Sol en rayos X…" />;

    if (base === "xl") {
        return (
            <div className="grid h-full gap-4 p-5" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gridTemplateRows: "auto minmax(0,1fr) auto" }}>
                <div className="col-span-2">{cabecera}</div>
                <div className="min-h-0 space-y-3 overflow-hidden">{resumen}</div>
                <div className="min-h-0 space-y-4 overflow-hidden">{vientoEl}{radiacion}{auroraEl(96)}</div>
                <div className="col-span-2">{sello}</div>
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {cabecera}
            <div role="tablist" aria-label="Paneles del clima espacial" className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.05] p-1">
                {PESTANAS.map((p) => (
                    <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} onClick={() => setPestana(p.id)}
                        className={`${s.foco} ss-redondo flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-xl px-1.5 text-[12px] font-semibold transition-colors duration-150 ${info.tactil ? "min-h-11" : "min-h-8"} ${pestana === p.id ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
                        <p.icono aria-hidden className="size-3.5 shrink-0" />
                        <span className="truncate">{p.etiqueta}</span>
                    </button>
                ))}
            </div>
            <div role="tabpanel" className="min-h-0 flex-1 overflow-hidden">
                {pestana === "resumen" && resumen}
                {pestana === "viento" && vientoEl}
                {pestana === "radiacion" && radiacion}
                {pestana === "aurora" && <div className="space-y-3">{auroraEl(120)}{rk?.maxPrevisto && <p className="text-[12px] text-white/70">Máximo previsto: Kp {rk.maxPrevisto.kp.toFixed(1).replace(".", ",")} ({nombreG(escalaG(rk.maxPrevisto.kp))}) {dia(rk.maxPrevisto.t)} {fmt.hora(rk.maxPrevisto.t)}.</p>}</div>}
            </div>
            {sello}
        </div>
    );
}

export function SpaceWeatherWidget() {
    return (
        <MarcoClima etiqueta="Clima espacial" acento="#F5A623" acento2="#8b5cf6">
            {(info) => <Contenido info={info} />}
        </MarcoClima>
    );
}

export default SpaceWeatherWidget;

'use client';

// ════════════════════════════════════════════════════════════════
// OfficialDataWidget — Datos oficiales (OFFICIAL_DATA) · Ola 0929 · paquete A
// ----------------------------------------------------------------
// El pulso del planeta en cuatro fuentes públicas y sin clave, cada una
// con su diseño y su procedencia a la vista:
//   • El tiempo de TU sitio (Open-Meteo; antes era siempre Madrid).
//   • El clima espacial (NOAA SWPC: Kp y escalas R/S/G).
//   • Los sismos de magnitud 4,5+ de las últimas 24 h (USGS), con el más
//     fuerte y el más cercano a ti.
//   • Las últimas noticias del espacio (Spaceflight News API).
// Cada fuente se pide una vez para todo el tablero, se guarda ≥ 15 min y
// solo se pide si el widget se ve (antes, sismos cada 2 minutos).
//
// Diseño por tamaño: micro → la cifra de la fuente elegida · s → cifra +
// detalle y selector en lista · m → la fuente elegida en detalle · l →
// pestañas · xl → las cuatro a la vez · panorámico → cuatro columnas ·
// torre → cuatro filas. La fuente elegida se recuerda en este navegador.
// Estados honestos por fuente: cargando, vacío (la fuente respondió sin
// datos) y error con reintento.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, CloudSun, ExternalLink, Newspaper, Orbit, Waves, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fuentePronostico } from "@/modules/weather/datos/open-meteo";
import { fuenteEscalas, fuenteKp, resumirKp } from "@/modules/weather/datos/noaa";
import { colorMagnitud, distanciaKm, fuenteNoticiasEspacio, fuenteSismos, type Sismo } from "@/modules/weather/datos/planeta";
import { COLOR_SEVERIDAD, nombreG, escalaG, severidadKp, textoCielo } from "@/modules/weather/datos/interpretar";
import { useFuente, useUbicacionClima, useUnidades, type EstadoFuente } from "@/modules/weather/datos/hooks";
import { iconoCielo, colorIcono } from "@/modules/weather/components/widgets/_clima/cielo";
import { grados, velocidad } from "@/modules/weather/components/widgets/_clima/graficas";
import { CargandoClima, ErrorClima, MarcoClima, MenuClima, RotuloClima, SelloFuente, estilosClima as s, type InfoMarco } from "@/modules/weather/components/widgets/_clima/piezas";
import { colorKp } from "@/modules/weather/components/widgets/_cosmos/piezas-cosmos";

type IdFuente = "tiempo" | "espacio" | "sismos" | "noticias";
const FUENTES: { id: IdFuente; etiqueta: string; pista: string; icono: LucideIcon; color: string; origen: string; ruta?: string }[] = [
    { id: "tiempo", etiqueta: "Tiempo", pista: "Open-Meteo · tu ubicación", icono: CloudSun, color: "#38bdf8", origen: "Open-Meteo", ruta: "/clima" },
    { id: "espacio", etiqueta: "Espacio", pista: "NOAA SWPC · Kp y escalas", icono: Orbit, color: "#a78bfa", origen: "NOAA SWPC", ruta: "/atmosphere" },
    { id: "sismos", etiqueta: "Sismos", pista: "USGS · magnitud 4,5+ en 24 h", icono: Waves, color: "#fb923c", origen: "USGS" },
    { id: "noticias", etiqueta: "Noticias", pista: "Spaceflight News · lo último", icono: Newspaper, color: "#f472b6", origen: "Spaceflight News" },
];
const CLAVE = "starseed.datos-oficiales.fuente.v1";

function haceTexto(t: number, ahora: number): string {
    const min = Math.max(0, Math.round((ahora - t) / 60_000));
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

/** Espera honesta de una fuente: cargando, o su error con reintento. */
function espera<T>(f: EstadoFuente<T>, base: InfoMarco["base"]): React.ReactNode | null {
    if (f.datos) return null;
    if (f.error) return <ErrorClima mensaje={f.error} onReintentar={f.refrescar} />;
    return <CargandoClima base={base} texto="Consultando la fuente…" />;
}

// ── Una vista por fuente ─────────────────────────────────────────

function VistaTiempo({ info, compacta }: { info: InfoMarco; compacta: boolean }) {
    const { ubicacion } = useUbicacionClima();
    const coords = React.useMemo(() => (ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null), [ubicacion?.lat, ubicacion?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
    const f = useFuente(fuentePronostico, coords, info.visible);
    const [u] = useUnidades();
    if (!ubicacion) return <p role="status" className="text-[12px] text-white/65">Sin ubicación: elige una en el widget del tiempo.</p>;
    const e = espera(f, info.base);
    if (e) return <>{e}</>;
    const a = f.datos!.actual;
    const Icono = iconoCielo(a.codigo, a.esDia);
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
                <Icono aria-hidden className="size-6 shrink-0" style={{ color: colorIcono(a.codigo, a.esDia) }} />
                <span className={`${s.cifra} text-[30px] font-extralight leading-tight`}>{grados(a.temp, u)}</span>
                <span className="min-w-0 truncate text-[12px] text-white/75" title={textoCielo(a.codigo, a.esDia)}>{textoCielo(a.codigo, a.esDia)}</span>
            </div>
            <p className="truncate text-[11px] text-white/60" title={ubicacion.nombre}>{ubicacion.nombre}</p>
            {!compacta && (
                <dl className="grid grid-cols-3 gap-2 text-[12px]">
                    <div><dt className="text-[10px] uppercase tracking-[0.12em] text-white/45">Viento</dt><dd className={s.cifra}>{velocidad(a.viento, u)}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-[0.12em] text-white/45">Humedad</dt><dd className={s.cifra}>{a.humedad === null ? "—" : `${Math.round(a.humedad)} %`}</dd></div>
                    <div><dt className="text-[10px] uppercase tracking-[0.12em] text-white/45">UV</dt><dd className={s.cifra}>{a.uv === null ? "—" : Math.round(a.uv)}</dd></div>
                </dl>
            )}
            <SelloFuente fuente="Open-Meteo" en={f.en} />
        </div>
    );
}

function VistaEspacio({ info, compacta }: { info: InfoMarco; compacta: boolean }) {
    const kp = useFuente(fuenteKp, undefined, info.visible);
    const esc = useFuente(fuenteEscalas, undefined, info.visible && !compacta);
    const e = espera(kp, info.base);
    if (e) return <>{e}</>;
    const r = resumirKp(kp.datos!, Date.now());
    const v = r.actual?.kp ?? null;
    const g = escalaG(v);
    const a = esc.datos?.actual;
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">Kp</span>
                <span className={`${s.cifra} text-[30px] font-extralight leading-tight`} style={{ color: v === null ? undefined : colorKp(v) }}>{v === null ? "—" : v.toFixed(1).replace(".", ",")}</span>
                <span className="truncate text-[12px]" style={{ color: COLOR_SEVERIDAD[severidadKp(v)] }}>{nombreG(g)}</span>
            </div>
            {!compacta && a && (
                <p className={`${s.cifra} text-[12px] text-white/75`}>Radio R{a.r ?? "—"} · Radiación S{a.s ?? "—"} · Geomagnética G{a.g ?? "—"}</p>
            )}
            {r.maxPrevisto && <p className="truncate text-[11px] text-white/60">Máximo previsto (3 días): Kp {r.maxPrevisto.kp.toFixed(1).replace(".", ",")}</p>}
            <SelloFuente fuente="NOAA SWPC" en={kp.en} />
        </div>
    );
}

function VistaSismos({ info, compacta, n }: { info: InfoMarco; compacta: boolean; n: number }) {
    const f = useFuente(fuenteSismos, undefined, info.visible);
    const { ubicacion } = useUbicacionClima();
    const e = espera(f, info.base);
    if (e) return <>{e}</>;
    const lista = f.datos!;
    const ahora = Date.now();
    if (!lista.length) {
        // vacío: la fuente respondió sin sismos (buena noticia, no un fallo).
        return <p role="status" className="text-[12px] text-white/70">Sin sismos de magnitud 4,5 o más en las últimas 24 h.</p>;
    }
    const mayor = lista.reduce((m, x) => (x.magnitud > m.magnitud ? x : m), lista[0]);
    const conDist = ubicacion ? lista.map((x) => ({ x, d: distanciaKm(ubicacion.lat, ubicacion.lon, x.lat, x.lon) })).sort((a, b) => a.d - b.d) : [];
    const cercano = conDist[0] ?? null;
    const fila = (x: Sismo, extra?: string) => (
        <li key={x.id} className="flex min-w-0 items-center gap-2 text-[12px]">
            <span className={`${s.cifra} w-9 shrink-0 rounded-md px-1 text-center font-semibold`} style={{ background: `${colorMagnitud(x.magnitud)}26`, color: colorMagnitud(x.magnitud) }}>{x.magnitud.toFixed(1).replace(".", ",")}</span>
            {x.url ? (
                <a href={x.url} target="_blank" rel="noopener noreferrer" className={`${s.foco} min-w-0 flex-1 cursor-pointer truncate hover:underline`} title={x.lugar}>{x.lugar}</a>
            ) : <span className="min-w-0 flex-1 truncate" title={x.lugar}>{x.lugar}</span>}
            <span className="shrink-0 text-[10px] text-white/50">{extra ?? haceTexto(x.t, ahora)}</span>
        </li>
    );
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
                <span className={`${s.cifra} text-[30px] font-extralight leading-tight`}>{lista.length}</span>
                <span className="text-[12px] text-white/70">sismos 4,5+ en 24 h</span>
            </div>
            <ul className="flex flex-col gap-1" aria-label="Sismos destacados">
                {fila(mayor, "el más fuerte")}
                {cercano && cercano.x.id !== mayor.id && fila(cercano.x, `a ${Math.round(cercano.d).toLocaleString("es-ES")} km`)}
                {!compacta && lista.filter((x) => x.id !== mayor.id && x.id !== cercano?.x.id).slice(0, Math.max(0, n - 2)).map((x) => fila(x))}
            </ul>
            {lista.some((x) => x.tsunami) && <p role="note" className="text-[11px] text-rose-200">USGS marca aviso de tsunami en al menos uno.</p>}
            <SelloFuente fuente="USGS" en={f.en} />
        </div>
    );
}

function VistaNoticias({ info, n }: { info: InfoMarco; n: number }) {
    const f = useFuente(fuenteNoticiasEspacio, undefined, info.visible);
    const e = espera(f, info.base);
    if (e) return <>{e}</>;
    const lista = f.datos!;
    if (!lista.length) return <p role="status" className="text-[12px] text-white/70">La fuente no trae noticias ahora mismo (vacío).</p>;
    const ahora = Date.now();
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <ul className="flex flex-col gap-1.5" aria-label="Noticias del espacio">
                {lista.slice(0, n).map((x) => (
                    <li key={x.id} className="min-w-0">
                        <a href={x.url} target="_blank" rel="noopener noreferrer" className={`${s.foco} group flex cursor-pointer items-start gap-1.5 text-[12px] leading-snug`} title={x.titulo}>
                            <span className="line-clamp-2 min-w-0 flex-1 group-hover:underline">{x.titulo}</span>
                            <ExternalLink aria-hidden className="mt-0.5 size-3 shrink-0 opacity-50" />
                        </a>
                        <span className="text-[10px] text-white/50">{x.medio} · {haceTexto(x.t, ahora)}</span>
                    </li>
                ))}
            </ul>
            <SelloFuente fuente="Spaceflight News" en={f.en} />
        </div>
    );
}

function Vista({ id, info, compacta, n }: { id: IdFuente; info: InfoMarco; compacta: boolean; n: number }) {
    if (id === "tiempo") return <VistaTiempo info={info} compacta={compacta} />;
    if (id === "espacio") return <VistaEspacio info={info} compacta={compacta} />;
    if (id === "sismos") return <VistaSismos info={info} compacta={compacta} n={n} />;
    return <VistaNoticias info={info} n={n} />;
}

/** micro: la cifra de la fuente elegida, sin más. */
function CifraMicro({ id, info }: { id: IdFuente; info: InfoMarco }) {
    const { ubicacion } = useUbicacionClima();
    const coords = React.useMemo(() => (ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null), [ubicacion?.lat, ubicacion?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
    const tiempo = useFuente(fuentePronostico, id === "tiempo" ? coords : null, info.visible && id === "tiempo");
    const kp = useFuente(fuenteKp, undefined, info.visible && id === "espacio");
    const sismos = useFuente(fuenteSismos, undefined, info.visible && id === "sismos");
    const noticias = useFuente(fuenteNoticiasEspacio, undefined, info.visible && id === "noticias");
    const [u] = useUnidades();
    const f = FUENTES.find((x) => x.id === id)!;
    const kpV = kp.datos ? resumirKp(kp.datos, Date.now()).actual?.kp ?? null : null;
    const cifra = id === "tiempo" ? (tiempo.datos ? grados(tiempo.datos.actual.temp, u) : "…")
        : id === "espacio" ? (kpV === null ? "…" : `Kp ${kpV.toFixed(0)}`)
        : id === "sismos" ? (sismos.datos ? String(sismos.datos.length) : "…")
        : noticias.datos ? String(noticias.datos.length) : "…";
    return (
        <div className="flex h-full flex-col items-center justify-center gap-0.5 p-1 text-center" role="img" aria-label={`${f.etiqueta}: ${cifra}`}>
            <f.icono aria-hidden className="size-4" style={{ color: f.color }} />
            <span className={`${s.cifra} text-[20px] font-light leading-none`}>{cifra}</span>
            <span className="text-[9px] uppercase tracking-widest text-white/55">{f.etiqueta}</span>
        </div>
    );
}

// ── Selector de fuente (lista vertical con nombre completo) ──────

function SelectorFuente({ valor, cambiar, info }: { valor: IdFuente; cambiar: (id: IdFuente) => void; info: InfoMarco }) {
    const [abierto, setAbierto] = React.useState(false);
    const actual = FUENTES.find((f) => f.id === valor)!;
    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button type="button" aria-label={`Fuente: ${actual.etiqueta}. Cambiar de fuente`}
                    className={`${s.foco} ss-redondo inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-transform duration-200 hover:scale-[1.03] ${info.tactil ? "min-h-11" : "min-h-8"}`}
                    style={{ background: `${actual.color}22`, boxShadow: `inset 0 0 0 1px ${actual.color}55` }}>
                    <actual.icono aria-hidden className="size-3.5 shrink-0" style={{ color: actual.color }} />
                    <span className="truncate">{actual.etiqueta}</span>
                    <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 rounded-2xl border-white/10 bg-[#0c0f24]/95 p-2 text-white shadow-2xl backdrop-blur-xl">
                <ul role="listbox" aria-label="Fuentes de datos oficiales" className="flex flex-col gap-0.5">
                    {FUENTES.map((f) => (
                        <li key={f.id} role="none">
                            <button type="button" role="option" aria-selected={f.id === valor} onClick={() => { cambiar(f.id); setAbierto(false); }}
                                className={`${s.foco} flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left transition-colors duration-150 hover:bg-white/10 ${info.tactil ? "min-h-12" : "min-h-10"}`}>
                                <f.icono aria-hidden className="size-4 shrink-0" style={{ color: f.color }} />
                                <span className="min-w-0 flex-1"><span className="block text-[13px]">{f.etiqueta}</span><span className="block truncate text-[11px] text-white/50">{f.pista}</span></span>
                                {f.id === valor && <Check aria-hidden className="size-4 text-emerald-300" />}
                            </button>
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

// ── Contenido ────────────────────────────────────────────────────

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const [fuente, setFuente] = React.useState<IdFuente>("tiempo");
    React.useEffect(() => {
        try { const g = window.localStorage.getItem(CLAVE); if (g && FUENTES.some((f) => f.id === g)) setFuente(g as IdFuente); } catch { /* sin almacén */ }
    }, []);
    const cambiar = React.useCallback((id: IdFuente) => {
        setFuente(id);
        try { window.localStorage.setItem(CLAVE, id); } catch { /* sin almacén */ }
    }, []);
    const actual = FUENTES.find((f) => f.id === fuente)!;
    const cabecera = (extra?: React.ReactNode) => (
        <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1"><RotuloClima>Datos oficiales</RotuloClima></div>
            {extra}
            {base !== "micro" && base !== "s" && (
                <MenuClima info={info} conUnidades={fuente === "tiempo"} conUbicacion={fuente === "tiempo" || fuente === "sismos"}
                    ruta={actual.ruta} rutaEtiqueta={actual.id === "tiempo" ? "Abrir el tiempo" : "Abrir el clima espacial"} />
            )}
        </div>
    );
    const tarjeta = (id: IdFuente, compacta: boolean, n: number) => {
        const f = FUENTES.find((x) => x.id === id)!;
        return (
            <section key={id} className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]" aria-label={f.etiqueta}>
                <div className="flex items-center gap-1.5">
                    <f.icono aria-hidden className="size-3.5" style={{ color: f.color }} />
                    <RotuloClima color={f.color}>{f.etiqueta}</RotuloClima>
                    {f.ruta && <Link href={f.ruta} className={`${s.foco} ml-auto cursor-pointer text-[11px] text-white/55 hover:text-white`}>Abrir</Link>}
                </div>
                <Vista id={id} info={info} compacta={compacta} n={n} />
            </section>
        );
    };

    if (base === "micro") return <CifraMicro id={fuente} info={info} />;
    if (clase === "panoramico") {
        const cuatro = (info.ancho || 1000) > 900;
        return (
            <div className="grid h-full gap-3 p-3" style={{ gridTemplateColumns: `repeat(${cuatro ? 4 : 2}, minmax(0,1fr))` }}>
                {(cuatro ? FUENTES : FUENTES.slice(0, 2)).map((f) => tarjeta(f.id, true, 2))}
            </div>
        );
    }
    if (clase === "torre") {
        return (
            <div className="flex h-full flex-col gap-2 p-3">
                {cabecera()}
                {FUENTES.map((f) => tarjeta(f.id, true, 2))}
            </div>
        );
    }
    if (base === "xl") {
        return (
            <div className="flex h-full flex-col gap-3 p-4">
                {cabecera()}
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-3" style={{ gridTemplateRows: "minmax(0,1fr) minmax(0,1fr)" }}>
                    {FUENTES.map((f) => tarjeta(f.id, false, 4))}
                </div>
            </div>
        );
    }
    if (base === "l") {
        return (
            <div className="flex h-full flex-col gap-3 p-4">
                {cabecera()}
                <div role="tablist" aria-label="Fuentes de datos oficiales" className="grid grid-cols-4 gap-1 rounded-2xl bg-white/[0.05] p-1">
                    {FUENTES.map((f) => (
                        <button key={f.id} type="button" role="tab" aria-selected={fuente === f.id} onClick={() => cambiar(f.id)} title={f.pista}
                            className={`${s.foco} ss-redondo flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-xl px-1 text-[12px] font-semibold transition-colors duration-150 ${info.tactil ? "min-h-11" : "min-h-8"} ${fuente === f.id ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}>
                            <f.icono aria-hidden className="size-3.5 shrink-0" style={{ color: f.color }} />
                            <span className="truncate">{f.etiqueta}</span>
                        </button>
                    ))}
                </div>
                <div role="tabpanel" className="min-h-0 flex-1 overflow-hidden"><Vista id={fuente} info={info} compacta={false} n={5} /></div>
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col gap-2 p-3">
            {base === "s" ? <div className="flex min-w-0"><SelectorFuente valor={fuente} cambiar={cambiar} info={info} /></div> : cabecera(<SelectorFuente valor={fuente} cambiar={cambiar} info={info} />)}
            <div className="min-h-0 flex-1 overflow-hidden"><Vista id={fuente} info={info} compacta={base === "s"} n={base === "s" ? 1 : 3} /></div>
        </div>
    );
}

export function OfficialDataWidget() {
    return (
        <MarcoClima etiqueta="Datos oficiales" acento="#38BDF8" acento2="#a78bfa">
            {(info) => <Contenido info={info} />}
        </MarcoClima>
    );
}

export default OfficialDataWidget;

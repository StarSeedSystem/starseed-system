'use client';

// ════════════════════════════════════════════════════════════════
// AbundanceRadarWidget — Radar de Abundancia (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Los nodos de abundancia REALES a pie de tu lugar: fuentes de agua
// potable, bibliotecas y estanterías libres, cajas de compartir y
// bancos de alimentos, estaciones de reparación, huertos comunitarios,
// centros sociales, desfibriladores y aseos gratuitos, según el mapa
// común de OpenStreetMap (una consulta por zona cada 12 h, compartida
// con el Flujo de Tránsito y solo a la vista). El radar los sitúa en su
// rumbo y distancia reales; la lista dice cuánto se tarda a pie y abre
// cada uno en el mapa. Estados honestos: sin ubicación (vacío),
// cargando, error (la fuente no respondió) y zona sin nodos mapeados,
// con la invitación a añadirlos al mapa común.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { BookOpen, Droplets, ExternalLink, Gift, HeartPulse, MapPinned, Radar, Sprout, Toilet, Users, Wrench, type LucideIcon } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { CargandoSilueta, ErrorHonesto, VacioHonesto, tinta } from "./_catalogo/piezas";
import { ALCANCE_M, COMUNES, distanciaTexto, minutosAPie, urlOsm, useEntorno, type SitioCerca, type TipoSitio } from "./_catalogo/entorno";

const META: Partial<Record<TipoSitio, { nombre: string; plural: string; color: string; icono: LucideIcon }>> = {
    agua: { nombre: "Agua potable", plural: "Fuentes de agua", color: "#38bdf8", icono: Droplets },
    libros: { nombre: "Libros libres", plural: "Libros libres", color: "#a78bfa", icono: BookOpen },
    compartir: { nombre: "Compartir", plural: "Para compartir", color: "#f472b6", icono: Gift },
    reparar: { nombre: "Reparar", plural: "Para reparar", color: "#FFBF00", icono: Wrench },
    huerto: { nombre: "Huerto comunitario", plural: "Huertos comunitarios", color: "#10B981", icono: Sprout },
    encuentro: { nombre: "Centro social", plural: "Centros sociales", color: "#22d3ee", icono: Users },
    salud: { nombre: "Desfibrilador", plural: "Desfibriladores", color: "#DC143C", icono: HeartPulse },
    aseo: { nombre: "Aseo gratuito", plural: "Aseos gratuitos", color: "#94a3b8", icono: Toilet },
};
const meta = (t: TipoSitio) => META[t] ?? META.compartir!;

function RadarSvg({ D, sitios, filtro, l, anillos }: { D: number; sitios: SitioCerca[]; filtro: TipoSitio | null; l: EstadoLienzo; anillos?: boolean }) {
    const id = useIdSvg("rad");
    const c = D / 2, R = D * 0.46;
    const pos = (s: SitioCerca) => {
        const r = (Math.min(ALCANCE_M, s.dist) / ALCANCE_M) * R, a = (s.rumbo * Math.PI) / 180;
        return { x: c + Math.sin(a) * r, y: c - Math.cos(a) * r };
    };
    const barrido = `M${c} ${c}L${c} ${c - R}A${R} ${R} 0 0 1 ${c + Math.sin(0.6) * R} ${c - Math.cos(0.6) * R}Z`;
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-f`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={conAlfa(l.acento, 0.2)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento, 0.02)} />
                </radialGradient>
                <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={l.acento} stopOpacity={0} />
                    <stop offset="100%" stopColor={l.acento} stopOpacity={0.35} />
                </linearGradient>
            </defs>
            <circle cx={c} cy={c} r={R} fill={`url(#${id}-f)`} stroke={conAlfa(l.acento, 0.4)} strokeWidth={1} />
            {[0.25, 0.5].map((f) => <circle key={f} cx={c} cy={c} r={R * f} fill="none" stroke="#fff" strokeOpacity={0.1} strokeDasharray="2 3" />)}
            <line x1={c} x2={c} y1={c - R} y2={c + R} stroke="#fff" strokeOpacity={0.06} />
            <line x1={c - R} x2={c + R} y1={c} y2={c} stroke="#fff" strokeOpacity={0.06} />
            {l.animar && <path d={barrido} fill={`url(#${id}-b)`} className="ss-girar" style={{ ["--ss-dur" as string]: "9s", transformOrigin: `${c}px ${c}px` }} />}
            {sitios.slice(0, 80).map((s) => {
                const p = pos(s), m = meta(s.tipo);
                const apagado = filtro !== null && s.tipo !== filtro;
                return <circle key={s.id} cx={p.x} cy={p.y} r={Math.max(2.2, D * 0.022)} fill={m.color} opacity={apagado ? 0.15 : 0.95} />;
            })}
            <circle cx={c} cy={c} r={Math.max(3, D * 0.028)} fill="#fff" />
            <circle cx={c} cy={c} r={Math.max(6, D * 0.055)} fill="none" stroke="#fff" strokeOpacity={0.35} />
            {anillos && (
                <>
                    <text x={c} y={c - R - 4} textAnchor="middle" fill="#fff" opacity={0.5} style={{ fontSize: 10 }}>N</text>
                    <text x={c + R * 0.5 * 0.71 + 3} y={c + R * 0.5 * 0.71 + 10} fill="#fff" opacity={0.4} style={{ fontSize: 9 }}>500 m</text>
                    <text x={c + R * 0.71 + 3} y={c + R * 0.71 + 10} fill="#fff" opacity={0.4} style={{ fontSize: 9 }}>1 km</text>
                </>
            )}
        </svg>
    );
}

export function AbundanceRadarWidget() {
    const l = useLienzo("#10B981", "#38bdf8");
    const ent = useEntorno(l.visible);
    const [filtro, setFiltro] = React.useState<TipoSitio | null>(null);

    const comunes = React.useMemo(() => ent.cerca.filter((s) => COMUNES.includes(s.tipo) && s.dist <= ALCANCE_M), [ent.cerca]);
    const conteo = React.useMemo(() => {
        const c = new Map<TipoSitio, number>();
        for (const s of comunes) c.set(s.tipo, (c.get(s.tipo) ?? 0) + 1);
        return COMUNES.filter((t) => c.get(t)).map((t) => ({ tipo: t, n: c.get(t)! }));
    }, [comunes]);
    const visibles = filtro ? comunes.filter((s) => s.tipo === filtro) : comunes;

    const sinLugar = !ent.lugar;
    const cargando = !sinLugar && !ent.datos && !ent.error;
    const sinDatos = !ent.datos && !!ent.error;
    const lugar = ent.lugar?.nombre || "tu lugar";
    const cercano = comunes[0];
    const mapa = ent.lugar ? `https://www.openstreetmap.org/#map=17/${ent.lugar.lat.toFixed(5)}/${ent.lugar.lon.toFixed(5)}` : "https://www.openstreetmap.org";

    const etiqueta = sinLugar ? "Radar de abundancia: vacío, sin ubicación"
        : cargando ? "Radar de abundancia: cargando el mapa común"
        : sinDatos ? "Radar de abundancia: error, el mapa común no respondió"
        : comunes.length === 0 ? `Radar de abundancia: ningún nodo mapeado a 1 km de ${lugar}`
        : `Radar de abundancia: ${comunes.length} nodo${comunes.length === 1 ? "" : "s"} a 1 km de ${lugar} (${conteo.map((c) => `${c.n} ${meta(c.tipo).nombre.toLowerCase()}`).join(", ")}). El más cercano: ${cercano.nombre ?? meta(cercano.tipo).nombre} a ${distanciaTexto(cercano.dist)}. Datos de OpenStreetMap`;

    const especial = (compacto: boolean) => {
        if (sinLugar) return <VacioHonesto icono={Radar} color={l.acento} compacto={compacto} titulo="Sin ubicación" ayuda="Elige tu lugar en el clima para ver lo común que tienes cerca." />;
        if (cargando) return <CargandoSilueta color={l.acento} etiqueta="Cargando el mapa común…" />;
        if (sinDatos) return <ErrorHonesto error={ent.error} color={l.acento} onReintentar={ent.recargar} compacto={compacto} />;
        return null;
    };

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Radar de Abundancia" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><RadarSvg D={l.lado - 8} sitios={comunes} filtro={null} l={l} /></div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Radar de Abundancia" etiqueta={etiqueta} sinCabecera>
                {especial(true) ?? (
                    <div className="flex h-full flex-col items-center justify-center gap-1" title="Datos © colaboradores de OpenStreetMap">
                        <RadarSvg D={Math.max(70, Math.min(l.ancho - 20, l.alto - 44))} sitios={comunes} filtro={null} l={l} />
                        <span className="max-w-full truncate text-[12px] text-white/80">{comunes.length ? `${comunes.length} a 1 km` : "Nada mapeado"}</span>
                    </div>
                )}
            </Lienzo>
        );
    }

    const hb = Math.max(80, l.alto - 64);
    const esp = especial(false);
    const atribucion = (
        <p className="text-[10.5px] text-white/40">
            Datos © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="cursor-pointer underline-offset-2 hover:text-white/70 hover:underline">OpenStreetMap</a>
        </p>
    );
    if (esp) {
        return (
            <Lienzo l={l} titulo="Radar de Abundancia" subtitulo={l.ancho >= 300 ? "Lo común a pie de ti" : undefined} icono={Radar} etiqueta={etiqueta}>
                <div className="flex h-full flex-col justify-center">{esp}</div>
            </Lienzo>
        );
    }

    const fila = (s: SitioCerca, detalle: boolean) => {
        const m = meta(s.tipo), I = m.icono;
        const nombre = s.nombre ?? m.nombre;
        return (
            <li key={s.id}>
                <a href={urlOsm(s)} target="_blank" rel="noopener noreferrer" title={`${nombre} · ${m.nombre} · ${distanciaTexto(s.dist)}, unos ${minutosAPie(s.dist)} min a pie`}
                    aria-label={`${nombre}, ${m.nombre.toLowerCase()} a ${distanciaTexto(s.dist)}: ver en OpenStreetMap (se abre fuera)`}
                    className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                    style={{ minHeight: l.toque + 4 }}>
                    {detalle || !l.torre
                        ? <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full" style={{ background: conAlfa(m.color, 0.16), color: tinta(m.color, 0.3) }}><I className="size-3.5" /></span>
                        : <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />}
                    <span className="min-w-0 flex-1">
                        <span className={`block text-[12.5px] leading-snug text-white/90 ${detalle ? "truncate" : "line-clamp-2"}`}>{nombre}</span>
                        <span className="block truncate text-[11px] text-white/50">{detalle && s.nombre ? `${m.nombre} · ` : ""}{distanciaTexto(s.dist)} · {minutosAPie(s.dist)} min</span>
                    </span>
                    {detalle && <ExternalLink className="size-3.5 shrink-0 text-white/35" aria-hidden />}
                </a>
            </li>
        );
    };

    const lista = (max: number, detalle = true) => comunes.length === 0 ? (
        <div role="status" className="min-w-0">
            <p className="text-[13.5px] font-medium text-white/90">Nada común mapeado a 1 km</p>
            <p className="line-clamp-4 text-[11.5px] leading-snug text-white/55">¿Conoces una fuente, un huerto o una biblioteca libre? Añádelo al mapa común.</p>
            <a href={mapa} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[12px] text-white/75 underline-offset-2 hover:text-white hover:underline" style={{ minHeight: l.tactil ? l.toque : 24 }}>
                <MapPinned className="size-3.5" aria-hidden /> Abrir el mapa
            </a>
        </div>
    ) : (
        <ul className="flex min-w-0 flex-col gap-0.5" aria-label={filtro ? `${meta(filtro).plural} cerca` : "Lo más cercano"}>{visibles.slice(0, max).map((s) => fila(s, detalle))}</ul>
    );

    const menuTipos = conteo.length > 1 && (
        <nav aria-label="Filtrar por tipo" className="flex flex-col gap-0.5">
            {conteo.map(({ tipo, n }) => {
                const m = meta(tipo), activo = filtro === tipo;
                return (
                    <button key={tipo} type="button" aria-pressed={activo} onClick={() => setFiltro(activo ? null : tipo)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[12px] transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                        style={{ minHeight: l.tactil ? l.toque : 26, background: activo ? conAlfa(m.color, 0.14) : undefined }}>
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: m.color }} />
                        <span className="min-w-0 flex-1 truncate text-white/80">{m.plural}</span>
                        <span className="tabular-nums text-white/60">{n}</span>
                    </button>
                );
            })}
        </nav>
    );

    if (l.horizontal) {
        const D = Math.max(90, Math.min(hb, l.ancho * 0.24));
        return (
            <Lienzo l={l} titulo="Radar de Abundancia" subtitulo={`A pie de ${lugar}`} icono={Radar} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-4">
                    <RadarSvg D={D} sitios={comunes} filtro={filtro} l={l} />
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1">{lista(Math.max(1, Math.floor((hb - 16) / 46)))}{atribucion}</div>
                    {menuTipos && <div className="min-h-0 shrink-0 overflow-y-auto" style={{ width: Math.min(200, l.ancho * 0.26), maxHeight: hb }}>{menuTipos}</div>}
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        const D = Math.max(90, Math.min(l.ancho - 24, hb * 0.42));
        return (
            <Lienzo l={l} titulo="Abundancia" subtitulo={lugar} icono={Radar} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col items-center gap-3">
                    <RadarSvg D={D} sitios={comunes} filtro={null} l={l} />
                    <div className="flex w-full min-h-0 flex-1 flex-col gap-1">{lista(Math.max(1, Math.floor((hb - D - 40) / 48)), false)}{atribucion}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "xl") {
        const D = Math.max(130, Math.min(l.ancho * 0.44, hb * 0.52));
        return (
            <Lienzo l={l} titulo="Radar de Abundancia" subtitulo={`Lo común a pie de ${lugar}`} icono={Radar} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex min-h-0 items-center gap-4">
                        <RadarSvg D={D} sitios={comunes} filtro={filtro} l={l} anillos />
                        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" style={{ maxHeight: D }}>{menuTipos || lista(3)}</div>
                    </div>
                    {menuTipos && <div className="min-h-0 flex-1 overflow-y-auto">{lista(Math.max(2, Math.floor((hb - D - 40) / 46)))}</div>}
                    <div className="flex items-center justify-between gap-2">
                        {atribucion}
                        <a href={mapa} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-white/55 underline-offset-2 transition-colors duration-200 hover:text-white hover:underline">
                            <MapPinned className="size-3.5" aria-hidden /> Añadir al mapa común
                        </a>
                    </div>
                </div>
            </Lienzo>
        );
    }

    const D = Math.max(90, Math.min(hb - 8, l.ancho * 0.4));
    return (
        <Lienzo l={l} titulo="Radar de Abundancia" subtitulo={l.ancho >= 300 ? `A pie de ${lugar}` : undefined} icono={Radar} etiqueta={etiqueta}>
            <div className="flex h-full min-h-0 items-center gap-4">
                <RadarSvg D={D} sitios={comunes} filtro={null} l={l} anillos={l.base === "l"} />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1">{lista(Math.max(1, Math.min(4, Math.floor((hb - 20) / 46))), l.base === "l")}{atribucion}</div>
            </div>
        </Lienzo>
    );
}

'use client';

// ════════════════════════════════════════════════════════════════
// OraclePredictWidget — Oráculo de Probabilidades (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Amplificar la cognición con probabilidades REALES, nunca inventadas:
// la lluvia de hoy, mañana y pasado en tu lugar (Open-Meteo), los
// apagones de radio y las tormentas de radiación solar de los próximos
// 3 días (escalas de NOAA SWPC) y la tormenta geomagnética prevista
// (Kp de NOAA). Cada presagio dice su fuente y su horizonte; el orbe
// traza un anillo por probabilidad. Todo se lee de fuentes compartidas
// y cacheadas (30 min) y solo a la vista. Para preguntas abiertas,
// Aurora (el Exocórtex) en su chat. Estados honestos: cargando, vacío
// (sin ubicación ni previsión) y error por fuente.
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { CloudRain, MessageCircle, Orbit, Radio, Sun, Telescope, type LucideIcon } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, VacioHonesto, tinta } from "../gen5/_catalogo/piezas";
import { useKp, useMeteo } from "../gen5/_catalogo/meteo";
import { useCompartido } from "../gen5/_catalogo/recurso";
import { URL_ESCALAS, analizarEscalas, destacado, pct, presagios, type Clase, type DiaEscalas, type Presagio } from "./oracle-predict-partes";

const COLOR: Record<Clase, string> = { tierra: "#38bdf8", espacio: "#FFBF00", cielo: "#a78bfa" };
const ICONO: Record<string, LucideIcon> = { "lluvia-hoy": CloudRain, "lluvia-manana": CloudRain, "lluvia-pasado": CloudRain, radio: Radio, radiacion: Sun, geomagnetica: Orbit };

async function traerEscalas(): Promise<DiaEscalas[]> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try {
        const res = await fetch(URL_ESCALAS, { signal: ctl.signal });
        if (!res.ok) throw new Error(`La fuente respondió ${res.status}`);
        return analizarEscalas(await res.json());
    } finally {
        clearTimeout(t);
    }
}

function Orbe({ D, ps, l }: { D: number; ps: Presagio[]; l: EstadoLienzo }) {
    const id = useIdSvg("orb");
    const c = D / 2, R = D * 0.44;
    const conProb = ps.filter((p) => p.prob !== null).slice(0, 5);
    const top = destacado(ps);
    const paso = Math.min(D * 0.075, (R * 0.55) / Math.max(1, conProb.length));
    const arco = (r: number, p: number) => {
        const a = Math.max(0.0001, Math.min(0.9999, p)) * Math.PI * 2;
        const x = c + Math.sin(a) * r, y = c - Math.cos(a) * r;
        return `M${c} ${c - r}A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
    };
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-cr`} cx="42%" cy="38%" r="65%">
                    <stop offset="0%" stopColor={conAlfa(l.acento, 0.28)} />
                    <stop offset="70%" stopColor={conAlfa(l.acento2, 0.08)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento2, 0.02)} />
                </radialGradient>
                <radialGradient id={`${id}-bruma`} cx="50%" cy="55%" r="50%">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                </radialGradient>
            </defs>
            <circle cx={c} cy={c} r={R} fill={`url(#${id}-cr)`} stroke={conAlfa("#ffffff", 0.18)} />
            <circle cx={c} cy={c + R * 0.08} r={R * 0.4} fill={`url(#${id}-bruma)`}
                className={l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "8s", transformBox: "fill-box", transformOrigin: "center" }} />
            {conProb.map((p, i) => {
                const r = R * 0.9 - i * paso;
                const col = COLOR[p.clase];
                return (
                    <g key={p.id}>
                        <circle cx={c} cy={c} r={r} fill="none" stroke="#fff" strokeOpacity={0.07} strokeWidth={Math.max(2, paso * 0.55)} />
                        {p.prob! > 0.005 && <path d={arco(r, p.prob!)} fill="none" stroke={col} strokeOpacity={0.9} strokeWidth={Math.max(2, paso * 0.55)} strokeLinecap="round" />}
                    </g>
                );
            })}
            <ellipse cx={c - R * 0.35} cy={c - R * 0.5} rx={R * 0.28} ry={R * 0.13} fill="#fff" opacity={0.12} transform={`rotate(-30 ${c - R * 0.35} ${c - R * 0.5})`} />
            {top?.prob !== null && top?.prob !== undefined && D >= 80 && (
                <text x={c} y={c + D * 0.05} textAnchor="middle" fill="#fff" style={{ fontSize: Math.max(11, D * 0.14), fontWeight: 300 }}>{Math.round(top.prob * 100)}%</text>
            )}
        </svg>
    );
}

export function OraclePredictWidget() {
    const l = useLienzo("#06b6d4", "#a78bfa");
    const meteo = useMeteo(l.visible);
    const kp = useKp(l.visible);
    const escalas = useCompartido<DiaEscalas[]>("escalas:noaa", 30 * 60_000, traerEscalas, l.visible);
    const [ahora, setAhora] = React.useState(() => Date.now());
    React.useEffect(() => {
        if (!l.visible) return;
        setAhora(Date.now());
        const t = window.setInterval(() => setAhora(Date.now()), 10 * 60_000);
        return () => window.clearInterval(t);
    }, [l.visible]);

    const ps = React.useMemo(() => presagios(meteo.datos, escalas.datos, kp.datos, ahora), [meteo.datos, escalas.datos, kp.datos, ahora]);
    const top = destacado(ps);
    const fuentes = [meteo, escalas, kp];
    const cargando = !ps.length && fuentes.some((f) => f.cargando) && !(meteo.error && escalas.error && kp.error);
    const todoFallo = !ps.length && !!meteo.error && !!escalas.error && !!kp.error;
    const fallos = [meteo.error && "tiempo", escalas.error && "escalas solares", kp.error && "índice Kp"].filter(Boolean) as string[];

    const etiqueta = cargando ? "Oráculo de probabilidades: cargando las previsiones"
        : todoFallo ? "Oráculo de probabilidades: error, ninguna fuente respondió"
        : !ps.length ? "Oráculo de probabilidades: vacío, sin previsiones (elige tu lugar en el clima)"
        : `Oráculo de probabilidades: ${ps.map((p) => `${p.pregunta.replace(/[¿?]/g, "")} ${p.prob !== null ? pct(p.prob) : p.respuesta} (${p.horizonte}, ${p.fuente})`).join("; ")}${fallos.length ? `. Sin datos de: ${fallos.join(", ")}` : ""}`;

    const especial = (compacto: boolean) => {
        if (cargando) return <CargandoSilueta color={l.acento} etiqueta="Cargando las previsiones…" />;
        if (todoFallo) return <ErrorHonesto error={meteo.error} color={l.acento} onReintentar={() => { meteo.recargar(); escalas.recargar(); kp.recargar(); }} compacto={compacto} />;
        if (!ps.length) return <VacioHonesto icono={Telescope} color={l.acento} compacto={compacto} titulo="Sin previsiones" ayuda="Elige tu lugar en el clima para ver las de la Tierra." />;
        return null;
    };

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Oráculo" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Orbe D={l.lado - 8} ps={ps} l={l} /></div>
            </Lienzo>
        );
    }

    const fila = (p: Presagio, detalle: boolean) => {
        const col = COLOR[p.clase], I = ICONO[p.id] ?? Telescope;
        return (
            <li key={p.id} className="min-w-0" title={`${p.pregunta} ${p.prob !== null ? pct(p.prob) : p.respuesta} · ${p.horizonte} · fuente: ${p.fuente}`}>
                <div className="flex min-w-0 items-center gap-2">
                    <I className="size-3.5 shrink-0" style={{ color: tinta(col, 0.3) }} aria-hidden />
                    <span className={`min-w-0 flex-1 text-[12.5px] leading-snug text-white/85 ${detalle ? "truncate" : "line-clamp-2"}`}>{l.ancho < 240 ? p.corta : p.pregunta}</span>
                    <span className="shrink-0 text-[13px] tabular-nums text-white">{p.prob !== null ? pct(p.prob) : ""}</span>
                </div>
                {p.prob !== null ? (
                    <div className="ml-5 mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
                        <div className="h-full origin-left rounded-full transition-transform duration-300" style={{ background: col, transform: `scaleX(${Math.max(0.01, p.prob)})` }} />
                    </div>
                ) : <p className="ml-5 text-[11.5px] text-white/70">{p.respuesta}</p>}
                {detalle && <p className="ml-5 mt-0.5 truncate text-[10.5px] text-white/40">{p.horizonte} · {p.fuente}</p>}
            </li>
        );
    };
    const lista = (items: Presagio[], detalle = true) => <ul className="flex min-w-0 flex-col gap-2.5" aria-label="Probabilidades">{items.map((p) => fila(p, detalle))}</ul>;
    const aurora = (solo: boolean) => <Accion color={l.acento2} alto={l.toque} icono={MessageCircle} soloIcono={solo} href="/agent" etiqueta="Preguntar a Aurora (el Exocórtex)">Preguntar a Aurora</Accion>;
    const nota = <p className="text-[10.5px] leading-snug text-white/40">Probabilidades de modelos públicos, no certezas.{fallos.length ? ` Sin datos de ${fallos.join(", ")} (error de la fuente).` : ""}</p>;

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Oráculo" etiqueta={etiqueta} sinCabecera>
                {especial(true) ?? (
                    <div className="flex h-full items-center gap-2.5">
                        <Orbe D={Math.max(60, Math.min(l.alto - 30, l.ancho * 0.45))} ps={ps} l={l} />
                        {top && <p className="min-w-0 text-[12px] leading-snug text-white/80"><span className="line-clamp-2">{top.corta}</span><span className="text-[16px] tabular-nums text-white">{top.prob !== null ? pct(top.prob) : top.respuesta}</span></p>}
                    </div>
                )}
            </Lienzo>
        );
    }

    const hb = Math.max(80, l.alto - 64);
    const esp = especial(false);
    if (esp) {
        return (
            <Lienzo l={l} titulo="Oráculo de Probabilidades" subtitulo={l.ancho >= 300 ? "Lo que dicen los modelos" : undefined} icono={Telescope} etiqueta={etiqueta}>
                <div className="flex h-full flex-col justify-center">{esp}</div>
            </Lienzo>
        );
    }

    if (l.horizontal) {
        const D = Math.max(90, Math.min(hb, l.ancho * 0.22));
        const n = Math.max(1, Math.floor((hb + 10) / 44));
        return (
            <Lienzo l={l} titulo="Oráculo de Probabilidades" icono={Telescope} etiqueta={etiqueta} acciones={aurora(true)}>
                <div className="flex h-full min-h-0 items-center gap-5">
                    <Orbe D={D} ps={ps} l={l} />
                    <div className="min-w-0 flex-1">{lista(ps.slice(0, n), false)}</div>
                    {ps.length > n && <div className="min-w-0 flex-1">{lista(ps.slice(n, n * 2), false)}</div>}
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        const D = Math.max(90, Math.min(l.ancho - 30, hb * 0.34));
        return (
            <Lienzo l={l} titulo="Oráculo" icono={Telescope} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col items-center gap-3">
                    <Orbe D={D} ps={ps} l={l} />
                    <div className="w-full min-h-0 flex-1 overflow-y-auto">{lista(ps.slice(0, Math.max(1, Math.floor((hb - D - 20) / 52))), false)}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "xl") {
        const D = Math.max(120, Math.min(l.ancho * 0.38, hb * 0.5));
        return (
            <Lienzo l={l} titulo="Oráculo de Probabilidades" subtitulo="La Tierra, el cielo y el Sol en los próximos días" icono={Telescope} etiqueta={etiqueta} acciones={aurora(false)}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex min-h-0 items-center gap-5">
                        <Orbe D={D} ps={ps} l={l} />
                        <div className="min-w-0 flex-1">{lista(ps.slice(0, 3))}</div>
                    </div>
                    {ps.length > 3 && <div className="min-h-0 flex-1 overflow-y-auto">{lista(ps.slice(3))}</div>}
                    {nota}
                </div>
            </Lienzo>
        );
    }

    const D = Math.max(90, Math.min(hb - 8, l.ancho * 0.36));
    const n = l.base === "l" ? 4 : 3;
    return (
        <Lienzo l={l} titulo="Oráculo de Probabilidades" subtitulo={l.ancho >= 300 ? "Lo que dicen los modelos" : undefined} icono={Telescope} etiqueta={etiqueta}
            acciones={l.base === "l" ? aurora(true) : undefined}>
            <div className="flex h-full min-h-0 items-center gap-4">
                <Orbe D={D} ps={ps} l={l} />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto">{lista(ps.slice(0, n), false)}{l.base === "l" && nota}</div>
            </div>
        </Lienzo>
    );
}

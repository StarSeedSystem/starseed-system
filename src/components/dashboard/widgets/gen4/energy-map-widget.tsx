'use client';

// ════════════════════════════════════════════════════════════════
// EnergyMapWidget — Mapa de Energía (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// El cielo REAL de este momento, calculado sin red: los siete cuerpos
// clásicos (Sol, Luna, Mercurio, Venus, Marte, Júpiter y Saturno) en su
// signo del zodiaco trópico sobre una rueda de doce casas, con la fase
// de la Luna en el centro y la próxima luna llena. La lectura simbólica
// de cada cuerpo es la de la tradición y se dice como tal. El
// biorritmo (ciclos de 23, 28 y 33 días) solo aparece desde TU fecha de
// nacimiento, guardada solo en este dispositivo: sin ella no se inventa
// nada (vacío con la invitación a darla). Se recalcula cada 10 min y
// solo a la vista. Sin datos simulados. Nada se pide a la red: no hay
// estado de cargando ni error de fuente; lo único que puede faltar es la
// fecha (vacío) y, si el almacén falla, se sigue en memoria (catch).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { CalendarHeart, Sparkles, X } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { planetPositions } from "@/lib/astro";
import { COLOR_ELEMENTO, SIGNOS, faseLunar, proximaFase } from "@/lib/astro/cielo";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, tinta } from "../gen5/_catalogo/piezas";
import { CORTO, EFECTO, ciclos, enRueda, fechaValida, guardarNacimiento, leerNacimiento, pctCiclo, trazoLuna } from "./energy-map-partes";

const COLOR_CUERPO: Record<string, string> = { Sol: "#FFBF00", Luna: "#e2e8f0", Mercurio: "#94a3b8", Venus: "#f472b6", Marte: "#ef4444", "Júpiter": "#f59e0b", Saturno: "#a78bfa" };
const CICLOS = [
    { clave: "physical" as const, nombre: "Físico", color: "#ef4444" },
    { clave: "emotional" as const, nombre: "Emocional", color: "#38bdf8" },
    { clave: "intellectual" as const, nombre: "Intelectual", color: "#FFBF00" },
];

type Cuerpo = ReturnType<typeof planetPositions>[number];

function Rueda({ D, cuerpos, luna, l }: { D: number; cuerpos: Cuerpo[]; luna: ReturnType<typeof faseLunar>; l: EstadoLienzo }) {
    const id = useIdSvg("zod");
    const c = D / 2, R = D * 0.47, Ri = D * 0.36, Rp = D * 0.28;
    const glifos = D >= 110;
    // Separa cuerpos que caen casi en el mismo grado (dos órbitas para las etiquetas).
    const orden = [...cuerpos].sort((a, b) => a.longitude - b.longitude);
    let prev = -999, nivel = 0;
    const puestos = orden.map((p) => { nivel = p.longitude - prev < 9 ? (nivel + 1) % 2 : 0; prev = p.longitude; return { p, r: Rp - nivel * D * 0.07 }; });
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-f`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={conAlfa(l.acento, 0.18)} />
                    <stop offset="100%" stopColor={conAlfa(l.acento2, 0.03)} />
                </radialGradient>
            </defs>
            <circle cx={c} cy={c} r={R} fill={`url(#${id}-f)`} stroke={conAlfa("#ffffff", 0.2)} />
            <circle cx={c} cy={c} r={Ri} fill="none" stroke={conAlfa("#ffffff", 0.14)} />
            <g>
                {SIGNOS.map((s, i) => {
                    const a0 = enRueda(i * 30, R, c), b0 = enRueda(i * 30, Ri, c);
                    const m = enRueda(i * 30 + 15, (R + Ri) / 2, c);
                    return (
                        <g key={s.nombre}>
                            <line x1={a0.x} y1={a0.y} x2={b0.x} y2={b0.y} stroke="#fff" strokeOpacity={0.12} />
                            {glifos
                                ? <text x={m.x} y={m.y + D * 0.02} textAnchor="middle" fill={COLOR_ELEMENTO[s.elemento]} opacity={0.85} style={{ fontSize: Math.max(9, D * 0.055) }}>{s.glifo}</text>
                                : <circle cx={m.x} cy={m.y} r={Math.max(1.5, D * 0.015)} fill={COLOR_ELEMENTO[s.elemento]} opacity={0.7} />}
                        </g>
                    );
                })}
            </g>
            {puestos.map(({ p, r }) => {
                const q = enRueda(p.longitude, r, c), borde = enRueda(p.longitude, Ri, c);
                const col = COLOR_CUERPO[p.body] ?? "#fff";
                return (
                    <g key={p.body}>
                        <line x1={q.x} y1={q.y} x2={borde.x} y2={borde.y} stroke={col} strokeOpacity={0.35} />
                        <circle cx={q.x} cy={q.y} r={Math.max(2.5, D * (p.body === "Sol" || p.body === "Luna" ? 0.03 : 0.022))} fill={col}
                            className={p.body === "Sol" && l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "6s", transformBox: "fill-box", transformOrigin: "center" }} />
                        {glifos && <text x={q.x} y={q.y - D * 0.04} textAnchor="middle" fill={col} style={{ fontSize: Math.max(8, D * 0.045) }}>{CORTO[p.body]}</text>}
                    </g>
                );
            })}
            {/* la Luna de hoy en el centro */}
            <circle cx={c} cy={c} r={D * 0.1} fill="rgba(5,6,15,0.9)" stroke={conAlfa("#ffffff", 0.2)} />
            <path d={trazoLuna(c, c, D * 0.1, luna.iluminada, luna.creciente)} fill="#f1f5f9" opacity={0.92} />
        </svg>
    );
}

function Biorritmo({ W, H, nacimiento, hoy }: { W: number; H: number; nacimiento: string; hoy: Date }) {
    const { curva } = React.useMemo(() => ciclos(nacimiento, hoy), [nacimiento, hoy]);
    const x = (d: number) => ((d + 7) / 14) * W, y = (v: number) => H / 2 - v * (H / 2 - 3);
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block overflow-visible">
            <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#fff" strokeOpacity={0.12} />
            <line x1={x(0)} x2={x(0)} y1={0} y2={H} stroke="#fff" strokeOpacity={0.35} strokeDasharray="2 3" />
            {CICLOS.map((k) => <path key={k.clave} d={curva.map((p, i) => `${i ? "L" : "M"}${x(p.d).toFixed(1)} ${y(p.b[k.clave]).toFixed(1)}`).join("")} fill="none" stroke={k.color} strokeWidth={1.6} strokeOpacity={0.85} />)}
        </svg>
    );
}

export function EnergyMapWidget() {
    const l = useLienzo("#a855f7", "#38bdf8");
    const [ahora, setAhora] = React.useState(() => new Date());
    const [nacimiento, setNacimiento] = React.useState<string | null>(null);
    const [editando, setEditando] = React.useState(false);
    const [borrador, setBorrador] = React.useState("");
    const idFecha = React.useId();

    React.useEffect(() => { setNacimiento(leerNacimiento()); }, []);
    React.useEffect(() => {
        if (!l.visible) return;
        setAhora(new Date());
        const t = window.setInterval(() => setAhora(new Date()), 10 * 60_000);
        return () => window.clearInterval(t);
    }, [l.visible]);

    const cuerpos = React.useMemo(() => planetPositions(ahora), [ahora]);
    const luna = React.useMemo(() => faseLunar(ahora), [ahora]);
    const llena = React.useMemo(() => (luna.nombre === "Luna llena" ? null : proximaFase(ahora, "llena")), [ahora, luna.nombre]);
    const sol = cuerpos.find((p) => p.body === "Sol")!;
    const lunaPos = cuerpos.find((p) => p.body === "Luna")!;
    const bio = React.useMemo(() => (nacimiento ? ciclos(nacimiento, ahora, 0).hoy : null), [nacimiento, ahora]);
    const fechaLlena = llena ? llena.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }) : null;

    const etiqueta = `Mapa de energía: Sol en ${sol.sign.name}, Luna en ${lunaPos.sign.name} (${luna.nombre.toLowerCase()}, ${Math.round(luna.iluminada * 100)} % iluminada)${fechaLlena ? `, próxima luna llena el ${fechaLlena}` : ""}. ${cuerpos.filter((p) => p.body !== "Sol" && p.body !== "Luna").map((p) => `${p.body} en ${p.sign.name}`).join(", ")}. ${bio ? `Biorritmo: físico ${pctCiclo(bio.physical)} %, emocional ${pctCiclo(bio.emotional)} %, intelectual ${pctCiclo(bio.intellectual)} %` : "Biorritmo vacío: sin fecha de nacimiento"}`;

    const guardar = (e: React.FormEvent) => {
        e.preventDefault();
        if (!fechaValida(borrador)) return;
        guardarNacimiento(borrador);
        setNacimiento(borrador);
        setEditando(false);
    };

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Mapa de Energía" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Rueda D={l.lado - 8} cuerpos={cuerpos} luna={luna} l={l} /></div>
            </Lienzo>
        );
    }

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Mapa de Energía" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1">
                    <Rueda D={Math.max(70, Math.min(l.ancho - 20, l.alto - 44))} cuerpos={cuerpos} luna={luna} l={l} />
                    <span className="max-w-full truncate text-[12px] text-white/80">Luna en {lunaPos.sign.name}</span>
                </div>
            </Lienzo>
        );
    }

    const hb = Math.max(80, l.alto - 64);
    const fila = (p: Cuerpo, detalle: boolean) => {
        const col = COLOR_CUERPO[p.body] ?? "#fff";
        return (
            <li key={p.body} className="flex min-w-0 items-center gap-2" title={`${p.body} en ${p.sign.name}, ${Math.floor(p.degreeInSign)}° · ${EFECTO[p.body] ?? ""} (lectura tradicional)`}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: col }} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{p.body} en <span style={{ color: tinta(col, 0.35) }}>{p.sign.name}</span>{detalle ? <span className="text-white/45"> · {Math.floor(p.degreeInSign)}°</span> : null}</span>
                {detalle && <span className="hidden shrink-0 truncate text-[11px] text-white/45 sm:inline">{EFECTO[p.body]}</span>}
            </li>
        );
    };
    const listaCuerpos = (n: number, detalle = true) => <ul className="flex min-w-0 flex-col gap-1.5" aria-label="El cielo de ahora">{cuerpos.slice(0, n).map((p) => fila(p, detalle))}</ul>;
    const lineaLuna = (
        <p className="text-[11.5px] text-white/60">{luna.nombre} · {Math.round(luna.iluminada * 100)} %{fechaLlena ? <> · llena el {fechaLlena}</> : null}</p>
    );

    const panelBio = (W: number) => {
        if (editando) {
            return (
                <form onSubmit={guardar} className="flex flex-wrap items-center gap-1.5" aria-label="Tu fecha de nacimiento">
                    <label htmlFor={idFecha} className="text-[11.5px] text-white/60">Nacimiento</label>
                    <input id={idFecha} type="date" value={borrador} onChange={(e) => setBorrador(e.target.value)} max={new Date().toISOString().slice(0, 10)}
                        className="ss-redondo min-w-0 rounded-full bg-white/[0.06] px-3 text-[12.5px] text-white [color-scheme:dark] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }} />
                    <Accion color={l.acento} solida alto={l.toque} type="submit" disabled={!fechaValida(borrador)} icono={CalendarHeart}>Guardar</Accion>
                    <Accion color="#ffffff" alto={l.toque} soloIcono icono={X} onClick={() => setEditando(false)} etiqueta="Cancelar">Cancelar</Accion>
                    <p className="w-full text-[10.5px] text-white/40">Solo en este dispositivo: no sale de aquí.</p>
                </form>
            );
        }
        if (!nacimiento || !bio) {
            return (
                <div role="status" className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-white/55">El biorritmo necesita tu fecha de nacimiento (se guarda solo aquí).</p>
                    <Accion color={l.acento} alto={l.toque} icono={CalendarHeart} onClick={() => { setBorrador(""); setEditando(true); }} etiqueta="Añadir tu fecha de nacimiento para el biorritmo">Añadir fecha</Accion>
                </div>
            );
        }
        return (
            <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-white/45">Biorritmo · ±7 días</p>
                    <button type="button" onClick={() => { setBorrador(nacimiento); setEditando(true); }} className="cursor-pointer text-[11px] text-white/50 underline-offset-2 transition-colors duration-200 hover:text-white hover:underline" style={{ minHeight: l.tactil ? l.toque : 20 }}>Cambiar fecha</button>
                </div>
                <Biorritmo W={W} H={44} nacimiento={nacimiento} hoy={ahora} />
                <ul className="flex flex-wrap gap-x-3 gap-y-0.5" aria-label="Biorritmo de hoy">
                    {CICLOS.map((k) => <li key={k.clave} className="flex items-center gap-1.5 text-[11.5px] text-white/65"><span aria-hidden className="size-2 rounded-full" style={{ background: k.color }} />{k.nombre} <span className="tabular-nums text-white/90">{pctCiclo(bio[k.clave])} %</span></li>)}
                </ul>
            </div>
        );
    };

    if (l.horizontal) {
        const D = Math.max(90, Math.min(hb, l.ancho * 0.22));
        return (
            <Lienzo l={l} titulo="Mapa de Energía" subtitulo="El cielo de ahora" icono={Sparkles} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 items-center gap-4">
                    <Rueda D={D} cuerpos={cuerpos} luna={luna} l={l} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">{listaCuerpos(Math.max(3, Math.floor(hb / 24) - 1), false)}{lineaLuna}</div>
                    <div className="min-w-0 shrink-0" style={{ width: Math.min(260, l.ancho * 0.34) }}>{panelBio(Math.min(260, l.ancho * 0.34))}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.torre) {
        const D = Math.max(90, Math.min(l.ancho - 24, hb * 0.42));
        return (
            <Lienzo l={l} titulo="Energía" subtitulo="El cielo de ahora" icono={Sparkles} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col items-center gap-3">
                    <Rueda D={D} cuerpos={cuerpos} luna={luna} l={l} />
                    <div className="flex w-full min-h-0 flex-1 flex-col gap-2 overflow-y-auto">{listaCuerpos(Math.max(2, Math.min(7, Math.floor((hb - D - 50) / 25))), false)}{lineaLuna}</div>
                </div>
            </Lienzo>
        );
    }

    if (l.base === "xl") {
        const D = Math.max(130, Math.min(l.ancho * 0.44, hb * 0.55));
        return (
            <Lienzo l={l} titulo="Mapa de Energía" subtitulo="El cielo de ahora y tus ciclos" icono={Sparkles} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex min-h-0 items-center gap-4">
                        <Rueda D={D} cuerpos={cuerpos} luna={luna} l={l} />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">{listaCuerpos(7, true)}{lineaLuna}</div>
                    </div>
                    <div className="min-h-0">{panelBio(l.ancho - 40)}</div>
                </div>
            </Lienzo>
        );
    }

    const D = Math.max(90, Math.min(hb - 8, l.ancho * 0.42));
    return (
        <Lienzo l={l} titulo="Mapa de Energía" subtitulo={l.ancho >= 300 ? "El cielo de ahora" : undefined} icono={Sparkles} etiqueta={etiqueta}>
            <div className="flex h-full min-h-0 items-center gap-4">
                <Rueda D={D} cuerpos={cuerpos} luna={luna} l={l} />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">{listaCuerpos(l.base === "l" ? 7 : 4, false)}{lineaLuna}</div>
            </div>
        </Lienzo>
    );
}

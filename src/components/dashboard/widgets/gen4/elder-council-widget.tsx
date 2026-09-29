'use client';

// ════════════════════════════════════════════════════════════════
// ElderCouncilWidget — Consejo de Sabios (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// El Consejo REAL de Aurora (llm-council, src/lib/aurora/council.ts):
// cinco consejeros que encarnan los fundamentos StarSeed (Ontocracia,
// Oikos, Abundancia, Simbiosis, Empatía) deliberan sobre lo que
// escribas y un moderador sintetiza. Una mesa redonda: cada asiento se
// enciende con su dictamen al llegar. El enrutador de IA (gratis
// primero) se carga SOLO al convocar, nunca al pintar el tablero.
// Honestidad: se dice qué fuente respondió, si todas las perspectivas
// las razonó la misma inteligencia y qué dictámenes fallaron. La
// síntesis se puede llevar a /decisiones como propuesta.
// Estados honestos: cargando (deliberando, con progreso y cancelar),
// vacío (aún no has consultado: la mesa espera) y error (el Consejo no
// pudo reunirse: se dice por qué y se reintenta).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Landmark, Loader2, Scale, Send, Square } from "lucide-react";
import { buildProposalLink } from "@/lib/governance/links";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, ErrorHonesto, Rot, tinta } from "../gen5/_catalogo/piezas";
import {
    COLOR_VEREDICTO, CONSEJEROS, TEXTO_VEREDICTO, guardarInforme, leerInforme, resumenSintesis, resumirInforme,
    type InformeResumido,
} from "./elder-council-partes";

function Mesa({ D, informe, llegados, deliberando, l }: { D: number; informe: InformeResumido | null; llegados: number; deliberando: boolean; l: EstadoLienzo }) {
    const id = useIdSvg("mesa");
    const c = D / 2, R = D * 0.36, r = Math.max(8, D * 0.085);
    const pos = (i: number) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return [c + Math.cos(a) * R, c + Math.sin(a) * R] as const;
    };
    const sintesis = informe?.sintesis;
    const colorCentro = deliberando ? l.acento : sintesis?.ok ? COLOR_VEREDICTO[sintesis.veredicto] : conAlfa("#ffffff", 0.35);
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-m`} cx="50%" cy="40%" r="65%">
                    <stop offset="0%" stopColor={conAlfa(colorCentro, 0.28)} />
                    <stop offset="100%" stopColor={conAlfa(colorCentro, 0.02)} />
                </radialGradient>
            </defs>
            {/* la mesa */}
            <circle cx={c} cy={c} r={R * 0.72} fill={`url(#${id}-m)`} stroke="#fff" strokeOpacity={0.12} />
            <circle cx={c} cy={c} r={R * 1.18} fill="none" stroke="#fff" strokeOpacity={0.06} strokeDasharray="1 5" />
            {/* hilos de deliberación: de cada asiento al centro, del color de su dictamen */}
            {CONSEJEROS.map((k, i) => {
                const [x, y] = pos(i);
                const d = informe?.dictamenes.find((x2) => x2.id === k.id);
                const hecho = deliberando ? i < llegados : !!d;
                const color = !hecho ? "#ffffff" : deliberando ? k.color : d && d.ok ? COLOR_VEREDICTO[d.veredicto] : "#94a3b8";
                return <line key={k.id} x1={x} y1={y} x2={c} y2={c} stroke={color} strokeOpacity={hecho ? 0.55 : 0.1} strokeWidth={hecho ? 1.6 : 1} strokeDasharray={hecho ? undefined : "2 4"} />;
            })}
            {/* el centro: la síntesis */}
            <circle cx={c} cy={c} r={D * 0.07} fill={colorCentro} opacity={sintesis || deliberando ? 0.9 : 0.35}
                className={deliberando && l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "2.4s", transformBox: "fill-box", transformOrigin: "center" }} />
            {/* los cinco asientos */}
            {CONSEJEROS.map((k, i) => {
                const [x, y] = pos(i);
                const d = informe?.dictamenes.find((x2) => x2.id === k.id);
                const esperando = deliberando && i >= llegados;
                const anillo = deliberando ? (i < llegados ? k.color : conAlfa(k.color, 0.4)) : d ? (d.ok ? COLOR_VEREDICTO[d.veredicto] : "#94a3b8") : conAlfa(k.color, 0.6);
                return (
                    <g key={k.id} className={esperando && l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "1.8s", animationDelay: `${i * 0.25}s`, transformBox: "fill-box", transformOrigin: "center" }}>
                        <circle cx={x} cy={y} r={r} fill={conAlfa(k.color, 0.28)} stroke={anillo} strokeWidth={d || (deliberando && i < llegados) ? 2.4 : 1.2} />
                        <circle cx={x - r * 0.3} cy={y - r * 0.32} r={r * 0.28} fill="#fff" opacity={0.18} />
                    </g>
                );
            })}
        </svg>
    );
}

export function ElderCouncilWidget() {
    const l = useLienzo("#dc143c", "#23d5ab");
    const [informe, setInforme] = React.useState<InformeResumido | null>(null);
    const [tema, setTema] = React.useState("");
    const [deliberando, setDeliberando] = React.useState(false);
    const [progreso, setProgreso] = React.useState<{ texto: string; hechos: number }>({ texto: "", hechos: 0 });
    const [error, setError] = React.useState<unknown>(null);
    const control = React.useRef<AbortController | null>(null);
    React.useEffect(() => { setInforme(leerInforme()); }, []);
    React.useEffect(() => () => control.current?.abort(), []);

    const convocar = async (texto: string) => {
        const t = texto.trim();
        if (!t || deliberando) return;
        setError(null);
        setDeliberando(true);
        setProgreso({ texto: "Convocando al Consejo…", hechos: 0 });
        const ctl = new AbortController();
        control.current = ctl;
        try {
            // El enrutador de IA se carga solo ahora, al convocar.
            const m = await import("@/lib/aurora/council");
            const r = await m.consultCouncil({ title: t }, {
                review: false,
                signal: ctl.signal,
                onProgress: (etapa, hechos) => setProgreso({ texto: etapa, hechos }),
            });
            if (ctl.signal.aborted) return;
            const res = resumirInforme(r as never);
            guardarInforme(res);
            setInforme(res);
            setTema("");
            if (!res.sintesis?.ok && res.fallidos >= res.dictamenes.length) setError(new Error("La fuente no respondió: ningún consejero pudo dictaminar"));
        } catch (e) {
            if (!ctl.signal.aborted) setError(e ?? new Error("fallo"));
        } finally {
            setDeliberando(false);
            control.current = null;
        }
    };
    const cancelar = () => { control.current?.abort(); setDeliberando(false); };

    const sintesis = informe?.sintesis;
    const etiqueta = deliberando ? `Consejo de Aurora: deliberando. ${progreso.texto}`
        : informe ? `Consejo de Aurora: sobre «${informe.tema}», ${sintesis?.ok ? TEXTO_VEREDICTO[sintesis.veredicto].toLowerCase() : "sin síntesis"}${informe.fuenteUnica ? " (una sola fuente de inteligencia)" : ""}.`
            : "Consejo de Aurora: aún no has consultado; la mesa espera tu pregunta.";

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Consejo de Sabios" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Mesa D={l.lado - 10} informe={informe} llegados={progreso.hechos} deliberando={deliberando} l={l} /></div>
            </Lienzo>
        );
    }

    const campo = (
        <form onSubmit={(e) => { e.preventDefault(); void convocar(tema); }} className="flex min-w-0 flex-col gap-1">
            <div className="ss-redondo flex min-w-0 items-center gap-1 rounded-full pl-3 pr-1" style={{ background: conAlfa(l.acento, 0.1), boxShadow: `inset 0 0 0 1px ${conAlfa(l.acento, 0.4)}`, minHeight: l.toque }}>
                <input value={tema} onChange={(e) => setTema(e.target.value)} disabled={deliberando} placeholder="¿Qué quieres consultar?" aria-label="Pregunta o propuesta para el Consejo de Aurora"
                    className="min-w-0 flex-1 bg-transparent py-1.5 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none disabled:opacity-60" />
                {deliberando
                    ? <button type="button" onClick={cancelar} aria-label="Cancelar la deliberación" className="ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10" style={{ width: Math.min(l.toque, 36) - 6, height: Math.min(l.toque, 36) - 6 }}><Square className="size-3.5" /></button>
                    : <button type="submit" disabled={!tema.trim()} aria-label="Convocar al Consejo" className="ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" style={{ width: Math.min(l.toque, 36) - 6, height: Math.min(l.toque, 36) - 6 }}><Send className="size-3.5" /></button>}
            </div>
        </form>
    );

    const estado = deliberando ? (
        <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-[12px] text-white/70">
            <Loader2 aria-hidden className="size-3.5 motion-safe:animate-spin" />{progreso.texto} ({Math.min(progreso.hechos, 5)} de 5)
        </p>
    ) : error ? <ErrorHonesto error={error} color={l.acento} onReintentar={informe?.tema || tema ? () => void convocar(tema || informe!.tema) : undefined} compacto /> : null;

    const resultado = informe && !deliberando && (
        <div className="min-w-0">
            <Rot className="block truncate">Sobre «{informe.tema}»</Rot>
            {sintesis?.ok ? (
                <>
                    <p className="mt-0.5 text-[15px] font-medium" style={{ color: tinta(COLOR_VEREDICTO[sintesis.veredicto], 0.2) }}>{TEXTO_VEREDICTO[sintesis.veredicto]}</p>
                    {(l.base === "l" || l.base === "xl" || l.horizontal) && <p className={`mt-0.5 text-[12px] leading-snug text-white/70 ${l.base === "xl" ? "line-clamp-4" : "line-clamp-2"}`}>{resumenSintesis(sintesis.texto)}</p>}
                </>
            ) : <p className="mt-0.5 text-[12.5px] text-white/65">El Consejo no llegó a una síntesis.</p>}
            <p className="mt-1 text-[11px] text-white/45">
                {informe.fuenteUnica ? `Una sola fuente razonó las cinco voces${informe.fuentes[0] ? ` (${informe.fuentes[0]})` : ""}` : `${informe.fuentes.length} fuentes de inteligencia`}
                {informe.fallidos ? ` · ${informe.fallidos} dictamen${informe.fallidos === 1 ? "" : "es"} sin respuesta` : ""}
            </p>
        </div>
    );
    const vacio = !informe && !deliberando && !error && (
        <p className="text-[12px] leading-snug text-white/60">La mesa está vacía de consultas: escribe una pregunta o propuesta y las cinco voces de los fundamentos StarSeed deliberarán.</p>
    );
    const asientos = l.base === "xl" && (
        <ul className="grid grid-cols-1 gap-1" aria-label="Los cinco consejeros">
            {CONSEJEROS.map((k) => {
                const d = informe?.dictamenes.find((x) => x.id === k.id);
                return (
                    <li key={k.id} className="flex min-w-0 items-center gap-2 text-[12px]">
                        <span aria-hidden className="ss-redondo size-2.5 shrink-0 rounded-full" style={{ background: k.color }} />
                        <span className="min-w-0 flex-1 truncate text-white/80" title={k.fundamento}>{k.nombre}</span>
                        {d && <span className="shrink-0 text-[11px]" style={{ color: tinta(d.ok ? COLOR_VEREDICTO[d.veredicto] : "#94a3b8", 0.2) }}>{d.ok ? TEXTO_VEREDICTO[d.veredicto] : "sin respuesta"}</span>}
                    </li>
                );
            })}
        </ul>
    );
    const llevar = informe && sintesis?.ok && !deliberando && (
        <div className="flex flex-wrap gap-1.5">
            <Accion color={l.acento} alto={l.toque} icono={Landmark} href={buildProposalLink("", { title: informe.tema.slice(0, 120), description: `Dictamen del Consejo de Aurora: ${TEXTO_VEREDICTO[sintesis.veredicto]}. ${resumenSintesis(sintesis.texto, 600)}` })}
                etiqueta={`Llevar «${informe.tema}» a una propuesta en Decisiones`}>Proponer</Accion>
            <Accion color={l.acento2} alto={l.toque} icono={Scale} href="/network/politics" soloIcono={l.base === "l" && !l.horizontal} etiqueta="Abrir el Área Política (Consejo completo)">Política</Accion>
        </div>
    );

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Consejo de Sabios" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1">
                    <Mesa D={Math.max(70, Math.min(l.ancho - 20, l.alto - 46))} informe={informe} llegados={progreso.hechos} deliberando={deliberando} l={l} />
                    <p className="max-w-full truncate text-[12px] text-white/80">{deliberando ? "Deliberando…" : sintesis?.ok ? TEXTO_VEREDICTO[sintesis.veredicto] : "Pregunta al Consejo"}</p>
                </div>
            </Lienzo>
        );
    }

    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.1;
    const cab = 52;
    const D = fila ? Math.max(90, Math.min(l.alto - cab - 20, l.ancho * (l.horizontal ? 0.24 : 0.38))) : Math.max(90, Math.min(l.ancho * 0.5, (l.alto - cab) * 0.36));

    return (
        <Lienzo l={l} titulo="Consejo de Sabios" subtitulo="Cinco fundamentos, una deliberación" icono={Scale} etiqueta={etiqueta} vivo={deliberando}>
            <div className={`flex h-full min-h-0 gap-4 ${fila ? "flex-row items-center" : "flex-col items-center"}`} style={{ justifyContent: "safe center" }}>
                <Mesa D={D} informe={informe} llegados={progreso.hechos} deliberando={deliberando} l={l} />
                <div className={`flex min-h-0 min-w-0 flex-col justify-center gap-2.5 ${fila ? "flex-1" : "w-full"}`}>
                    {estado}
                    {resultado || vacio}
                    {campo}
                    {grande && llevar}
                    {asientos}
                </div>
            </div>
        </Lienzo>
    );
}

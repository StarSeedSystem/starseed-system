'use client';

// ════════════════════════════════════════════════════════════════
// FlowDirectorWidget — Director de Flujo (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Un temporizador de enfoque de verdad (tipo Pomodoro, local) con el
// registro del día. La esfera es el día REAL de tu lugar: el arco
// ámbar va del orto al ocaso (lib/astro/cielo) y encima quedan tus
// bloques de enfoque de hoy; dentro, el anillo de la sesión en curso.
// La tarea a enfocar sale de tus Tareas rápidas y, al terminar el
// bloque, puedes marcarla hecha desde aquí.
//
// Tiempo con marcas absolutas: el tic se para cuando el widget no se
// ve (pestaña oculta o fuera de pantalla) y al volver se recalcula.
// Un único temporizador avisa del final (notificación del navegador
// solo si ya diste permiso). Estados honestos: cargando (primer
// montaje), vacío (sin bloques hoy: invitación a empezar) y error del
// almacén local (se sigue funcionando en memoria).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Check, Coffee, ListTodo, Pause, Play, Square, Sunrise, Sunset, Target, Timer } from "lucide-react";
import { useQuickTasks, type QuickTask } from "@/lib/tasks/quick-tasks";
import { horasDelSol } from "@/lib/astro/cielo";
import { fireNotification } from "@/lib/clima/reminders-store";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "./_catalogo/lienzo";
import { Accion, Rot, tinta } from "./_catalogo/piezas";
import { useLugar } from "./_catalogo/meteo";
import { Alterna, Encajar, PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import {
    PRESETS_DESCANSO, PRESETS_ENFOQUE, duracionTexto, entradasDeHoy, horaDecimal, minutosCortos, minutosHoy, minutosPorDia,
    progreso, racha, reloj, restante, useFlujo, type EntradaFlujo, type SesionFlujo,
} from "./flow-director-partes";

const AMBAR = "#FFBF00";

/** Punto de la esfera de 24 h (mediodía arriba, como el reloj celeste). */
function enEsfera(hora: number, r: number, c: number): [number, number] {
    const a = ((hora / 24) * 360 + 180) * (Math.PI / 180);
    return [c + Math.sin(a) * r, c - Math.cos(a) * r];
}

function arcoHoras(h1: number, h2: number, r: number, c: number): string {
    const [ax, ay] = enEsfera(h1, r, c), [bx, by] = enEsfera(h2, r, c);
    const span = (((h2 - h1) % 24) + 24) % 24;
    return `M${ax.toFixed(1)} ${ay.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 ${span > 12 ? 1 : 0} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

/** Tic de reloj: solo corre si `activo` (sesión en marcha y widget a la vista). */
function useAhora(activo: boolean, cadaMs: number): number {
    const [ahora, setAhora] = React.useState(() => Date.now());
    React.useEffect(() => {
        setAhora(Date.now());
        if (!activo) return;
        const id = window.setInterval(() => setAhora(Date.now()), cadaMs);
        return () => window.clearInterval(id);
    }, [activo, cadaMs]);
    return ahora;
}

interface DialProps {
    D: number;
    sesion: SesionFlujo | null;
    ahora: number;
    hoy: EntradaFlujo[];
    sol: { orto: number | null; ocaso: number | null } | null;
    conDia: boolean;
    l: EstadoLienzo;
    etiquetaCentro: string;
    subCentro: string;
}

function DialFlujo({ D, sesion, ahora, hoy, sol, conDia, l, etiquetaCentro, subCentro }: DialProps) {
    const id = useIdSvg("flujo");
    const c = D / 2;
    const Rd = D * 0.47;
    const Rp = conDia ? D * 0.37 : D * 0.43;
    const grosor = Math.max(4, D * (conDia ? 0.05 : 0.06));
    const circ = 2 * Math.PI * Rp;
    const p = sesion ? progreso(sesion, ahora) : 0;
    const color = sesion?.modo === "descanso" ? l.acento2 : l.acento;
    const pausada = !!sesion && sesion.pausadaEn !== null;
    const angCabeza = p * 360;
    const [hx, hy] = [c + Math.sin((angCabeza * Math.PI) / 180) * Rp, c - Math.cos((angCabeza * Math.PI) / 180) * Rp];
    const ahoraH = horaDecimal(ahora);
    const transicion = l.animar ? "stroke-dashoffset 1s linear" : undefined;
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <linearGradient id={`${id}-p`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={tinta(color, 0.25)} />
                    <stop offset="100%" stopColor={color} />
                </linearGradient>
                <radialGradient id={`${id}-n`} cx="50%" cy="38%" r="62%">
                    <stop offset="0%" stopColor={conAlfa(color, sesion ? 0.22 : 0.1)} />
                    <stop offset="100%" stopColor={conAlfa(color, 0)} />
                </radialGradient>
                <linearGradient id={`${id}-d`} x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ff7a59" />
                    <stop offset="50%" stopColor={AMBAR} />
                    <stop offset="100%" stopColor="#ff7a59" />
                </linearGradient>
            </defs>
            {/* núcleo: una luz del color del modo, más viva en marcha */}
            <circle cx={c} cy={c} r={Rp - grosor} fill={`url(#${id}-n)`} />
            {conDia && (
                <g>
                    <circle cx={c} cy={c} r={Rd} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={1} />
                    {Array.from({ length: 24 }, (_, i) => {
                        const mayor = i % 6 === 0;
                        const [x1, y1] = enEsfera(i, Rd + (mayor ? 4 : 2), c), [x2, y2] = enEsfera(i, Rd - (mayor ? 4 : 2), c);
                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeOpacity={mayor ? 0.4 : 0.16} strokeWidth={mayor ? 1.4 : 1} strokeLinecap="round" />;
                    })}
                    {sol?.orto != null && sol?.ocaso != null && (
                        <path d={arcoHoras(horaDecimal(sol.orto), horaDecimal(sol.ocaso), Rd, c)} fill="none" stroke={`url(#${id}-d)`} strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />
                    )}
                    {hoy.map((e) => (
                        <path key={e.inicio} d={arcoHoras(horaDecimal(e.inicio), Math.max(horaDecimal(e.inicio) + 0.08, horaDecimal(e.fin)), Rd, c)}
                            fill="none" stroke={l.acento} strokeWidth={5} strokeLinecap="round" opacity={0.9} />
                    ))}
                    {(() => { const [x, y] = enEsfera(ahoraH, Rd, c); return <circle cx={x} cy={y} r={Math.max(3, D * 0.018)} fill="#fff" />; })()}
                </g>
            )}
            {/* anillo de la sesión */}
            <circle cx={c} cy={c} r={Rp} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={grosor} />
            {sesion && (
                <circle cx={c} cy={c} r={Rp} fill="none" stroke={`url(#${id}-p)`} strokeWidth={grosor} strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={circ * (1 - p)} transform={`rotate(-90 ${c} ${c})`}
                    opacity={pausada ? 0.55 : 1} style={{ transition: transicion }} />
            )}
            {sesion && p > 0.005 && (
                <circle cx={hx} cy={hy} r={grosor * 0.62} fill="#fff" opacity={pausada ? 0.6 : 0.95}
                    style={l.nivel === "pleno" ? { filter: `drop-shadow(0 0 ${Math.round(grosor)}px ${color})` } : undefined} />
            )}
            <text x={c} y={c + D * 0.012} textAnchor="middle" dominantBaseline="middle" fill="#fff"
                style={{ fontSize: D * (etiquetaCentro.length > 5 ? 0.15 : 0.19), fontWeight: 250, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {etiquetaCentro}
            </text>
            {subCentro && D >= 96 && (
                <text x={c} y={c + D * 0.15} textAnchor="middle" dominantBaseline="middle" fill={tinta(color, 0.3)}
                    className={pausada && l.animar ? "ss-respirar" : undefined}
                    style={{ fontSize: Math.max(9, D * 0.055), fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", transformBox: "fill-box", transformOrigin: "center" }}>
                    {subCentro}
                </text>
            )}
        </svg>
    );
}

function tareaPreferida(pendientes: QuickTask[]): QuickTask | undefined {
    return pendientes.find((t) => t.priority === "alta") ?? pendientes[0];
}

export function FlowDirectorWidget() {
    const l = useLienzo("#39ff14", "#7c5cff");
    const { sesion, registro, iniciar, alternarPausa, detener, cerrarSiTerminada } = useFlujo();
    const { pending, toggle } = useQuickTasks();
    const lugar = useLugar();
    const [montado, setMontado] = React.useState(false);
    const [tareaId, setTareaId] = React.useState<string | null>(null);
    const [recien, setRecien] = React.useState<{ entrada: EntradaFlujo; tareaId?: string } | null>(null);
    React.useEffect(() => { setMontado(true); }, []);

    const corriendo = !!sesion && sesion.pausadaEn === null;
    const ahora = useAhora(l.visible && (corriendo || montado), corriendo ? 1000 : 30_000);

    // Aviso del final: UN temporizador por sesión (no un intervalo). La primera instancia que
    // cierre la sesión la anota; las demás ya no la encuentran.
    React.useEffect(() => {
        if (!sesion || sesion.pausadaEn !== null) return;
        const falta = restante(sesion, Date.now());
        const t = window.setTimeout(() => {
            const cierre = cerrarSiTerminada(Date.now());
            if (!cierre) return;
            if (cierre.entrada) {
                setRecien({ entrada: cierre.entrada, tareaId: cierre.sesion.tareaId });
                fireNotification("Bloque de enfoque completado", `${duracionTexto(cierre.entrada.minutos)}${cierre.entrada.tarea ? ` · ${cierre.entrada.tarea}` : ""}. Tómate un respiro.`);
            } else if (cierre.sesion.modo === "descanso") {
                fireNotification("Fin del descanso", "Cuando quieras, otro bloque de enfoque.");
            }
        }, Math.max(250, falta));
        return () => window.clearTimeout(t);
    }, [sesion, cerrarSiTerminada]);

    // Al volver a la vista, si la sesión terminó mientras no se veía, se cierra aquí.
    React.useEffect(() => {
        if (!l.visible || !sesion) return;
        if (sesion.pausadaEn === null && restante(sesion, Date.now()) <= 0) {
            const cierre = cerrarSiTerminada(Date.now());
            if (cierre?.entrada) setRecien({ entrada: cierre.entrada, tareaId: cierre.sesion.tareaId });
        }
    }, [l.visible, sesion, cerrarSiTerminada, ahora]);

    const hoy = React.useMemo(() => entradasDeHoy(registro, ahora), [registro, ahora]);
    const totalHoy = minutosHoy(registro, ahora);
    const diasSeguidos = racha(registro, ahora);
    const sol = React.useMemo(() => {
        if (!lugar) return null;
        const h = horasDelSol(new Date(ahora), lugar.lat, lugar.lon);
        return { orto: h.orto?.getTime() ?? null, ocaso: h.ocaso?.getTime() ?? null };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lugar?.lat, lugar?.lon, Math.floor(ahora / 3_600_000)]);

    const tarea = pending.find((t) => t.id === tareaId) ?? tareaPreferida(pending);
    const cambiarTarea = () => {
        if (!pending.length) return;
        const i = tarea ? pending.findIndex((t) => t.id === tarea.id) : -1;
        setTareaId(pending[(i + 1) % pending.length].id);
    };
    const empezar = (min: number) => { setRecien(null); iniciar("enfoque", min, tarea ? { id: tarea.id, texto: tarea.text } : undefined); };
    const descansar = (min: number) => { setRecien(null); iniciar("descanso", min); };

    const quedaMs = sesion ? restante(sesion, ahora) : 0;
    const centro = sesion ? reloj(quedaMs) : minutosCortos(totalHoy);
    const sub = sesion ? (sesion.pausadaEn !== null ? "en pausa" : sesion.modo === "descanso" ? "descanso" : "enfoque") : "hoy";
    const luzRestante = sol?.ocaso && ahora < sol.ocaso && sol.orto && ahora > sol.orto ? Math.round((sol.ocaso - ahora) / 60_000) : null;
    const etiqueta = sesion
        ? `Director de flujo: ${sesion.modo === "descanso" ? "descanso" : "enfoque"}${sesion.pausadaEn !== null ? " en pausa" : ""}, quedan ${reloj(quedaMs)}${sesion.tareaTexto ? `, tarea «${sesion.tareaTexto}»` : ""}. Hoy llevas ${duracionTexto(totalHoy)} de enfoque.`
        : `Director de flujo: hoy llevas ${duracionTexto(totalHoy)} de enfoque en ${hoy.length} bloques.`;
    const subtitulo = `Hoy ${duracionTexto(totalHoy)}${diasSeguidos > 1 ? ` · racha de ${diasSeguidos} días` : ""}`;

    if (!montado) {
        return (
            <Lienzo l={l} titulo="Director de Flujo" icono={Timer} etiqueta="Director de flujo: cargando tu sesión">
                <div role="status" className="grid h-full place-items-center text-[12px] text-white/60">Cargando tu sesión…</div>
            </Lienzo>
        );
    }

    const botonPrincipal = (conTexto: boolean) => sesion
        ? <Accion color={sesion.modo === "descanso" ? l.acento2 : l.acento} solida alto={l.toque} icono={sesion.pausadaEn !== null ? Play : Pause} onClick={alternarPausa} soloIcono={!conTexto}
            etiqueta={sesion.pausadaEn !== null ? "Reanudar la sesión" : "Pausar la sesión"}>{sesion.pausadaEn !== null ? "Reanudar" : "Pausar"}</Accion>
        : <Accion color={l.acento} solida alto={l.toque} icono={Play} onClick={() => empezar(25)} soloIcono={!conTexto} etiqueta="Empezar un bloque de enfoque de 25 minutos">Enfocar 25 min</Accion>;
    const botonParar = sesion && <Accion color="#ffffff" alto={l.toque} icono={Square} onClick={detener} soloIcono etiqueta="Terminar la sesión ahora (se anota lo hecho)">Terminar</Accion>;

    // ── micro: la esfera es el botón ──
    if (l.base === "micro") {
        // (Pulido 0930) La esfera se mide por la tesela (no baja de 56 px fijos: en una de 46 se salía).
        const D = Math.max(28, l.lado - 18);
        return (
            <Lienzo l={l} titulo="Director de Flujo" etiqueta={etiqueta} sinCabecera>
                <button type="button" onClick={() => (sesion ? alternarPausa() : empezar(25))}
                    aria-label={sesion ? (sesion.pausadaEn !== null ? "Reanudar la sesión de enfoque" : "Pausar la sesión de enfoque") : "Empezar 25 minutos de enfoque"}
                    className="ss-redondo m-auto grid cursor-pointer place-items-center rounded-full outline-none transition-transform duration-200 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-white/70 motion-reduce:transition-none">
                    <DialFlujo D={D} sesion={sesion} ahora={ahora} hoy={hoy} sol={sol} conDia={false} l={l}
                        etiquetaCentro={sesion ? String(Math.ceil(quedaMs / 60_000)) + "′" : centro} subCentro="" />
                </button>
            </Lienzo>
        );
    }

    const completado = recien && (
        <div role="status" className="flex flex-col gap-1.5">
            <p className="text-[12px] font-semibold leading-snug" style={{ color: tinta(l.acento, 0.2) }}>
                <Check aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />Bloque completado · {duracionTexto(recien.entrada.minutos)}
            </p>
            <div className="flex flex-wrap gap-1.5">
                {recien.tareaId && pending.some((t) => t.id === recien.tareaId) && (
                    <Accion color={l.acento} alto={l.toque} icono={Check} onClick={() => { toggle(recien.tareaId!); setRecien(null); }}
                        etiqueta={`Marcar «${recien.entrada.tarea ?? "la tarea"}» como hecha`}>Tarea hecha</Accion>
                )}
                <Accion color={l.acento2} alto={l.toque} icono={Coffee} onClick={() => descansar(5)}>Descanso 5 min</Accion>
            </div>
        </div>
    );

    const lineaTarea = (
        <div className="flex min-w-0 items-center gap-2">
            <Target aria-hidden className="size-3.5 shrink-0" style={{ color: tinta(l.acento) }} />
            <p className="min-w-0 flex-1 truncate text-[12.5px] text-white/85" title={sesion?.tareaTexto ?? tarea?.text}>
                {sesion?.tareaTexto ?? tarea?.text ?? <span className="text-white/55">Sin tarea: enfoque libre</span>}
            </p>
            {!sesion && pending.length > 1 && (
                <Accion color={l.acento} alto={Math.min(l.toque, 30)} icono={ListTodo} onClick={cambiarTarea} soloIcono etiqueta="Elegir otra tarea para este bloque">Otra tarea</Accion>
            )}
        </div>
    );

    // ── s: la esfera y el control principal ──
    if (l.base === "s") {
        const D = Math.max(80, Math.min(l.ancho - 20, l.alto - (l.toque + 26)));
        return (
            <Lienzo l={l} titulo="Director de Flujo" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-2">
                    <DialFlujo D={D} sesion={sesion} ahora={ahora} hoy={hoy} sol={sol} conDia={false} l={l} etiquetaCentro={centro} subCentro={sub} />
                    <div className="flex items-center gap-1.5">{botonPrincipal(false)}{botonParar}</div>
                </div>
            </Lienzo>
        );
    }

    // Tres composiciones: panorámica (tres columnas), en fila (esfera + columna) y en columna
    // (esfera arriba). La esfera lleva el anillo del día desde «l» o cuando hay sitio al lado.
    const disposicion: "pano" | "fila" | "columna" = l.horizontal ? "pano" : l.base === "xl" || l.ancho >= l.alto * 1.25 ? "fila" : "columna";
    const grande = l.base === "l" || l.base === "xl";
    const estrecho = l.ancho < 240;
    const presets = (
        <div className="flex flex-col gap-1.5" role="group" aria-label="Duración del próximo bloque">
            <Rot>Bloque</Rot>
            <div className="flex flex-wrap gap-1.5">
                {PRESETS_ENFOQUE.map((m) => <Accion key={m} color={l.acento} alto={l.toque} onClick={() => empezar(m)} etiqueta={`Empezar ${m} minutos de enfoque`}>{m} min</Accion>)}
                {PRESETS_DESCANSO.map((m) => <Accion key={`d${m}`} color={l.acento2} alto={l.toque} icono={Coffee} onClick={() => descansar(m)} etiqueta={`Descansar ${m} minutos`}>{m}</Accion>)}
            </div>
        </div>
    );
    const controlCorto = (
        <div className="flex flex-wrap items-center gap-1.5">
            <Accion color={l.acento} solida alto={l.toque} icono={Play} onClick={() => empezar(25)} etiqueta="Empezar 25 minutos de enfoque">25 min</Accion>
            <Accion color={l.acento2} alto={l.toque} icono={Coffee} onClick={() => descansar(5)} etiqueta="Descansar 5 minutos">5</Accion>
        </div>
    );
    const estadisticas = (
        <dl className="grid grid-cols-3 gap-2">
            {[
                { t: "Hoy", v: minutosCortos(totalHoy) },
                { t: "Bloques", v: String(hoy.length) },
                { t: "Racha", v: `${diasSeguidos} d` },
            ].map((x) => (
                <div key={x.t} className="min-w-0">
                    <dt><Rot className="text-[10px]">{x.t}</Rot></dt>
                    <dd className="truncate text-[15px] font-light tabular-nums text-white">{x.v}</dd>
                </div>
            ))}
        </dl>
    );
    const luz = sol && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-white/60">
            {luzRestante !== null
                ? <><Sunset aria-hidden className="size-3.5 shrink-0 text-amber-300" />{duracionTexto(luzRestante)} de luz</>
                : <><Sunrise aria-hidden className="size-3.5 shrink-0 text-amber-300" />{sol.orto ? `Amanece ${new Date(sol.orto).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : "Sin orto hoy aquí"}</>}
        </p>
    );
    const semana = (() => {
        const dias = minutosPorDia(registro, ahora, 7);
        const max = Math.max(30, ...dias.map((d) => d.minutos));
        return (
            <figure className="flex flex-col gap-1.5" aria-label="Minutos de enfoque de los últimos 7 días">
                <Rot>Últimos 7 días</Rot>
                <div className="flex h-16 items-stretch gap-1.5">
                    {dias.map((d, i) => (
                        <div key={d.dia} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${new Date(d.dia).toLocaleDateString("es-ES", { weekday: "long" })}: ${duracionTexto(d.minutos)}`}>
                            <span className="block w-full max-w-[18px] rounded-full" style={{ height: `${Math.max(8, (d.minutos / max) * 70)}%`, background: i === 6 ? l.acento : conAlfa(l.acento, d.minutos ? 0.4 : 0.14) }} />
                            <span className="text-[10px] leading-none text-white/50">{new Date(d.dia).toLocaleDateString("es-ES", { weekday: "narrow" })}</span>
                        </div>
                    ))}
                </div>
            </figure>
        );
    })();
    const sinBloques = !sesion && hoy.length === 0 && !recien && (grande || l.horizontal) && (
        <p className="text-[12px] leading-snug text-white/60">Aún no hay bloques hoy (registro vacío). Elige una duración y empieza.</p>
    );
    const accionesSesion = completado || (
        <>
            {lineaTarea}
            {sesion
                ? <div className="flex items-center gap-1.5">{botonPrincipal(true)}{botonParar}</div>
                : (l.base === "l" && !estrecho) || l.base === "xl" || disposicion === "pano" ? <Alterna nivel={3} corto={controlCorto}>{presets}</Alterna> : controlCorto}
        </>
    );

    const cab = 52, pad = 12;
    const D = disposicion === "pano"
        ? Math.max(96, Math.min(l.alto - cab - pad * 2, l.ancho * 0.3))
        : disposicion === "fila"
            ? Math.max(96, Math.min(l.alto - cab - pad * 2, l.ancho * (l.base === "xl" ? 0.5 : 0.44)))
            : Math.max(96, Math.min(l.ancho - pad * 2, l.alto - cab - (estrecho ? 150 : 128)));
    const alta = l.torre && l.alto >= 380;
    const dialDe = (d: number) => <DialFlujo D={d} sesion={sesion} ahora={ahora} hoy={hoy} sol={sol} conDia={grande || alta || disposicion !== "columna"} l={l} etiquetaCentro={centro} subCentro={sub} />;
    const dial = dialDe(D);

    return (
        <Lienzo l={l} titulo="Director de Flujo" subtitulo={subtitulo} icono={Timer} etiqueta={etiqueta} vivo={corriendo && !estrecho}>
            {disposicion === "pano" ? (
                <div className="flex h-full min-h-0 items-center gap-5">
                    {dial}
                    <PilaAjustable niveles={3} className="min-w-0 flex-1">
                        <div className="my-auto flex min-w-0 flex-col gap-2.5">{accionesSesion}<Prescindible nivel={1}>{sinBloques}</Prescindible></div>
                    </PilaAjustable>
                    <div className="flex w-[34%] min-w-0 flex-col justify-center gap-3">{estadisticas}{luz}</div>
                </div>
            ) : disposicion === "fila" ? (
                <div className="flex h-full min-h-0 items-center gap-4">
                    {dial}
                    {/* Lo secundario se retira si no cabe (la semana, el aviso, la luz) en vez de salirse. */}
                    <PilaAjustable niveles={3} className="min-w-0 flex-1">
                        <div className="my-auto flex min-w-0 flex-col gap-2.5">
                            {accionesSesion}
                            {l.base === "xl" && <Prescindible nivel={2}>{estadisticas}</Prescindible>}
                            <Prescindible nivel={1}>{sinBloques}</Prescindible>
                            <Prescindible nivel={2}>{luz}</Prescindible>
                            {l.base === "xl" && <Prescindible nivel={1}>{semana}</Prescindible>}
                        </div>
                    </PilaAjustable>
                </div>
            ) : (
                // El dial toma el alto que dejan las acciones (antes, fijo, empujaba «51 min · de luz»
                // fuera de la tarjeta); si ni así cabe, se retira la luz y los bloques pasan a su versión corta.
                <PilaAjustable niveles={3} className="items-center gap-3">
                    <Encajar minimo={96} className="flex w-full items-center justify-center">{({ ancho, alto }) => dialDe(Math.max(96, Math.min(ancho, alto)))}</Encajar>
                    <div className="flex w-full min-w-0 shrink-0 flex-col gap-2">
                        {accionesSesion}
                        {(grande || alta) && <Prescindible nivel={1}>{luz}</Prescindible>}
                    </div>
                </PilaAjustable>
            )}
        </Lienzo>
    );
}

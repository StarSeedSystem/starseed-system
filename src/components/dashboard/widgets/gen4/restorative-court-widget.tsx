'use client';

// ════════════════════════════════════════════════════════════════
// RestorativeCourtWidget — Círculos de Paz (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Justicia restaurativa REAL de la red: los casos de mediación del
// Área Política (entity_state «gov:mediation-cases», con espejo local
// para verlos al instante y sin red). Cada caso es un círculo: sus
// participantes alrededor y el camino (solicitud → facilitación →
// círculo → acuerdo) encendido hasta donde ha llegado. Se pasa de un
// caso a otro y se puede pedir un Círculo de Paz aquí mismo (título y
// participantes); el resto del proceso vive en /network/politics.
// Lectura de la nube: una vez cada 10 min y solo a la vista.
// Estados honestos: cargando (primer vistazo), vacío (ningún círculo
// abierto: pedir el primero) y error (la nube no respondió: se ve el
// espejo local y se dice).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, HandHeart, Plus, Scale, X } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, Rot, tinta } from "../gen5/_catalogo/piezas";
import { useCompartido } from "../gen5/_catalogo/recurso";
import { ETAPAS, abierto, etapaDe, leerEspejo, normalizarCasos, ordenarCasos, participantesDe, pasoDe, type Caso } from "./restorative-court-partes";

const TTL_MS = 10 * 60_000;

/** El módulo del Área Política pesa: se carga una sola vez y solo cuando hace falta. */
let moduloPolitica: Promise<typeof import("@/lib/governance/political")> | null = null;
const politica = () => (moduloPolitica ??= import("@/lib/governance/political"));

function Circulo({ D, caso, l }: { D: number; caso: Caso | null; l: EstadoLienzo }) {
    const id = useIdSvg("paz");
    const c = D / 2, R = D * 0.44, Rp = D * 0.3;
    const paso = caso ? pasoDe(caso.stage) : -1;
    const et = caso ? etapaDe(caso.stage) : null;
    const ps = caso?.participants.slice(0, 10) ?? [];
    const arco = (i: number) => {
        const a0 = (i / 4) * Math.PI * 2 - Math.PI / 2 + 0.07, a1 = ((i + 1) / 4) * Math.PI * 2 - Math.PI / 2 - 0.07;
        const p = (a: number) => `${(c + Math.cos(a) * R).toFixed(2)} ${(c + Math.sin(a) * R).toFixed(2)}`;
        return `M${p(a0)}A${R} ${R} 0 0 1 ${p(a1)}`;
    };
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-f`} cx="50%" cy="45%" r="60%">
                    <stop offset="0%" stopColor={conAlfa(et?.color ?? l.acento2, 0.3)} />
                    <stop offset="100%" stopColor={conAlfa(et?.color ?? l.acento2, 0)} />
                </radialGradient>
            </defs>
            <circle cx={c} cy={c} r={Rp * 0.95} fill={`url(#${id}-f)`} />
            {/* el camino del círculo: cuatro tramos */}
            {ETAPAS.map((e, i) => (
                <path key={e.id} d={arco(i)} fill="none" stroke={i <= paso ? (caso?.stage === "sin_acuerdo" && i === 3 ? "#DC143C" : e.color) : "#ffffff"}
                    strokeOpacity={i <= paso ? 0.9 : 0.1} strokeWidth={Math.max(3, D * 0.028)} strokeLinecap="round" />
            ))}
            {/* participantes sentados en círculo */}
            {(ps.length ? ps : Array.from({ length: 6 }, () => "")).map((p, i, arr) => {
                const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
                const x = c + Math.cos(a) * Rp, y = c + Math.sin(a) * Rp, r = Math.max(5, D * 0.045);
                return <circle key={i} cx={x} cy={y} r={r} fill={p ? conAlfa(l.acento2, 0.35) : "none"} stroke={p ? tinta(l.acento2, 0.2) : conAlfa("#ffffff", 0.18)} strokeWidth={1.2} strokeDasharray={p ? undefined : "2 2"} />;
            })}
            {/* la pieza de la palabra en el centro */}
            <circle cx={c} cy={c} r={D * 0.06} fill={et?.color ?? conAlfa("#ffffff", 0.3)} opacity={caso ? 0.95 : 0.4}
                className={caso && abierto(caso) && l.animar ? "ss-respirar" : undefined} style={{ ["--ss-dur" as string]: "5s", transformBox: "fill-box", transformOrigin: "center" }} />
        </svg>
    );
}

export function RestorativeCourtWidget() {
    const l = useLienzo("#dc143c", "#23d5ab");
    const [espejo, setEspejo] = React.useState<Caso[] | null>(null);
    const nube = useCompartido<{ casos: Caso[]; local: boolean }>("mediacion:red", TTL_MS, async () => {
        const m = await politica();
        const r = await m.loadMediationCases();
        return { casos: normalizarCasos(r.list), local: r.degraded };
    }, l.visible, { persistir: false });
    const [i, setI] = React.useState(0);
    const [pidiendo, setPidiendo] = React.useState(false);
    const [titulo, setTitulo] = React.useState("");
    const [quienes, setQuienes] = React.useState("");
    const [aviso, setAviso] = React.useState<string | null>(null);
    const [enviando, setEnviando] = React.useState(false);

    React.useEffect(() => { setEspejo(leerEspejo()); }, [nube.en]);
    // La lectura de la red reescribe el espejo local; lo recién pedido aquí vive en el espejo
    // antes de volver a leer la red, así que se unen por id (el espejo manda).
    const casos = React.useMemo(() => {
        const porId = new Map<string, Caso>();
        for (const c of nube.datos?.casos ?? []) porId.set(c.id, c);
        for (const c of espejo ?? []) porId.set(c.id, c);
        return ordenarCasos([...porId.values()]);
    }, [nube.datos, espejo]);
    const soloLocal = !!nube.error || !!nube.datos?.local;
    const abiertos = casos.filter(abierto);
    const acuerdos = casos.filter((c) => c.stage === "acuerdo").length;
    const caso = casos.length ? casos[Math.min(i, casos.length - 1)] : null;

    const pedir = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titulo.trim() || enviando) return;
        setEnviando(true);
        setAviso(null);
        try {
            const m = await politica();
            const r = await m.createMediationCase({ title: titulo, description: "", participants: participantesDe(quienes) });
            if (!r.ok) { setAviso(r.error ?? "No se pudo pedir el círculo."); return; }
            setAviso(r.degraded ? "Pedido y guardado en este dispositivo; se subirá a la red cuando responda." : "Círculo de Paz pedido. Un facilitador lo acogerá.");
            setTitulo(""); setQuienes(""); setPidiendo(false); setI(0);
            setEspejo(leerEspejo());
            nube.recargar();
        } catch {
            setAviso("No se pudo pedir el círculo ahora (error de conexión).");
        } finally {
            setEnviando(false);
        }
    };

    const et = caso ? etapaDe(caso.stage) : null;
    const etiqueta = espejo === null ? "Círculos de Paz: cargando los casos"
        : `Círculos de Paz: ${abiertos.length} abierto${abiertos.length === 1 ? "" : "s"} y ${acuerdos} con acuerdo.${caso ? ` «${caso.title}»: ${et!.largo.toLowerCase()}.` : ""}`;

    if (espejo === null) {
        return (
            <Lienzo l={l} titulo="Círculos de Paz" icono={HandHeart} etiqueta={etiqueta}>
                <CargandoSilueta color={l.acento2} etiqueta="Cargando los casos…" />
            </Lienzo>
        );
    }

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Círculos de Paz" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center"><Circulo D={l.lado - 10} caso={abiertos[0] ?? null} l={l} /></div>
            </Lienzo>
        );
    }

    const formulario = (
        <form onSubmit={pedir} className="flex min-w-0 flex-col gap-1.5" aria-label="Pedir un Círculo de Paz">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="¿Qué conflicto quieres sanar?" aria-label="Título del caso"
                className="ss-redondo min-w-0 rounded-full bg-white/[0.06] px-3 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }} />
            <input value={quienes} onChange={(e) => setQuienes(e.target.value)} placeholder="Participantes, separados por comas" aria-label="Participantes"
                className="ss-redondo min-w-0 rounded-full bg-white/[0.06] px-3 text-[12.5px] text-white placeholder:text-white/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40" style={{ minHeight: l.toque }} />
            <div className="flex gap-1.5">
                <Accion color={l.acento2} solida alto={l.toque} type="submit" disabled={!titulo.trim() || enviando} icono={HandHeart}>{enviando ? "Pidiendo…" : "Pedir círculo"}</Accion>
                <Accion color="#ffffff" alto={l.toque} soloIcono icono={X} onClick={() => setPidiendo(false)} etiqueta="Cancelar">Cancelar</Accion>
            </div>
        </form>
    );
    const botonPedir = <Accion color={l.acento2} alto={l.toque} icono={Plus} onClick={() => { setAviso(null); setPidiendo(true); }} etiqueta="Pedir un Círculo de Paz">Pedir círculo</Accion>;
    const avisos = (
        <>
            {aviso && <p role="status" className="text-[11.5px] text-white/70">{aviso}</p>}
            {soloLocal && casos.length > 0 && (l.base === "l" || l.base === "xl") && (
                <p className="text-[11px] text-amber-200/80">{nube.error ? "Sin conexión con la red (error): ves la copia de este dispositivo." : "Casos guardados en este dispositivo: la red aún no los devolvió."}</p>
            )}
        </>
    );

    if (l.base === "s") {
        return (
            <Lienzo l={l} titulo="Círculos de Paz" etiqueta={etiqueta} sinCabecera>
                <Link href="/network/politics" className="flex h-full cursor-pointer flex-col items-center justify-center gap-1" aria-label={`Abrir los Círculos de Paz: ${abiertos.length} abiertos`}>
                    <Circulo D={Math.max(70, Math.min(l.ancho - 20, l.alto - 44))} caso={abiertos[0] ?? null} l={l} />
                    <span className="max-w-full truncate text-[12px] text-white/80">{abiertos.length ? `${abiertos.length} abierto${abiertos.length === 1 ? "" : "s"}` : "Sin círculos abiertos"}</span>
                </Link>
            </Lienzo>
        );
    }

    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.1;
    const cab = 52;
    const D = fila ? Math.max(90, Math.min(l.alto - cab - 20, l.ancho * (l.horizontal ? 0.24 : 0.38))) : Math.max(90, Math.min(l.ancho * 0.5, (l.alto - cab) * 0.36));

    const botonNav = l.tactil || l.tv ? l.toque : 28;
    const ficha = caso ? (
        <div className="min-w-0">
            <div className="flex items-center gap-1.5">
                <Rot color={tinta(et!.color, 0.2)}>{et!.corto}</Rot>
                {casos.length > 1 && (
                    <span className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => setI((x) => (x - 1 + casos.length) % casos.length)} aria-label="Caso anterior" style={{ width: botonNav, height: botonNav }} className="ss-redondo grid cursor-pointer place-items-center rounded-full text-white/75 transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"><ChevronLeft className="size-4" /></button>
                        <span className="text-[11px] tabular-nums text-white/50">{Math.min(i, casos.length - 1) + 1}/{casos.length}</span>
                        <button type="button" onClick={() => setI((x) => (x + 1) % casos.length)} aria-label="Caso siguiente" style={{ width: botonNav, height: botonNav }} className="ss-redondo grid cursor-pointer place-items-center rounded-full text-white/75 transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"><ChevronRight className="size-4" /></button>
                    </span>
                )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-[14.5px] font-medium leading-snug text-white" title={caso.title}>{caso.title}</p>
            <p className="truncate text-[11.5px] text-white/55" title={`${caso.participants.join(", ")}${caso.facilitator ? ` · facilita ${caso.facilitator}` : ""}`}>
                {caso.participants.length} participante{caso.participants.length === 1 ? "" : "s"}{caso.facilitator ? ` · facilita ${caso.facilitator}` : ""}
            </p>
            {l.base === "xl" && caso.updates.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5" aria-label="Últimas notas del caso">
                    {caso.updates.slice(-2).map((u, k) => <li key={k} className="line-clamp-1 text-[11.5px] text-white/60">«{u.note}»{u.byLabel ? ` · ${u.byLabel}` : ""}</li>)}
                </ul>
            )}
        </div>
    ) : (
        <div role="status" className="min-w-0">
            <p className="text-[14px] font-medium text-white/90">Ningún círculo abierto</p>
            <p className="line-clamp-3 text-[11.5px] leading-snug text-white/55">Los conflictos se resuelven con mediación, nunca con castigos.</p>
        </div>
    );
    const resumen = grande && casos.length > 0 && (
        <p className="text-[11.5px] text-white/55"><span className="tabular-nums text-white/85">{abiertos.length}</span> abiertos · <span className="tabular-nums text-white/85">{acuerdos}</span> con acuerdo</p>
    );
    const pie = (
        <div className="flex flex-wrap gap-1.5">
            {botonPedir}
            {(grande || l.ancho >= 520) && <Accion color={l.acento} alto={l.toque} icono={Scale} href="/network/politics" soloIcono={l.ancho < 460} etiqueta="Abrir el Área Política (pestaña Judicial)">Política</Accion>}
        </div>
    );

    const subtitulo = l.ancho >= 260 ? "Justicia restaurativa de la red" : undefined;
    const principal = (Dc: number, enFila: boolean) => (
        <div className={`flex min-h-0 gap-4 ${enFila ? "flex-row items-center" : "flex-col items-center"}`} style={{ justifyContent: "safe center" }}>
            <Circulo D={Dc} caso={caso} l={l} />
            <div className={`flex min-h-0 min-w-0 flex-col justify-center gap-2.5 ${enFila ? "flex-1" : "w-full"}`}>
                {pidiendo ? formulario : <>{ficha}{resumen}{pie}</>}
                {avisos}
            </div>
        </div>
    );

    if (l.base === "xl" && !l.horizontal) {
        const Dx = Math.max(110, Math.min(l.ancho * 0.36, (l.alto - cab) * 0.44));
        return (
            <Lienzo l={l} titulo="Círculos de Paz" subtitulo={subtitulo} icono={HandHeart} etiqueta={etiqueta}>
                <div className="flex h-full min-h-0 flex-col gap-3">
                    {principal(Dx, true)}
                    {casos.length > 1 ? (
                        <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto" aria-label="Todos los casos">
                            {casos.slice(0, 6).map((c, k) => {
                                const e = etapaDe(c.stage);
                                const activo = k === Math.min(i, casos.length - 1);
                                return (
                                    <li key={c.id}>
                                        <button type="button" onClick={() => setI(k)} aria-pressed={activo} title={c.title}
                                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                                            style={{ minHeight: l.toque, background: activo ? conAlfa(e.color, 0.1) : undefined }}>
                                            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{c.title}</span>
                                            <span className="shrink-0 text-[11px] text-white/50">{e.corto}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <ol className="grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label="Cómo es un Círculo de Paz">
                            {ETAPAS.map((e, k) => (
                                <li key={e.id} className="flex min-w-0 items-center gap-2 text-[11.5px] text-white/60">
                                    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] tabular-nums" style={{ background: conAlfa(e.color, 0.18), color: tinta(e.color, 0.3) }}>{k + 1}</span>
                                    <span className="truncate">{e.largo}</span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </Lienzo>
        );
    }

    return (
        <Lienzo l={l} titulo="Círculos de Paz" subtitulo={subtitulo} icono={HandHeart} etiqueta={etiqueta}>
            <div className="flex h-full min-h-0 flex-col justify-center">{principal(D, fila)}</div>
        </Lienzo>
    );
}

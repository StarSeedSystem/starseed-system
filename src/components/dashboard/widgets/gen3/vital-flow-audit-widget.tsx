'use client';

// ════════════════════════════════════════════════════════════════
// Flujo vital · auditoría de mandatos — qué se hizo con lo que decidimos (Ola 0929, paquete B).
// ----------------------------------------------------------------
// Antes: un «tesoro» con flujos y cifras inventados. Ahora, lo que CLAUDE.md §6 pide: poder
// público transparente. Las decisiones APROBADAS del Ágora (mismas filas reales que el Ágora,
// misma lectura compartida: cero peticiones propias) con su ejecución en el Ejecutivo —
// pendiente, en ejecución o completada, progreso, responsable e informes de avance—. Asumir un
// mandato sin responsable es real (`assignResponsible`), y el Ejecutivo se abre en
// /network/politics. El flujo se dibuja como tres estanques que se llenan con lo que se cumple.
//
//   micro      → anillo: cuántos mandatos se han cumplido.
//   s          → los tres estanques con sus cifras.
//   m          → + el mandato más atrasado.
//   panorámico → estanques a la izquierda, mandatos a la derecha.   torre → en columna.
//   l          → estanques y la lista de mandatos con progreso y responsable.
//   xl         → + informes, «Asumir el mandato» y el Ejecutivo.
// Estados honestos: cargando, error con reintento y vacío (aún no se ha aprobado nada).
// ════════════════════════════════════════════════════════════════

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Waves, RefreshCw, ExternalLink, UserCheck } from "lucide-react";
import { WidgetShell, WidgetEmptyState, WidgetErrorState, WidgetSkeleton, useMarcoUnificado, timeAgo, type ElementSize } from "../../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { cn } from "@/lib/utils";
import { invalidarCompartido, leerCompartido, useDatoCompartido, type ResultadoDato } from "../gen2/_paquete-b/cache-compartida";
import { cargarAgora, type DatosAgora, type EstadoMandato, type PropuestaViva } from "../gen2/_paquete-b/datos-civicos";
import { AccionB, AnilloB, RaizB, RotuloB, estilosB, tintaB, useLienzoB, useVisibleB, type LienzoB } from "../gen2/_paquete-b/piezas-b";

const FAMILIA = { acento: "#dc143c", acento2: "#23d5ab" };
export const COLOR_MANDATO: Record<EstadoMandato, string> = { pendiente: "#f59e0b", en_ejecucion: "#38bdf8", completado: "#10b981" };
const ETIQUETA_MANDATO: Record<EstadoMandato, string> = { pendiente: "Pendientes", en_ejecucion: "En ejecución", completado: "Cumplidos" };

/** Mandatos (aprobadas con su ejecución) y su recuento por estado. PURO. */
export function mandatos(lista: PropuestaViva[]): { lista: PropuestaViva[]; por: Record<EstadoMandato, number> } {
    const m = lista.filter((p) => p.ejecucion);
    const por: Record<EstadoMandato, number> = { pendiente: 0, en_ejecucion: 0, completado: 0 };
    for (const p of m) por[p.ejecucion!.estado] += 1;
    const orden: Record<EstadoMandato, number> = { pendiente: 0, en_ejecucion: 1, completado: 2 };
    return { lista: [...m].sort((a, b) => orden[a.ejecucion!.estado] - orden[b.ejecucion!.estado] || (a.resuelta ?? a.creada) - (b.resuelta ?? b.creada)), por };
}

export function VitalFlowAuditWidget() {
    const marco = useMarcoUnificado();
    const { uid, ready } = useCurrentUid();
    const clave = ready ? `agora.v1.${uid ?? "anon"}` : null;
    const cargar = useCallback(() => cargarAgora(uid), [uid]);
    const datos = useDatoCompartido<DatosAgora>(clave, cargar);
    return (
        <WidgetShell
            title="Flujo vital"
            subtitle="Qué se hizo con lo que decidimos"
            icon={Waves}
            bare={marco?.base === "micro"}
            actions={
                <button type="button" onClick={datos.recargar} aria-label="Actualizar los mandatos"
                    className="grid size-7 cursor-pointer place-items-center rounded-full ss-redondo text-white/70 transition-colors hover:text-white">
                    <RefreshCw className={cn("size-3.5", datos.estado === "cargando" && "animate-spin motion-reduce:animate-none")} aria-hidden />
                </button>
            }
        >
            {(size) => <Cuerpo size={size} uid={uid} datos={datos} clave={clave} cargar={cargar} />}
        </WidgetShell>
    );
}

function Cuerpo({ size, uid, datos, clave, cargar }: { size: ElementSize; uid: string | null; datos: ResultadoDato<DatosAgora>; clave: string | null; cargar: () => Promise<DatosAgora> }) {
    const lienzo = useLienzoB(size, FAMILIA);
    const ref = useRef<HTMLDivElement>(null);
    const visible = useVisibleB(ref);
    const m = useMemo(() => mandatos(datos.dato?.propuestas ?? []), [datos.dato]);
    const [enCurso, setEnCurso] = useState<string | null>(null);
    const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null);
    const asumir = useCallback((p: PropuestaViva) => {
        if (!uid) { setAviso({ texto: "Entra en tu cuenta para asumir un mandato.", ok: false }); return; }
        setEnCurso(p.id);
        void (async () => {
            try {
                const { assignResponsible } = await import("@/lib/governance/political");
                const r = await assignResponsible(p.id);
                if (!r.ok) throw new Error(r.error || "No se pudo asumir el mandato.");
                setAviso({ texto: `Asumes «${p.titulo}». Informa de su avance en el Ejecutivo.`, ok: true });
                if (clave) { invalidarCompartido(clave); void leerCompartido(clave, cargar); }
            } catch (e) {
                setAviso({ texto: e instanceof Error ? e.message : "No se pudo asumir el mandato.", ok: false });
            } finally { setEnCurso(null); }
        })();
    }, [uid, clave, cargar]);

    let contenido: ReactNode;
    if (!datos.dato) {
        contenido = datos.estado === "error"
            ? <WidgetErrorState message={datos.error ?? "No se pudieron leer los mandatos."} onRetry={datos.recargar} />
            : <WidgetSkeleton variant={lienzo.base === "micro" ? "rings" : "block"} />;
    } else if (m.lista.length === 0) {
        contenido = lienzo.base === "micro"
            ? <p className="grid h-full place-items-center text-center text-[11px] text-white/60">sin mandatos</p>
            : <WidgetEmptyState icon={Waves} title="Aún no hay mandatos" message="Cuando el Ágora apruebe una decisión, aquí se audita cómo se cumple." actionLabel="Ir al Ágora" actionHref="/network/politics" accent={lienzo.acento} />;
    } else {
        contenido = <Composicion m={m} lienzo={lienzo} asumir={asumir} enCurso={enCurso} aviso={aviso} />;
    }
    return <RaizB ref={ref} lienzo={lienzo} visible={visible}>{contenido}</RaizB>;
}

function Composicion({ m, lienzo, asumir, enCurso, aviso }: {
    m: ReturnType<typeof mandatos>; lienzo: LienzoB; asumir: (p: PropuestaViva) => void; enCurso: string | null; aviso: { texto: string; ok: boolean } | null;
}) {
    const b = lienzo.base;
    const total = m.lista.length;
    const frase = `${m.por.completado} de ${total} mandatos cumplidos; ${m.por.en_ejecucion} en ejecución y ${m.por.pendiente} pendientes`;
    if (b === "micro") {
        return (
            <Link href="/network/politics" aria-label={`${frase}. Abrir el Ejecutivo`} title={frase} className={cn(estilosB.foco, "grid h-full place-items-center rounded-[14px]")}>
                <AnilloB fraccion={total ? m.por.completado / total : 0} lado={72} color={COLOR_MANDATO.completado}>
                    <text x={36} y={32} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={20} fontWeight={300}>{m.por.completado}/{total}</text>
                    <text x={36} y={50} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.6)" fontSize={8.5} fontWeight={600} letterSpacing=".08em">CUMPLIDOS</text>
                </AnilloB>
            </Link>
        );
    }
    const estanques = <Estanques por={m.por} lienzo={lienzo} etiqueta={frase} />;
    const lista = (max: number, detalle: boolean) => (
        <ul className="flex min-h-0 flex-col gap-1.5" aria-label="Mandatos">
            {m.lista.slice(0, max).map((p) => {
                const e = p.ejecucion!;
                const color = COLOR_MANDATO[e.estado];
                return (
                    <li key={p.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 text-[12px] font-semibold text-white/85 line-clamp-1" title={p.titulo}>{p.titulo}</span>
                            <span className="shrink-0 text-[11px] tabular-nums" style={{ color: tintaB(color, 0.3) }}>{e.progreso} %</span>
                        </div>
                        <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="img" aria-label={`${p.titulo}: ${e.progreso} %, ${ETIQUETA_MANDATO[e.estado].toLowerCase()}`}>
                            <span className={cn("block h-full rounded-full", estilosB.crecer)} style={{ width: `${Math.max(2, e.progreso)}%`, background: color }} />
                        </span>
                        {detalle && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/50">
                                <span>{e.responsable ? `responsable: ${e.responsable}` : "sin responsable"}</span>
                                <span aria-hidden>·</span>
                                <span>{e.informes ? `${e.informes} ${e.informes === 1 ? "informe" : "informes"}${e.ultimoInforme ? `, último hace ${timeAgo(e.ultimoInforme)}` : ""}` : "sin informes"}</span>
                                {!e.responsable && e.estado !== "completado" && (
                                    <AccionB onClick={() => asumir(p)} disabled={enCurso === p.id} icono={UserCheck} color={lienzo.acento} tactil={lienzo.tactil} className="ml-auto" aria-label={`Asumir el mandato: ${p.titulo}`}>Asumir</AccionB>
                                )}
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
    const ejecutivo = <AccionB href="/network/politics" icono={ExternalLink} color={lienzo.acento2} tactil={lienzo.tactil}>Abrir el Ejecutivo</AccionB>;
    const avisoNodo = aviso && <p role="status" className="text-[11px]" style={{ color: aviso.ok ? "#6ee7b7" : "#fda4af" }}>{aviso.texto}</p>;
    if (b === "s") return <div className="flex h-full min-h-0 flex-col justify-center">{estanques}</div>;
    if (lienzo.clase === "panoramico") {
        return <div className="grid h-full min-h-0 items-center gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)" }}>{estanques}{lista(3, false)}</div>;
    }
    if (b === "m" && lienzo.clase !== "torre") {
        return <div className="flex h-full min-h-0 flex-col gap-2">{estanques}{lista(1, false)}</div>;
    }
    if (lienzo.clase === "torre" || b === "l") {
        return <div className="flex h-full min-h-0 flex-col gap-2.5">{estanques}{lista(b === "l" ? 3 : 4, b === "l")}{avisoNodo}<div className="mt-auto">{ejecutivo}</div></div>;
    }
    return (
        <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)" }}>
            <div className="flex min-h-0 flex-col gap-3">
                {estanques}
                <p className="text-[11px] leading-relaxed text-white/55">Transparente en el ejercicio del poder público: cada decisión aprobada tiene su mandato, su responsable y sus informes a la vista.</p>
            </div>
            <div className="flex min-h-0 flex-col gap-2.5 border-l border-white/[0.08] pl-4">
                <RotuloB>Mandatos · lo más atrasado primero</RotuloB>
                {lista(6, true)}
                {avisoNodo}
                <div className="mt-auto">{ejecutivo}</div>
            </div>
        </div>
    );
}

/** Tres estanques unidos por el cauce: pendiente → en ejecución → cumplido; el agua es la proporción. */
function Estanques({ por, lienzo, etiqueta }: { por: Record<EstadoMandato, number>; lienzo: LienzoB; etiqueta: string }) {
    const id = useId().replace(/:/g, "");
    const total = Math.max(1, por.pendiente + por.en_ejecucion + por.completado);
    const estados: EstadoMandato[] = ["pendiente", "en_ejecucion", "completado"];
    const vivo = lienzo.nivel !== "ligero";
    return (
        <div className="flex flex-col gap-1">
            <svg viewBox="0 0 180 64" className="block h-auto w-full" role="img" aria-label={etiqueta}>
                <path d="M30 36 H150" stroke="#fff" strokeOpacity={0.12} strokeWidth={6} strokeLinecap="round" />
                <path d="M30 36 H150" stroke={lienzo.acento2} strokeOpacity={0.5} strokeWidth={1.4} className={vivo ? estilosB.flujo : undefined} />
                {estados.map((e, i) => {
                    const cx = 30 + i * 60, r = 22;
                    const nivel = por[e] / total;
                    const altura = 2 * r * nivel;
                    return (
                        <g key={e}>
                            <defs>
                                <clipPath id={`c${id}${i}`}><circle cx={cx} cy={36} r={r} /></clipPath>
                            </defs>
                            <circle cx={cx} cy={36} r={r} fill="#0b1020" fillOpacity={0.6} stroke={COLOR_MANDATO[e]} strokeOpacity={0.7} strokeWidth={1.2} />
                            <rect x={cx - r} y={36 + r - altura} width={2 * r} height={altura} fill={COLOR_MANDATO[e]} fillOpacity={0.55} clipPath={`url(#c${id}${i})`} className={estilosB.entrar} />
                            <text x={cx} y={38} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={14} fontWeight={300} style={{ fontVariantNumeric: "tabular-nums" }}>{por[e]}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="grid grid-cols-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em]" aria-hidden>
                {estados.map((e) => <span key={e} style={{ color: tintaB(COLOR_MANDATO[e], 0.3) }}>{ETIQUETA_MANDATO[e]}</span>)}
            </div>
        </div>
    );
}

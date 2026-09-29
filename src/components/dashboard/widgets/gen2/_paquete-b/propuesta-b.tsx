"use client";
/**
 * Propuestas del Ágora (paquete B · Ola 0929): la fila con su anillo de tiempo, el detalle con
 * el reparto de voces y los botones de voto REALES (motor `castVote`, voto público y
 * modificable mientras la votación siga abierta).
 */
import * as React from "react";
import { ArrowLeft, Check, ExternalLink, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/components/dashboard/kit/primitives";
import { invalidarCompartido, leerCompartido } from "./cache-compartida";
import {
    colorEstado, conVotoLocal, etiquetaAmbito, etiquetaEstado, etiquetaOpcion, reparto, tiempoDe,
    type PropuestaViva,
} from "./datos-civicos";
import { AccionB, AnilloB, RepartoB, RotuloB, colorOpcion, estilosB, haloB, tintaB, type LienzoB } from "./piezas-b";

export const AMBAR_URGENTE = "#FFBF00";

/** Color del anillo de una propuesta: su estado si cerró; ámbar si cierra en < 6 h; si no, el acento. */
export function colorAnillo(p: PropuestaViva, ahora: number, acento: string): string {
    if (p.estado !== "open") return colorEstado(p.estado);
    return tiempoDe(p, ahora).urgente ? AMBAR_URGENTE : tintaB(acento, 0.2);
}

// ── Voto ────────────────────────────────────────────────────────────────────

export interface VotoB {
    /** Voto emitido en esta sesión (optimista) por propuesta. */
    locales: Record<string, string>;
    enviando: string | null;
    aviso: { id: string; texto: string; ok: boolean } | null;
    votar: (p: PropuestaViva, opcion: string) => void;
    /** La propuesta con tu voto local aplicado. */
    aplicar: (p: PropuestaViva) => PropuestaViva;
}

export function useVotoB(clave: string | null, uid: string | null, cargar: () => Promise<unknown>): VotoB {
    const [locales, setLocales] = React.useState<Record<string, string>>({});
    const [enviando, setEnviando] = React.useState<string | null>(null);
    const [aviso, setAviso] = React.useState<VotoB["aviso"]>(null);

    const votar = React.useCallback((p: PropuestaViva, opcion: string) => {
        if (!uid) { setAviso({ id: p.id, texto: "Entra en tu cuenta para votar.", ok: false }); return; }
        if (p.estado !== "open") return;
        const anterior = locales[p.id];
        setLocales((m) => ({ ...m, [p.id]: opcion }));
        setEnviando(p.id);
        setAviso(null);
        void (async () => {
            try {
                const { castVote } = await import("@/lib/governance/engine");
                const r = await castVote(p.id, opcion);
                if (!r.ok) throw new Error(r.error || "No se pudo registrar tu voto.");
                setAviso({ id: p.id, texto: "Voto registrado. Es público y puedes cambiarlo mientras siga abierta.", ok: true });
                if (clave) { invalidarCompartido(clave); void leerCompartido(clave, cargar); }
            } catch (e) {
                setLocales((m) => {
                    const n = { ...m };
                    if (anterior) n[p.id] = anterior; else delete n[p.id];
                    return n;
                });
                setAviso({ id: p.id, texto: e instanceof Error ? e.message : "No se pudo registrar tu voto.", ok: false });
            } finally {
                setEnviando(null);
            }
        })();
    }, [uid, locales, clave, cargar]);

    const aplicar = React.useCallback((p: PropuestaViva) => conVotoLocal(p, locales[p.id]), [locales]);
    return { locales, enviando, aviso, votar, aplicar };
}

// ── Fila ────────────────────────────────────────────────────────────────────

export function FilaPropuestaB({ p, ahora, lienzo, onAbrir, seleccionada, conReparto = true, ladoAnillo }: {
    p: PropuestaViva;
    ahora: number;
    lienzo: LienzoB;
    onAbrir?: () => void;
    seleccionada?: boolean;
    conReparto?: boolean;
    ladoAnillo?: number;
}) {
    const t = tiempoDe(p, ahora);
    const color = colorAnillo(p, ahora, lienzo.acento);
    const lado = ladoAnillo ?? (lienzo.tv ? 40 : 32);
    const miEtiqueta = etiquetaOpcion(p, p.miVoto);
    const partes = reparto(p).map((r, i) => ({ ...r, color: colorOpcion(r.id, i) }));
    const cuando = t.abierta ? `quedan ${t.texto}` : etiquetaEstado(p.estado);
    const etiqueta = `${p.titulo}. ${cuando}. ${p.participantes} ${p.participantes === 1 ? "voz" : "voces"}. ${miEtiqueta ? `Tu voto: ${miEtiqueta}` : "Sin tu voto"}.`;
    return (
        <button
            type="button"
            onClick={onAbrir}
            aria-label={`${etiqueta} Abrir detalle`}
            aria-current={seleccionada ? "true" : undefined}
            title={p.titulo}
            className={cn(estilosB.foco, estilosB.fila, "flex w-full cursor-pointer items-center gap-2.5 rounded-[14px] px-1.5 text-left", lienzo.tactil ? "min-h-11 py-2" : "py-1.5")}
            style={seleccionada ? haloB(lienzo.acento, 0.1, 0.3) : undefined}
        >
            <AnilloB fraccion={t.abierta ? t.fraccion : 1} lado={lado} color={color} urgente={t.urgente}>
                {p.miVoto && <circle cx={lado / 2} cy={lado / 2} r={lado * 0.16} fill={colorOpcion(p.miVoto, p.opciones.findIndex((o) => o.id === p.miVoto))} />}
            </AnilloB>
            <span className="min-w-0 flex-1">
                <span className={cn("block font-semibold leading-snug text-white/90 line-clamp-1", lienzo.tv ? "text-[16px]" : "text-[13px]")}>{p.titulo}</span>
                <span className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 tabular-nums text-white/55", lienzo.tv ? "text-[13px]" : "text-[11px]")}>
                    <span style={{ color: t.urgente ? AMBAR_URGENTE : p.estado !== "open" ? tintaB(color, 0.3) : undefined }}>{cuando}</span>
                    <span aria-hidden>·</span>
                    <span>{p.participantes} {p.participantes === 1 ? "voz" : "voces"}</span>
                    {p.estado === "open" && (
                        <>
                            <span aria-hidden>·</span>
                            {miEtiqueta ? <span className="font-semibold text-white/80">Tu voto: {miEtiqueta}</span> : <span>sin tu voto</span>}
                        </>
                    )}
                </span>
                {conReparto && p.participantes > 0 && (
                    <span className="mt-1 block"><RepartoB partes={partes} alto={3} etiqueta={partes.map((x) => `${x.etiqueta} ${Math.round(x.pct * 100)} %`).join(", ")} /></span>
                )}
            </span>
        </button>
    );
}

// ── Detalle ─────────────────────────────────────────────────────────────────

export function DetallePropuestaB({ p, ahora, lienzo, uid, voto, onVolver, grande }: {
    p: PropuestaViva;
    ahora: number;
    lienzo: LienzoB;
    uid: string | null;
    voto: VotoB;
    onVolver?: () => void;
    grande?: boolean;
}) {
    const t = tiempoDe(p, ahora);
    const color = colorAnillo(p, ahora, lienzo.acento);
    const partes = reparto(p).map((r, i) => ({ ...r, color: colorOpcion(r.id, i) }));
    const lado = grande ? (lienzo.tv ? 92 : 76) : lienzo.tv ? 70 : 58;
    const muchas = p.opciones.length > 3;
    const aviso = voto.aviso && voto.aviso.id === p.id ? voto.aviso : null;
    const id = React.useId().replace(/:/g, "");
    return (
        <div className={cn(estilosB.entrar, "flex h-full min-h-0 flex-col gap-2.5")}>
            <div className="flex items-center gap-2">
                {onVolver && (
                    <button type="button" onClick={onVolver} className={cn(estilosB.foco, "inline-flex cursor-pointer items-center gap-1 rounded-full ss-redondo px-2 text-[12px] font-semibold text-white/70 hover:text-white", lienzo.tactil ? "min-h-11" : "min-h-7")} aria-label="Volver a la lista">
                        <ArrowLeft className="size-3.5" aria-hidden /> Volver
                    </button>
                )}
                <span className="ml-auto inline-flex items-center whitespace-nowrap rounded-full ss-redondo px-2 py-0.5 text-[11px] font-semibold" style={{ ...haloB(colorEstado(p.estado), 0.14, 0.45), color: tintaB(colorEstado(p.estado), 0.4) }}>
                    {etiquetaEstado(p.estado)}
                </span>
            </div>

            <div className="flex items-start gap-3">
                <AnilloB fraccion={t.abierta ? t.fraccion : 1} lado={lado} color={color} urgente={t.urgente} gradienteId={`g${id}`}
                    etiqueta={t.abierta ? `Quedan ${t.texto} de votación` : etiquetaEstado(p.estado)}>
                    <text x={lado / 2} y={lado / 2 - (t.abierta ? 3 : 0)} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontWeight={600} fontSize={lado * 0.2} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {t.abierta ? t.texto.split(" ").slice(0, 2).join(" ") : p.participantes}
                    </text>
                    <text x={lado / 2} y={lado / 2 + lado * 0.17} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,.55)" fontSize={Math.max(9, lado * 0.12)}>
                        {t.abierta ? "quedan" : p.participantes === 1 ? "voz" : "voces"}
                    </text>
                </AnilloB>
                <div className="min-w-0 flex-1">
                    <h4 className={cn("font-semibold leading-snug text-white line-clamp-3", lienzo.tv ? "text-[18px]" : grande ? "text-[16px]" : "text-[14px]")} title={p.titulo}>{p.titulo}</h4>
                    <p className="mt-0.5 text-[11px] text-white/55">
                        {etiquetaAmbito(p.ambito)}{p.ambitoRef ? ` · ${p.ambitoRef}` : ""} · abierta hace {timeAgo(p.creada)}
                    </p>
                </div>
            </div>

            {p.descripcion && (grande || lienzo.base !== "s") && (
                <p className={cn("text-[12px] leading-relaxed text-white/70", grande ? "line-clamp-4" : "line-clamp-2")} title={p.descripcion}>{p.descripcion}</p>
            )}

            <div className="flex flex-col gap-1.5">
                <RepartoB partes={partes} alto={grande ? 8 : 6} etiqueta={`Reparto de voces directas: ${partes.map((x) => `${x.etiqueta} ${x.n}`).join(", ")}`} />
                <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-white/65">
                    {partes.map((x) => (
                        <li key={x.id} className="inline-flex items-center gap-1">
                            <span className="size-2 rounded-full" style={{ background: x.color }} aria-hidden />
                            {x.etiqueta} <b className="font-semibold text-white/85">{x.n}</b>
                            {x.n > 0 && <span className="text-white/45">{Math.round(x.pct * 100)} %</span>}
                        </li>
                    ))}
                </ul>
                <p className="text-[11px] text-white/50">
                    Quórum {Math.min(p.participantes, p.minParticipantes)}/{p.minParticipantes} · gana con ≥ {p.umbral} %
                    {grande && " · voces directas; el peso delegado lo suma el servidor al sellar"}
                </p>
            </div>

            {p.estado === "open" && (
                <div className="mt-auto flex flex-col gap-1.5">
                    {!uid ? (
                        <AccionB href="/login" icono={LogIn} color={lienzo.acento} tono="llena" tactil={lienzo.tactil}>Entra para votar</AccionB>
                    ) : (
                        <div role="group" aria-label="Tu voto" className={cn("flex gap-1.5", muchas ? "flex-col" : "flex-wrap")}>
                            {p.opciones.map((o, i) => {
                                const elegido = p.miVoto === o.id;
                                const c = colorOpcion(o.id, i);
                                return (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => voto.votar(p, o.id)}
                                        disabled={voto.enviando === p.id}
                                        aria-pressed={elegido}
                                        className={cn(
                                            estilosB.foco,
                                            "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full ss-redondo px-3 font-semibold text-white transition-transform duration-200 hover:scale-[1.03] disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none",
                                            lienzo.tactil ? "min-h-11 text-[13px]" : "min-h-8 text-[12px]",
                                            muchas ? "w-full justify-start" : "flex-1",
                                        )}
                                        style={elegido ? haloB(c, 0.34, 0.8) : haloB(c, 0.1, 0.4)}
                                    >
                                        {elegido && <Check className="size-3.5" aria-hidden />}
                                        {o.etiqueta}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {aviso && <p role="status" className="text-[11px]" style={{ color: aviso.ok ? "#6ee7b7" : "#fda4af" }}>{aviso.texto}</p>}
                </div>
            )}

            <div className={cn("flex flex-wrap items-center gap-1.5", p.estado !== "open" && "mt-auto")}>
                <AccionB href="/network/politics" icono={ExternalLink} color={lienzo.acento2} tactil={lienzo.tactil}>Abrir en el Ágora</AccionB>
                {p.estado !== "open" && p.ganadora && (
                    <RotuloB color={tintaB(colorEstado(p.estado), 0.3)}>Ganó: {etiquetaOpcion(p, p.ganadora)}</RotuloB>
                )}
            </div>
        </div>
    );
}

"use client";

/*
 * PanelOperaciones — el corazón de Mi Genesis y de PoliGenesis (2026-10-10).
 * Chat con el agente (modelos gratuitos del OS por /api/genesis/proponer) → operaciones
 * propuestas con vista previa → aplicar con confirmación (o proponer a votación) → historial
 * con deshacer. Todo pasa por `validarOperacion` antes de aplicarse; el agente no ejecuta nada.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bot, Loader2, MessageSquareText, Send, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { aplicarOperacion, deshacerEntrada, type PuertosGenesis } from "@/lib/genesis/aplicar";
import { anotar, leerHistorial, marcarDeshecha, type DondeSeGuarda } from "@/lib/genesis/historial";
import { describirOperacion, validarOperacion, type Ambito, type EntradaGenesis, type ModoAplicacion, type Operacion } from "@/lib/genesis/operaciones";
import { contextoValidacion, type ContextoGenesis } from "@/lib/genesis/traductor";
import { TarjetaOperacion, type PropuestaVista } from "./tarjeta-operacion";
import { HistorialGenesis } from "./historial-genesis";

interface Mensaje {
    rol: "persona" | "agente" | "aviso";
    texto: string;
    modelo?: string;
}

export interface ContextoCargado {
    contexto: ContextoGenesis;
    paginasPropias?: string[];
}

export function PanelOperaciones({
    ambito,
    modo,
    motivoModo,
    puertos,
    cargarContexto,
    onProponer,
    puedeGestionar = true,
    sugerencias = [],
    atajos,
}: {
    ambito: Ambito;
    modo: ModoAplicacion;
    motivoModo: string;
    puertos: PuertosGenesis;
    cargarContexto: () => Promise<ContextoCargado>;
    onProponer?: (op: Operacion) => Promise<{ ok: true; id: string } | { ok: false; motivo: string }>;
    puedeGestionar?: boolean;
    sugerencias?: string[];
    /** Atajos sin IA: reciben una función que mete una operación en la lista de propuestas. */
    atajos?: (anadir: (bruto: unknown) => boolean, ctx: ContextoGenesis | null) => ReactNode;
}) {
    const [mensajes, setMensajes] = useState<Mensaje[]>([]);
    const [texto, setTexto] = useState("");
    const [pensando, setPensando] = useState(false);
    const [propuestas, setPropuestas] = useState<PropuestaVista[]>([]);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [deshaciendo, setDeshaciendo] = useState<string | null>(null);
    const [historial, setHistorial] = useState<{ entradas: EntradaGenesis[]; donde: DondeSeGuarda }>({ entradas: [], donde: "cuenta" });
    const [ctx, setCtx] = useState<ContextoCargado | null>(null);
    const contador = useRef(0);
    const claveAmbito = ambito.tipo === "persona" ? "persona" : ambito.entidad.id;

    const refrescar = useCallback(async () => {
        const [c, h] = await Promise.all([cargarContexto().catch(() => ({ contexto: {} })), leerHistorial(ambito)]);
        setCtx(c);
        setHistorial(h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cargarContexto, claveAmbito]);

    useEffect(() => {
        setPropuestas([]);
        setMensajes([]);
        void refrescar();
    }, [refrescar]);

    const validacion = useMemo(() => contextoValidacion(ambito, ctx?.contexto ?? {}), [ambito, ctx]);
    // La respuesta del agente llega tras un `await`: se valida con el contexto MÁS RECIENTE,
    // no con el que había cuando se pulsó «Pedir».
    const validacionRef = useRef(validacion);
    validacionRef.current = validacion;

    const anadir = useCallback(
        (bruto: unknown): boolean => {
            const v = validarOperacion(bruto, validacionRef.current);
            if (!v.ok) {
                toast.error(v.problemas.join(" "));
                return false;
            }
            setPropuestas((p) => [...p, { clave: `p${++contador.current}`, op: v.op, avisos: v.avisos }]);
            return true;
        },
        [],
    );

    const pedir = async () => {
        const mensaje = texto.trim();
        if (!mensaje || pensando) return;
        setTexto("");
        const historialChat = mensajes.filter((m) => m.rol !== "aviso").slice(-6).map((m) => ({ rol: m.rol, texto: m.texto }));
        setMensajes((m) => [...m, { rol: "persona", texto: mensaje }]);
        setPensando(true);
        try {
            const r = await fetch("/api/genesis/proponer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mensaje, ambito, contexto: ctx?.contexto ?? {}, historial: historialChat }),
            });
            const j = (await r.json().catch(() => ({}))) as {
                respuesta?: string;
                operaciones?: { op: Operacion; avisos: string[] }[];
                rechazadas?: { indice: number; problemas: string[] }[];
                modelo?: string;
                error?: string;
                intentos?: { carril: string; motivo: string }[];
            };
            if (!r.ok) {
                const detalle = j.intentos?.length ? ` (${j.intentos.map((i) => `${i.carril}: ${i.motivo}`).join(" · ")})` : "";
                setMensajes((m) => [...m, { rol: "aviso", texto: (j.error ?? `El agente no pudo contestar (HTTP ${r.status}).`) + detalle }]);
                return;
            }
            setMensajes((m) => [...m, { rol: "agente", texto: j.respuesta ?? "", modelo: j.modelo }]);
            for (const o of j.operaciones ?? []) anadir(o.op);
            if (j.rechazadas?.length) {
                setMensajes((m) => [
                    ...m,
                    { rol: "aviso", texto: `Descarté ${j.rechazadas!.length} propuesta(s) del agente que no pasaban la validación: ${j.rechazadas!.map((x) => x.problemas.join(" ")).join(" | ")}` },
                ]);
            }
        } catch {
            setMensajes((m) => [...m, { rol: "aviso", texto: "Sin conexión con el servidor del OS." }]);
        } finally {
            setPensando(false);
        }
    };

    const aplicar = async (p: PropuestaVista) => {
        setOcupado(p.clave);
        try {
            if (modo === "proponer") {
                if (!onProponer) return;
                const r = await onProponer(p.op);
                if (!r.ok) {
                    toast.error(r.motivo);
                    return;
                }
                await anotar({
                    id: puertos.nuevoId(),
                    at: puertos.ahora(),
                    ambito,
                    operacion: p.op,
                    titulo: describirOperacion(p.op, ambito).titulo,
                    estado: "propuesta",
                    inverso: null,
                    resultado: "Propuesta creada; se aplica cuando se apruebe.",
                    propuestaId: r.id,
                });
                toast.success("Propuesta creada: la entidad la vota en Decisiones.");
            } else {
                const r = await aplicarOperacion(p.op, ambito, puertos, { paginasPropias: ctx?.paginasPropias });
                if (!r.ok) {
                    toast.error(r.motivo);
                    await anotar({
                        id: puertos.nuevoId(),
                        at: puertos.ahora(),
                        ambito,
                        operacion: p.op,
                        titulo: describirOperacion(p.op, ambito).titulo,
                        estado: "fallida",
                        inverso: null,
                        resultado: r.motivo.slice(0, 600),
                    });
                    await refrescar();
                    return;
                }
                const donde = await anotar(r.entrada);
                toast.success(r.resultado + (donde === "aparato" ? " (el deshacer queda en este aparato)" : ""));
            }
            setPropuestas((lista) => lista.filter((x) => x.clave !== p.clave));
            await refrescar();
        } finally {
            setOcupado(null);
        }
    };

    const deshacer = async (e: EntradaGenesis) => {
        setDeshaciendo(e.id);
        try {
            const r = await deshacerEntrada(e, puertos);
            if (!r.ok) {
                toast.error(r.motivo);
                return;
            }
            await marcarDeshecha(e, r.resultado);
            toast.success(r.resultado);
            await refrescar();
        } finally {
            setDeshaciendo(null);
        }
    };

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="flex min-h-[22rem] flex-col rounded-2xl border border-white/10 bg-black/20 p-3" aria-label="Conversación con el agente">
                <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
                    <MessageSquareText className="h-4 w-4" aria-hidden />
                    Dile qué quieres cambiar. El agente propone; tú decides.
                </div>
                <ol className="flex-1 space-y-2 overflow-y-auto pr-1" aria-live="polite">
                    {mensajes.length === 0 ? (
                        <li className="space-y-2 text-xs text-white/50">
                            <p>Ejemplos:</p>
                            <div className="flex flex-wrap gap-1.5">
                                {sugerencias.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        className="cursor-pointer rounded-full border border-white/15 px-2.5 py-1 text-left text-[11px] text-white/70 transition-colors duration-150 hover:border-emerald-300/50 hover:text-white"
                                        onClick={() => setTexto(s)}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </li>
                    ) : null}
                    {mensajes.map((m, i) => (
                        <li
                            key={i}
                            className={
                                m.rol === "persona"
                                    ? "ml-6 rounded-xl bg-emerald-500/10 p-2 text-sm text-emerald-50"
                                    : m.rol === "agente"
                                      ? "mr-6 rounded-xl bg-white/[0.04] p-2 text-sm text-white/90"
                                      : "rounded-xl border border-amber-400/25 bg-amber-500/10 p-2 text-xs text-amber-100"
                            }
                        >
                            <span className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/40">
                                {m.rol === "persona" ? <User className="h-3 w-3" aria-hidden /> : <Bot className="h-3 w-3" aria-hidden />}
                                {m.rol === "persona" ? "tú" : m.rol === "agente" ? `agente${m.modelo ? ` · ${m.modelo}` : ""}` : "aviso"}
                            </span>
                            <span className="whitespace-pre-wrap break-words">{m.texto}</span>
                        </li>
                    ))}
                    {pensando ? (
                        <li className="flex items-center gap-2 text-xs text-white/50">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Pensando con los modelos gratuitos del OS…
                        </li>
                    ) : null}
                </ol>
                <form
                    className="mt-2 flex items-end gap-2"
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        void pedir();
                    }}
                >
                    <label htmlFor={`genesis-texto-${claveAmbito}`} className="sr-only">
                        Qué quieres cambiar
                    </label>
                    <textarea
                        id={`genesis-texto-${claveAmbito}`}
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void pedir();
                            }
                        }}
                        rows={2}
                        maxLength={2000}
                        placeholder={modo === "sin-permiso" ? "Solo lectura en esta entidad" : "Por ejemplo: pon Decisiones en mi dock y cambia mi bio"}
                        disabled={modo === "sin-permiso"}
                        className="min-w-0 flex-1 resize-none rounded-lg border border-white/15 bg-black/30 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                        data-testid="genesis-entrada"
                    />
                    <Button type="submit" className="cursor-pointer gap-1" disabled={pensando || !texto.trim() || modo === "sin-permiso"}>
                        {pensando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                        <span className="sr-only sm:not-sr-only">Pedir</span>
                    </Button>
                </form>
            </section>

            <div className="space-y-4">
                <section className="space-y-2" aria-label="Operaciones propuestas">
                    <div className="flex flex-wrap items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-300" aria-hidden />
                        <h3 className="text-sm font-semibold text-white/85">Propuestas</h3>
                        <span className="text-[11px] text-white/45">{motivoModo}</span>
                    </div>
                    {propuestas.length === 0 ? (
                        <p className="rounded-xl border border-white/10 p-3 text-xs text-white/50">Aquí aparecen los cambios que proponga el agente (o los atajos), con su vista previa.</p>
                    ) : (
                        <ul className="space-y-2">
                            {propuestas.map((p) => (
                                <TarjetaOperacion
                                    key={p.clave}
                                    propuesta={p}
                                    ambito={ambito}
                                    modo={modo}
                                    ocupado={ocupado === p.clave}
                                    onAplicar={() => void aplicar(p)}
                                    onDescartar={() => setPropuestas((l) => l.filter((x) => x.clave !== p.clave))}
                                />
                            ))}
                        </ul>
                    )}
                    {atajos && modo !== "sin-permiso" ? atajos(anadir, ctx?.contexto ?? null) : null}
                </section>
                <HistorialGenesis
                    entradas={historial.entradas}
                    donde={historial.donde}
                    deshaciendo={deshaciendo}
                    puedeGestionar={puedeGestionar}
                    onDeshacer={(e) => void deshacer(e)}
                />
            </div>
        </div>
    );
}

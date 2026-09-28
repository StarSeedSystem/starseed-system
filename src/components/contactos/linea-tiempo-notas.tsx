"use client";

/**
 * LineaTiempoNotas (contrato C8) — la línea de tiempo PRIVADA de una persona: encuentros,
 * llamadas, hitos, regalos, ideas… con su fecha real (pasada o futura), agrupada por meses
 * sobre una espina luminosa con nodos del color de cada tipo. Edición y borrado en línea,
 * búsqueda y filtro por tipo. `compacta` = las 3 últimas + «Ver todas».
 *
 * Nada de esto sale de la cuenta: ni la lista pública ni la vCard exportada llevan notas.
 */

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ArrowRight, Check, Hash, Lock, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import { useNotasContacto } from "@/lib/contactos/store";
import { agruparPorPeriodo, resumenNotas } from "@/lib/contactos/notas";
import { foldTexto } from "@/lib/contactos/modelo";
import { TIPOS_NOTA, type NotaContacto, type TipoNota } from "@/lib/contactos/tipos";
import { cn } from "@/lib/utils";
import {
    ACENTO,
    CLASE_BOTON,
    CLASE_BOTON_ICONO,
    CLASE_BOTON_PRINCIPAL,
    CLASE_CAMPO,
    CLASE_FOCO,
    CLASE_ROTULO,
    CLASE_TARJETA,
    infoNota,
    pildora,
    useMovimientoReducido,
} from "@/components/contactos/app/estilos";
import { iconoNota } from "@/components/contactos/app/iconos";
import { fechaNotaIso, ymdLocal } from "@/components/contactos/app/vista";
import estilos from "@/components/contactos/app/contactos.module.css";

export interface LineaTiempoNotasProps {
    contactoId: string;
    compacta?: boolean;
}

const PISTAS: Record<TipoNota, string> = {
    nota: "Algo que quieras recordar de esta persona…",
    encuentro: "¿Dónde os visteis? ¿De qué hablasteis?",
    llamada: "¿Qué os contasteis?",
    mensaje: "Lo esencial del mensaje…",
    hito: "Un momento importante en su vida o en la vuestra…",
    recordatorio: "¿Qué no se te puede pasar?",
    regalo: "¿Qué le regalaste, o qué le haría ilusión?",
    idea: "Una idea para compartir o hacer juntos…",
};

function capitalizar(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fechaLegible(iso: string, conAnio: boolean): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-ES", {
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(conAnio ? { year: "numeric" } : {}),
    });
}

function esFutura(iso: string): boolean {
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && ymdLocal(d) > ymdLocal(new Date());
}

// ─────────────────────────── Compositor (nueva nota y edición en línea) ───────────────────────────

interface DatosNota {
    tipo: TipoNota;
    ymd: string;
    texto: string;
    etiquetas: string[];
}

function Compositor({
    inicial,
    etiquetaBoton,
    compacto,
    onGuardar,
    onCancelar,
    autoFoco,
}: {
    inicial?: Partial<DatosNota>;
    etiquetaBoton: string;
    compacto?: boolean;
    onGuardar: (d: DatosNota) => void;
    onCancelar?: () => void;
    autoFoco?: boolean;
}) {
    const id = useId();
    const [tipo, setTipo] = useState<TipoNota>(inicial?.tipo ?? "nota");
    const [ymd, setYmd] = useState(inicial?.ymd ?? ymdLocal(new Date()));
    const [texto, setTexto] = useState(inicial?.texto ?? "");
    const [etiquetas, setEtiquetas] = useState<string[]>(inicial?.etiquetas ?? []);
    const [etiquetaTexto, setEtiquetaTexto] = useState("");

    const anadirEtiqueta = useCallback((crudo: string) => {
        const e = crudo.replace(/^#+/, "").trim();
        if (!e) return;
        setEtiquetas((xs) => (xs.some((x) => x.toLowerCase() === e.toLowerCase()) ? xs : [...xs, e]));
        setEtiquetaTexto("");
    }, []);

    const puedeGuardar = texto.trim().length > 0;

    const guardar = () => {
        if (!puedeGuardar) return;
        const pendientes = etiquetaTexto.replace(/^#+/, "").trim();
        const finales = pendientes && !etiquetas.includes(pendientes) ? [...etiquetas, pendientes] : etiquetas;
        onGuardar({ tipo, ymd, texto: texto.trim(), etiquetas: finales });
        if (!inicial?.texto) {
            setTexto("");
            setEtiquetas([]);
            setEtiquetaTexto("");
        }
    };

    const alTeclearTexto = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            guardar();
        }
        if (e.key === "Escape" && onCancelar) {
            e.preventDefault();
            onCancelar();
        }
    };

    const alTeclearEtiqueta = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            anadirEtiqueta(etiquetaTexto);
        } else if (e.key === "Backspace" && !etiquetaTexto && etiquetas.length) {
            setEtiquetas((xs) => xs.slice(0, -1));
        }
    };

    return (
        <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
                e.preventDefault();
                guardar();
            }}
        >
            <div role="radiogroup" aria-label="Tipo de nota" className="flex flex-wrap gap-1.5">
                {TIPOS_NOTA.map((t) => {
                    const Icono = iconoNota(t.id);
                    const activo = tipo === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            onClick={() => setTipo(t.id)}
                            className={cn(
                                "ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-all duration-200",
                                activo ? "text-white" : "text-white/60 hover:text-white/90",
                                CLASE_FOCO,
                            )}
                            style={activo ? pildora(t.color) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
                        >
                            <Icono className="h-3.5 w-3.5" style={{ color: t.color }} aria-hidden />
                            {t.etiqueta}
                        </button>
                    );
                })}
            </div>

            <label className="sr-only" htmlFor={`${id}-texto`}>
                Texto de la nota
            </label>
            <textarea
                id={`${id}-texto`}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={alTeclearTexto}
                rows={compacto ? 2 : 3}
                autoFocus={autoFoco}
                placeholder={PISTAS[tipo]}
                className={cn(CLASE_CAMPO, "min-h-[72px] resize-y leading-relaxed")}
            />

            <div className={cn("grid gap-2", compacto ? "grid-cols-1" : "sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]")}>
                <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-fecha`} className={CLASE_ROTULO}>
                        Fecha
                    </label>
                    <input
                        id={`${id}-fecha`}
                        type="date"
                        value={ymd}
                        onChange={(e) => setYmd(e.target.value || ymdLocal(new Date()))}
                        className={cn(CLASE_CAMPO, "[color-scheme:dark]")}
                    />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor={`${id}-etiquetas`} className={CLASE_ROTULO}>
                        Etiquetas
                    </label>
                    <div className={cn(CLASE_CAMPO, "flex min-h-[44px] flex-wrap items-center gap-1.5 py-1.5")}>
                        {etiquetas.map((e) => (
                            <span
                                key={e}
                                className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] py-0.5 pl-2 pr-1 text-[12px] text-white/85"
                            >
                                <Hash className="h-3 w-3 text-white/45" aria-hidden />
                                {e}
                                <button
                                    type="button"
                                    onClick={() => setEtiquetas((xs) => xs.filter((x) => x !== e))}
                                    aria-label={`Quitar la etiqueta ${e}`}
                                    className={cn("ss-redondo cursor-pointer rounded-full p-0.5 text-white/50 hover:bg-white/10 hover:text-white", CLASE_FOCO)}
                                >
                                    <X className="h-3 w-3" aria-hidden />
                                </button>
                            </span>
                        ))}
                        <input
                            id={`${id}-etiquetas`}
                            value={etiquetaTexto}
                            onChange={(e) => setEtiquetaTexto(e.target.value)}
                            onKeyDown={alTeclearEtiqueta}
                            onBlur={() => anadirEtiqueta(etiquetaTexto)}
                            placeholder={etiquetas.length ? "" : "huerto, cumple… (Intro para añadir)"}
                            className="min-w-[8rem] flex-1 bg-transparent text-[14px] text-white placeholder:text-white/35 focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
                {onCancelar ? (
                    <button type="button" onClick={onCancelar} className={CLASE_BOTON}>
                        Cancelar
                    </button>
                ) : null}
                <button type="submit" disabled={!puedeGuardar} className={CLASE_BOTON_PRINCIPAL}>
                    {inicial?.texto ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                    {etiquetaBoton}
                </button>
            </div>
        </form>
    );
}

// ─────────────────────────── Nota en la línea ───────────────────────────

function NodoNota({ tipo, pequeno }: { tipo: TipoNota; pequeno?: boolean }) {
    const t = infoNota(tipo);
    const Icono = iconoNota(tipo);
    const tam = pequeno ? 24 : 32;
    return (
        <span
            aria-hidden
            className="absolute left-0 flex items-center justify-center rounded-full"
            style={{
                top: pequeno ? 10 : 12,
                width: tam,
                height: tam,
                background: `radial-gradient(circle at 35% 30%, ${t.color}55, ${t.color}22 70%)`,
                boxShadow: `inset 0 0 0 1px ${t.color}99, 0 0 0 4px rgba(8,10,26,0.92), 0 0 16px ${t.color}66`,
            }}
        >
            <Icono className={pequeno ? "h-3 w-3" : "h-3.5 w-3.5"} style={{ color: t.color }} />
        </span>
    );
}

function ItemNota({
    nota,
    compacta,
    editando,
    borrando,
    onEditar,
    onGuardarEdicion,
    onCancelarEdicion,
    onPedirBorrado,
    onConfirmarBorrado,
    onCancelarBorrado,
    reducido,
}: {
    nota: NotaContacto;
    compacta?: boolean;
    editando: boolean;
    borrando: boolean;
    onEditar: () => void;
    onGuardarEdicion: (d: DatosNota) => void;
    onCancelarEdicion: () => void;
    onPedirBorrado: () => void;
    onConfirmarBorrado: () => void;
    onCancelarBorrado: () => void;
    reducido: boolean;
}) {
    const t = infoNota(nota.tipo);
    const futura = esFutura(nota.fecha);
    const anioDistinto = new Date(nota.fecha).getFullYear() !== new Date().getFullYear();
    return (
        <motion.li
            layout={!reducido}
            initial={reducido ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducido ? { opacity: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className={cn("relative", compacta ? "pl-9" : "pl-12")}
            data-testid="nota-contacto"
        >
            <NodoNota tipo={nota.tipo} pequeno={compacta} />
            <article className={cn(CLASE_TARJETA, "group p-3.5 transition-colors duration-200 hover:border-white/[0.12]")}>
                {editando ? (
                    <Compositor
                        inicial={{
                            tipo: nota.tipo,
                            ymd: ymdLocal(new Date(nota.fecha)),
                            texto: nota.texto,
                            etiquetas: nota.etiquetas,
                        }}
                        etiquetaBoton="Guardar cambios"
                        compacto={compacta}
                        onGuardar={onGuardarEdicion}
                        onCancelar={onCancelarEdicion}
                        autoFoco
                    />
                ) : (
                    <>
                        <header className="flex items-start gap-2">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[12px] font-semibold" style={{ color: t.color }}>
                                    {t.etiqueta}
                                </span>
                                <time dateTime={nota.fecha} className="text-[12px] text-white/55">
                                    {fechaLegible(nota.fecha, compacta ? anioDistinto : false)}
                                </time>
                                {futura ? (
                                    <span className="ss-redondo rounded-full px-2 py-0.5 text-[11px] font-medium text-white/85" style={pildora("#F59E0B")}>
                                        Próximamente
                                    </span>
                                ) : null}
                            </div>
                            {!borrando ? (
                                <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                                    <button type="button" onClick={onEditar} aria-label="Editar nota" title="Editar nota" className={cn(CLASE_BOTON_ICONO, "h-8 w-8")}>
                                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                    <button type="button" onClick={onPedirBorrado} aria-label="Eliminar nota" title="Eliminar nota" className={cn(CLASE_BOTON_ICONO, "h-8 w-8 hover:text-rose-300")}>
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                </div>
                            ) : null}
                        </header>
                        <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white/90">{nota.texto}</p>
                        {nota.etiquetas.length ? (
                            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Etiquetas de la nota">
                                {nota.etiquetas.map((e) => (
                                    <li key={e} className="inline-flex items-center gap-0.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/70">
                                        <Hash className="h-3 w-3 text-white/40" aria-hidden />
                                        {e}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {borrando ? (
                            <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-[13px] text-rose-100 ring-1 ring-rose-400/30">
                                <span className="flex-1">¿Eliminar esta nota? No se puede deshacer.</span>
                                <button type="button" onClick={onCancelarBorrado} className={CLASE_BOTON}>
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={onConfirmarBorrado}
                                    className={cn(CLASE_BOTON, "border-rose-400/50 bg-rose-500/20 text-white hover:bg-rose-500/30")}
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                    Eliminar
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </article>
        </motion.li>
    );
}

// ─────────────────────────── Componente principal ───────────────────────────

export function LineaTiempoNotas({ contactoId, compacta = false }: LineaTiempoNotasProps) {
    const { listo, notas, error, agregar, editar, eliminar } = useNotasContacto(contactoId);
    const reducido = useMovimientoReducido();
    const idBusqueda = useId();
    const [filtroTipo, setFiltroTipo] = useState<TipoNota | "todas">("todas");
    const [busqueda, setBusqueda] = useState("");
    const [compositorAbierto, setCompositorAbierto] = useState(!compacta);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [borrandoId, setBorrandoId] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resumen = useMemo(() => resumenNotas(notas), [notas]);

    const filtradas = useMemo(() => {
        if (compacta) return notas.slice(0, 3);
        const aguja = foldTexto(busqueda.trim());
        return notas.filter((n) => {
            if (filtroTipo !== "todas" && n.tipo !== filtroTipo) return false;
            if (!aguja) return true;
            return foldTexto(n.texto).includes(aguja) || n.etiquetas.some((e) => foldTexto(e).includes(aguja));
        });
    }, [notas, filtroTipo, busqueda, compacta]);

    const grupos = useMemo(() => agruparPorPeriodo(filtradas), [filtradas]);

    const avisar = (texto: string) => {
        setAviso(texto);
        if (temporizadorAviso.current) clearTimeout(temporizadorAviso.current);
        temporizadorAviso.current = setTimeout(() => setAviso(null), 2400);
    };

    const anadir = (d: DatosNota) => {
        agregar({ texto: d.texto, tipo: d.tipo, fecha: fechaNotaIso(d.ymd), etiquetas: d.etiquetas });
        avisar("Anotado en su línea de tiempo.");
        if (compacta) setCompositorAbierto(false);
    };

    const guardarEdicion = (nota: NotaContacto, d: DatosNota) => {
        const fecha = d.ymd === ymdLocal(new Date(nota.fecha)) ? nota.fecha : fechaNotaIso(d.ymd);
        editar(nota.id, { texto: d.texto, tipo: d.tipo, fecha, etiquetas: d.etiquetas });
        setEditandoId(null);
        avisar("Nota actualizada.");
    };

    const confirmarBorrado = (id: string) => {
        eliminar(id);
        setBorrandoId(null);
        avisar("Nota eliminada.");
    };

    const renderNota = (n: NotaContacto) => (
        <ItemNota
            key={n.id}
            nota={n}
            compacta={compacta}
            reducido={reducido}
            editando={editandoId === n.id}
            borrando={borrandoId === n.id}
            onEditar={() => {
                setBorrandoId(null);
                setEditandoId(n.id);
            }}
            onGuardarEdicion={(d) => guardarEdicion(n, d)}
            onCancelarEdicion={() => setEditandoId(null)}
            onPedirBorrado={() => {
                setEditandoId(null);
                setBorrandoId(n.id);
            }}
            onConfirmarBorrado={() => confirmarBorrado(n.id)}
            onCancelarBorrado={() => setBorrandoId(null)}
        />
    );

    const espina = (
        <span
            aria-hidden
            className={cn(estilos.espina, "top-3 bottom-3 w-[2px] rounded-full", compacta ? "left-[11px]" : "left-[15px]")}
            style={{
                background: `linear-gradient(to bottom, ${ACENTO}d9, rgba(124,92,255,0.5) 55%, rgba(255,255,255,0.04))`,
                boxShadow: `0 0 12px ${ACENTO}73`,
            }}
        />
    );

    return (
        <section aria-label="Línea de tiempo" className="flex flex-col gap-4" data-testid="linea-tiempo-notas">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1.5 text-[12px] text-white/60">
                    <Lock className="h-3.5 w-3.5" style={{ color: ACENTO }} aria-hidden />
                    Solo tú ves estas notas
                </p>
                {resumen.total ? (
                    <span className="text-[12px] text-white/45">
                        {resumen.total === 1 ? "1 nota" : `${resumen.total} notas`}
                    </span>
                ) : null}
            </div>

            {error ? (
                <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100/90 ring-1 ring-amber-400/25">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                        No se pudo sincronizar con la nube ({error}). Tus notas siguen guardadas en este dispositivo.
                    </span>
                </p>
            ) : null}

            {compositorAbierto ? (
                <div className={cn(CLASE_TARJETA, "p-3.5")}>
                    <Compositor
                        etiquetaBoton={compacta ? "Añadir nota" : "Añadir a la línea de tiempo"}
                        compacto={compacta}
                        onGuardar={anadir}
                        onCancelar={compacta ? () => setCompositorAbierto(false) : undefined}
                        autoFoco={compacta}
                    />
                </div>
            ) : (
                <button type="button" onClick={() => setCompositorAbierto(true)} className={cn(CLASE_BOTON, "self-start")}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Añadir nota
                </button>
            )}

            <p aria-live="polite" className="sr-only">
                {aviso ?? ""}
            </p>

            {!compacta && notas.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                    <div className="relative">
                        <label htmlFor={idBusqueda} className="sr-only">
                            Buscar en las notas
                        </label>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
                        <input
                            id={idBusqueda}
                            type="search"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar en las notas…"
                            className={cn(CLASE_CAMPO, "pl-9")}
                        />
                    </div>
                    <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            aria-pressed={filtroTipo === "todas"}
                            onClick={() => setFiltroTipo("todas")}
                            className={cn(
                                "ss-redondo cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors duration-200",
                                filtroTipo === "todas" ? "text-white" : "text-white/55 hover:text-white/85",
                                CLASE_FOCO,
                            )}
                            style={filtroTipo === "todas" ? pildora(ACENTO) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
                        >
                            Todas · {resumen.total}
                        </button>
                        {TIPOS_NOTA.filter((t) => resumen.porTipo[t.id] > 0).map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                aria-pressed={filtroTipo === t.id}
                                onClick={() => setFiltroTipo(filtroTipo === t.id ? "todas" : t.id)}
                                className={cn(
                                    "ss-redondo cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors duration-200",
                                    filtroTipo === t.id ? "text-white" : "text-white/55 hover:text-white/85",
                                    CLASE_FOCO,
                                )}
                                style={filtroTipo === t.id ? pildora(t.color) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
                            >
                                {t.etiqueta} · {resumen.porTipo[t.id]}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {!listo ? (
                <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando notas">
                    {[0, 1].map((i) => (
                        <div key={i} className="ml-12 h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
                    ))}
                </div>
            ) : notas.length === 0 ? (
                <div className={cn(CLASE_TARJETA, "px-4 py-5 text-center")}>
                    <p className="text-[14px] font-medium text-white/80">Su historia contigo empieza aquí</p>
                    <p className="mt-1 text-[13px] text-white/55">
                        Anota encuentros, llamadas, hitos o ideas de regalo, con la fecha en que pasaron.
                    </p>
                </div>
            ) : filtradas.length === 0 ? (
                <p className="px-1 text-[13px] text-white/55">Ninguna nota coincide con la búsqueda.</p>
            ) : compacta ? (
                <div className="relative">
                    {espina}
                    <ol className="flex flex-col gap-2.5">
                        <AnimatePresence initial={false}>{filtradas.map(renderNota)}</AnimatePresence>
                    </ol>
                </div>
            ) : (
                <div className="relative">
                    {espina}
                    <ol className="flex flex-col gap-5">
                        {grupos.map((g) => (
                            <li key={g.clave} className="flex flex-col gap-2.5">
                                <h4 className="relative flex items-center gap-2 pl-12 text-[13px] font-semibold text-white/85">
                                    <span
                                        aria-hidden
                                        className="absolute left-[11px] h-[10px] w-[10px] rounded-full"
                                        style={{ background: ACENTO, boxShadow: `0 0 0 3px rgba(8,10,26,0.92), 0 0 10px ${ACENTO}` }}
                                    />
                                    {capitalizar(g.titulo)}
                                    <span className="text-[12px] font-normal text-white/40">{g.notas.length}</span>
                                </h4>
                                <ol className="flex flex-col gap-2.5">
                                    <AnimatePresence initial={false}>{g.notas.map(renderNota)}</AnimatePresence>
                                </ol>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {compacta && notas.length > 0 ? (
                <Link
                    href={`/contactos?c=${encodeURIComponent(contactoId)}`}
                    className={cn("inline-flex cursor-pointer items-center gap-1.5 self-start rounded-lg text-[13px] font-medium transition-colors duration-200 hover:text-white", CLASE_FOCO)}
                    style={{ color: ACENTO }}
                >
                    Ver todas {notas.length > 3 ? `(${notas.length})` : ""}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
            ) : null}
        </section>
    );
}

export default LineaTiempoNotas;

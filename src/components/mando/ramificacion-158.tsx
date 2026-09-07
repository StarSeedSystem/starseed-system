"use client";

/**
 * Ramificación 1.58 (Ola 270 · 2026-09-07 · Puente de Mando · pestaña «Procesos»)
 * ─────────────────────────────────────────────────────────────────────────────
 * El árbol vivo del backend Astraura 1.58 de esta neurona, por niveles:
 *   0) BitNet local (vivo/dormido/cedido, puerto, último uso interactivo)
 *   1) Personalidades del OS con sus turnos en el corpus de aprendizaje
 *   2) Agentes de aprendizaje continuo (Curador, Entrenador, Evaluador,
 *      Desplegador, Cronista) con pausar/reanudar/ejecutar
 *   3) Procesos de fondo (imaginación, sueños, enjambre, Director, learner,
 *      cognition)
 *
 * Lee `GET /api/mando/agentes-158` cada 20 s (sin sondear con la pestaña
 * oculta) y las acciones van por `POST /api/mando/agentes-158`.
 * Si el backend está apagado muestra un estado vacío claro.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Bot,
    Brain,
    ChevronDown,
    CircleDashed,
    Pause,
    Play,
    RefreshCw,
    Sparkles,
    Zap,
} from "lucide-react";

import type {
    AgenteAprendizajeVivo,
    PersonalidadRama,
    ProcesoFondo,
    Rama158,
} from "@/lib/mando/agentes-158";

const INTERVALO_MS = 20_000;

/** Paleta determinista por índice (los presets del OS no guardan color propio). */
const COLORES = [
    "text-sky-300", "text-emerald-300", "text-fuchsia-300", "text-amber-300",
    "text-violet-300", "text-rose-300", "text-teal-300", "text-orange-300",
];

/** Hora local corta; «—» si falta. */
function hora(iso: string | null | undefined): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

/** «Hace 12 min» a partir de segundos (para el último uso interactivo de BitNet). */
function haceSegundos(s: number | null): string {
    if (s === null || !Number.isFinite(s)) return "—";
    if (s < 90) return `hace ${Math.max(1, Math.round(s))} s`;
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    return `hace ${(s / 3600).toFixed(1)} h`;
}

/** Flecha vertical entre niveles del árbol. */
function Flecha() {
    return (
        <div className="flex justify-center py-0.5" aria-hidden>
            <ChevronDown className="h-4 w-4 text-white/30" />
        </div>
    );
}

/** Nivel del árbol: título al margen y tarjetas dentro. */
function Nivel({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="flex flex-col items-center gap-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                {icono}
                {titulo}
            </h4>
            <div className="flex flex-wrap justify-center gap-2">{children}</div>
        </section>
    );
}

/** Tarjeta base compartida por los cuatro niveles. */
function Tarjeta({ borde, children, titulo }: { borde: string; children: React.ReactNode; titulo?: string }) {
    return (
        <article
            className={`w-full max-w-xs rounded-xl border bg-black/40 p-3 backdrop-blur sm:w-60 ${borde}`}
            title={titulo}
        >
            {children}
        </article>
    );
}

/** Nivel 0: BitNet local — el motor de trabajo continuo. */
function TarjetaBitnet({ rama }: { rama: Rama158 }) {
    const b = rama.bitnet;
    const vivo = Boolean(b && b.vivo && !b.dormido && !b.cedidoHastaS);
    const estado = !b || !b.vivo
        ? { texto: "apagado", punto: "bg-zinc-600", tono: "text-white/50" }
        : b.dormido
          ? { texto: "dormido", punto: "bg-amber-400", tono: "text-amber-300" }
          : b.cedidoHastaS
            ? { texto: "cedido (turno de memoria)", punto: "bg-violet-400", tono: "text-violet-300" }
            : { texto: "vivo", punto: "bg-emerald-400", tono: "text-emerald-300" };
    return (
        <Tarjeta borde={vivo ? "border-emerald-400/40" : "border-white/15"}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Brain className="h-3.5 w-3.5 text-sky-300" aria-hidden />
                    BitNet 1.58
                </span>
                <span className={`h-2 w-2 rounded-full ${estado.punto} ${vivo ? "animate-pulse" : ""}`} aria-hidden />
            </div>
            <p className={`mt-1 text-[11px] font-medium ${estado.tono}`}>{estado.texto}</p>
            <p className="mt-0.5 text-[11px] text-white/45">
                puerto {b?.puerto ?? "—"} · último uso interactivo {haceSegundos(b?.ultimoUsoInteractivoHaceS ?? null)}
            </p>
        </Tarjeta>
    );
}

/** Nivel 1: personalidad del OS con su avance en el corpus vivo. */
function TarjetaPersonalidad({ p, indice }: { p: PersonalidadRama; indice: number }) {
    const color = COLORES[indice % COLORES.length];
    return (
        <Tarjeta borde={p.activa ? "border-sky-400/50" : "border-white/10"}>
            <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold ${color}`}>{p.nombre}</span>
                {p.activa && (
                    <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-200">
                        activa
                    </span>
                )}
            </div>
            <p className="mt-1 text-[11px] text-white/50">
                {p.turnos > 0 ? `${p.turnos.toLocaleString("es-ES")} turnos en el corpus` : "sin turnos aún"}
                {" · "}última {hora(p.ultimo)}
            </p>
        </Tarjeta>
    );
}

/** Nivel 2: agente de aprendizaje con sus acciones (confirmación ligera). */
function TarjetaAgente({
    agente,
    ocupado,
    onAccion,
}: {
    agente: AgenteAprendizajeVivo;
    ocupado: boolean;
    onAccion: (id: string, accion: "pausar" | "reanudar" | "ejecutar", etiqueta: string) => void;
}) {
    // Tres estados posibles: trabajando, pausado a propósito, o esperando a que
    // la fábrica LoRA libere la GPU (el backend lo marca con activo=false).
    const estado = agente.activo ? "activo" : "pausado / esperando fábrica";
    const proximoEn = agente.proximo
        ? Math.max(0, Math.round((new Date(agente.proximo).getTime() - Date.now()) / 60000))
        : null;
    return (
        <Tarjeta borde={agente.activo ? "border-emerald-400/30" : "border-white/10"}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Bot className="h-3.5 w-3.5 text-amber-300" aria-hidden />
                    {agente.nombre}
                </span>
                <span
                    className={`h-2 w-2 rounded-full ${agente.activo ? "bg-emerald-400" : "bg-zinc-600"}`}
                    title={estado}
                    aria-hidden
                />
            </div>
            {agente.rol && <p className="mt-0.5 text-[11px] italic text-white/50">{agente.rol}</p>}
            {agente.ultimoResultado && (
                <p className="mt-1 line-clamp-2 text-[11px] text-white/60" title={agente.ultimoResultado}>
                    {agente.ultimoResultado}
                </p>
            )}
            <p className="mt-1 text-[11px] text-white/45">
                {agente.ejecuciones} ejecuciones · {agente.errores} errores
                {proximoEn !== null ? ` · próximo en ${proximoEn} min` : " · próximo: en cuanto el fabricante libere"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {agente.activo ? (
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => onAccion(agente.id, "pausar", agente.nombre)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-400/30 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-400/10 disabled:opacity-40"
                    >
                        <Pause className="h-3 w-3" aria-hidden /> Pausar
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => onAccion(agente.id, "reanudar", agente.nombre)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-emerald-400/30 px-2 py-0.5 text-[11px] text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-40"
                    >
                        <Play className="h-3 w-3" aria-hidden /> Reanudar
                    </button>
                )}
                <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onAccion(agente.id, "ejecutar", agente.nombre)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-sky-400/30 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-400/10 disabled:opacity-40"
                >
                    <Zap className="h-3 w-3" aria-hidden /> Ejecutar ahora
                </button>
            </div>
        </Tarjeta>
    );
}

/** Nivel 3: proceso de fondo (imaginación, sueños, enjambre, Director, learner, cognition). */
function TarjetaProceso({ p }: { p: ProcesoFondo }) {
    // activo puede venir a null: el backend no llegó a medirlo; se muestra neutro.
    const tono = p.activo === true ? "bg-emerald-400" : p.activo === false ? "bg-zinc-600" : "bg-white/30";
    return (
        <Tarjeta borde={p.activo === true ? "border-emerald-400/25" : "border-white/10"} titulo={p.detalle ?? undefined}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Sparkles className="h-3.5 w-3.5 text-violet-300" aria-hidden />
                    {p.nombre}
                </span>
                <span className={`h-2 w-2 rounded-full ${tono}`} aria-hidden />
            </div>
            <p className="mt-0.5 text-[11px] text-white/45">
                {p.activo === null ? "sin medir" : p.activo ? "activo" : "inactivo"}
                {p.ultimo ? ` · último ${hora(p.ultimo)}` : ""}
            </p>
            {p.detalle && <p className="mt-0.5 line-clamp-1 text-[10px] text-white/35">{p.detalle}</p>}
        </Tarjeta>
    );
}

/**
 * Árbol vivo del backend 1.58: BitNet → personalidades → agentes → procesos.
 * Sondeo cada 20 s (sin sondear con la pestaña oculta: gastaría backend y
 * memoria de la neurona para nadie). Acciones con confirmación ligera.
 */
export function Ramificacion158() {
    const [rama, setRama] = useState<Rama158 | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const recargar = useCallback(async (forzada = false) => {
        if (!forzada && typeof document !== "undefined" && document.hidden) return;
        try {
            const res = await fetch("/api/mando/agentes-158", { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setRama((await res.json()) as Rama158);
            setError(null);
        } catch {
            setError("No se pudo leer la ramificación 1.58.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void recargar(true); // Primera carga siempre, aunque la pestaña esté oculta.
        const id = window.setInterval(() => void recargar(false), INTERVALO_MS);
        return () => window.clearInterval(id);
    }, [recargar]);

    const accionar = useCallback(
        async (agenteId: string, accion: "pausar" | "reanudar" | "ejecutar", nombre: string) => {
            // Confirmación ligera: basta un aviso del navegador (son acciones reversibles).
            if (!window.confirm(`¿${accion} «${nombre}» ahora?`)) return;
            setOcupado(true);
            try {
                await fetch("/api/mando/agentes-158", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ agente: agenteId, accion }),
                });
            } finally {
                setOcupado(false);
                await recargar(true);
            }
        },
        [recargar],
    );

    if (cargando && !rama) {
        return (
            <div data-testid="ramificacion-158" className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo la ramificación 1.58…
            </div>
        );
    }
    if (error && !rama) {
        return (
            <div data-testid="ramificacion-158" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error}
                <button
                    type="button"
                    onClick={() => void recargar(true)}
                    className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden /> Reintentar
                </button>
            </div>
        );
    }
    // Estado vacío claro: sin backend no hay árbol que dibujar.
    if (!rama || rama.backend === "apagado") {
        return (
            <div data-testid="ramificacion-158" className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/50">
                Astraura 1.58 apagada en esta neurona. Arranca el backend
                (<code>ASTRAURA_158_URL</code>) y pulsa Actualizar.
            </div>
        );
    }
    return (
        <div data-testid="ramificacion-158" className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/40">
                    <Brain className="h-4 w-4 text-emerald-300" aria-hidden />
                    Rama viva · {hora(rama.t)}
                </span>
                <button
                    type="button"
                    onClick={() => void recargar(true)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden /> Actualizar
                </button>
            </header>
            <div className="flex flex-col items-center gap-0.5">
                <Nivel titulo="BitNet 1.58" icono={<Brain className="h-3.5 w-3.5" />}>
                    <TarjetaBitnet rama={rama} />
                </Nivel>
                <Flecha />
                <Nivel titulo="Personalidades" icono={<Sparkles className="h-3.5 w-3.5" />}>
                    {rama.personalidades.map((p, i) => (
                        <TarjetaPersonalidad key={p.id} p={p} indice={i} />
                    ))}
                </Nivel>
                <Flecha />
                <Nivel titulo="Agentes de aprendizaje" icono={<Bot className="h-3.5 w-3.5" />}>
                    {rama.agentes.map((a) => (
                        <TarjetaAgente key={a.id} agente={a} ocupado={ocupado} onAccion={accionar} />
                    ))}
                    {rama.agentes.length === 0 && (
                        <Tarjeta borde="border-white/10">
                            <p className="text-[11px] text-white/45">El backend no tiene agentes registrados.</p>
                        </Tarjeta>
                    )}
                </Nivel>
                <Flecha />
                <Nivel titulo="Procesos de fondo" icono={<Sparkles className="h-3.5 w-3.5" />}>
                    {rama.procesos.map((p) => (
                        <TarjetaProceso key={p.id} p={p} />
                    ))}
                </Nivel>
            </div>
        </div>
    );
}


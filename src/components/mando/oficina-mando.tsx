"use client";

/**
 * oficina-mando.tsx — Oficina 3D del Puente de Mando (Ola 272 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * La sala donde viven los seres reales de la orquestación: escritores y
 * revisores del enjambre, los cinco agentes 1.58, las personalidades, los
 * procesos de fondo y el núcleo BitNet, cada uno en su sala según lo que hace
 * ahora mismo. A la izquierda la escena 3D (`OficinaSeres`), a la derecha la
 * ficha del ser elegido y debajo la tabla de evolución por niveles.
 *
 * Sondea `GET /api/mando/oficina` cada 15 s (nunca con la pestaña oculta) y
 * cruza con `/api/mando/voces`, `/api/mando/agentes-158` y
 * `/api/mando/ramificacion` para los datos vivos por tipo.
 *
 * Three.js se monta con `next/dynamic` (ssr: false) y solo cuando la pestaña
 * está abierta; el resto de la consola no lo carga.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, Filter } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EstadoOficina, OcupanteOficina, SerListado } from "@/lib/astraura/genesis-types";
import type { GenomaSer, TipoSer } from "@/lib/mando/oficina";
import type { VozDeAgente } from "@/lib/mando/voz-mando";
import { FichaSerMando, type DetalleVivoSer } from "@/components/mando/ficha-ser-mando";

const OficinaSeres = dynamic(
    () => import("@/components/astraura/genesis/oficina/oficina-seres").then((m) => m.OficinaSeres),
    { ssr: false },
);

/** Respuesta de `GET /api/mando/oficina`. */
interface DatosOficina {
    t: string;
    estado: EstadoOficina;
    seres: SerListado[];
    genomas: GenomaSer[];
}

interface OficinaMandoProps {
    alCambiarPestana: (id: string) => void;
}

/** Colores de las salas del Mando, para la leyenda (mismo orden que `SALAS_MANDO`). */
const COLOR_POR_SALA: Record<string, string> = {
    enjambre: "#39FF14",
    revision: "#FFBF00",
    aprendizaje: "#007FFF",
    personalidades: "#A855F7",
    fondo: "#10B981",
    nucleo: "#DC143C",
    espera: "#94A3B8",
};

/** «Hace cuánto», compacto. */
function haceCuanto(desde: number | null): string {
    if (desde == null) return "—";
    const s = Math.max(0, Math.round((Date.now() - desde) / 1000));
    if (s < 60) return "ahora";
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) return `${Math.floor(s / 3600)} h`;
    return `${Math.floor(s / 86400)} d`;
}

/** Etiqueta legible de un tipo de ser, para la leyenda y la tabla de evolución. */
function etiquetaTipo(tipo: TipoSer): string {
    switch (tipo) {
        case "escritor": return "Escritor";
        case "revisor": return "Revisor";
        case "agente158": return "Agente 1.58";
        case "personalidad": return "Personalidad";
        case "proceso": return "Proceso";
        case "bitnet": return "BitNet";
    }
}

/** Sala de un ocupante a partir de su id, o null si ya no existe. */
function salaDe(estado: EstadoOficina, ocupante: OcupanteOficina | undefined): string | null {
    if (!ocupante || ocupante.salaId == null) return null;
    return estado.salas.find((s) => s.id === ocupante.salaId)?.nombre ?? null;
}

/** Carga la oficina del Mando (GET) y devuelve los datos o un error, sin lanzar. */
async function cargarOficina(): Promise<{ datos: DatosOficina | null; error: string | null }> {
    try {
        const res = await fetch("/api/mando/oficina", { cache: "no-store" });
        if (!res.ok) return { datos: null, error: `La oficina respondió ${res.status}.` };
        const datos = (await res.json()) as DatosOficina;
        return { datos, error: null };
    } catch {
        return { datos: null, error: "No se pudo cargar la oficina (¿está el Mando en local?)." };
    }
}

export function OficinaMando({ alCambiarPestana }: OficinaMandoProps) {
    const [datos, setDatos] = useState<DatosOficina | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [seleccionado, setSeleccionado] = useState<string | null>(null);
    const [soloActivos, setSoloActivos] = useState(false);
    const [vocesPorAgente, setVocesPorAgente] = useState<VozDeAgente[]>([]);
    // Portavoz de «se está refrescando ahora» para el botón Actualizar.
    const refrescando = useRef(false);

    const refrescar = useCallback(async () => {
        if (refrescando.current) return;
        refrescando.current = true;
        const r = await cargarOficina();
        if (r.datos) {
            setDatos(r.datos);
            setError(null);
        } else {
            setError(r.error);
        }
        refrescando.current = false;
    }, []);

    // Primer barrido + voces una sola vez (tolerante: sin voz se sigue).
    useEffect(() => {
        void refrescar();
        void (async () => {
            try {
                const res = await fetch("/api/mando/voces", { cache: "no-store" });
                if (!res.ok) return;
                const j = (await res.json()) as { vocesPorAgente?: VozDeAgente[] };
                setVocesPorAgente(j.vocesPorAgente ?? []);
                setCargando(false);
            } catch {
                // La voz nunca deja la ficha sin datos.
                setCargando(false);
            }
        })();
    }, [refrescar]);

    // Sondeo cada 15 s, sin molestar con la pestaña oculta.
    useEffect(() => {
        let vivo = true;
        let id: ReturnType<typeof setInterval> | null = null;
        id = setInterval(() => {
            if (typeof document !== "undefined" && document.hidden) return;
            void refrescar();
        }, 15000);
        const alVisibilizarse = () => {
            if (!document.hidden) void refrescar();
        };
        document.addEventListener("visibilitychange", alVisibilizarse);
        return () => {
            vivo = false;
            if (id) clearInterval(id);
            document.removeEventListener("visibilitychange", alVisibilizarse);
        };
    }, [refrescar]);

    const estado = datos?.estado ?? null;
    const seres = datos?.seres ?? [];
    const genomas = datos?.genomas ?? [];
    const ocupanteSeleccionado = estado?.ocupantes.find((o) => o.serId === seleccionado) ?? null;
    const serSeleccionado = seres.find((s) => s.id === seleccionado) ?? null;
    const genomaSeleccionado = genomas.find((g) => g.id === seleccionado) ?? null;

    /** Exporta el ser elegido como versión predeterminada (POST a la oficina). */
    const exportar = useCallback(async (id: string): Promise<{ ok: boolean; ruta?: string; error?: string }> => {
        try {
            const res = await fetch("/api/mando/oficina", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "exportar-predeterminado", id }),
            });
            const j = (await res.json()) as { ok?: boolean; ruta?: string; error?: string };
            if (res.ok && j.ok) return { ok: true, ruta: j.ruta };
            return { ok: false, error: j.error ?? `La exportación respondió ${res.status}.` };
        } catch {
            return { ok: false, error: "No se pudo exportar." };
        }
    }, []);

    // Estado filtrado a «solo activos» para la escena, sin mutar el original.
    const estadoVisible = useMemo((): EstadoOficina | null => {
        if (!estado) return null;
        if (!soloActivos) return estado;
        return {
            ...estado,
            ocupantes: estado.ocupantes.filter((o) => o.actividad !== "inactivo"),
        };
    }, [estado, soloActivos]);

    const detalleVivo: DetalleVivoSer | null = useMemo(() => {
        if (!ocupanteSeleccionado || !genomaSeleccionado) return null;
        const actividad = ocupanteSeleccionado.actividad;
        const sala = salaDe(estado!, ocupanteSeleccionado);
        const base: DetalleVivoSer = {
            actividad,
            salaNombre: sala,
            detalle: ocupanteSeleccionado.detalle ?? null,
            desde: ocupanteSeleccionado.desde,
        };
        const tipo = genomaSeleccionado.tipo;
        if (tipo === "escritor" || tipo === "revisor") {
            // Del detalle «H2 · 12 min» se extrae la tarea, si cuadra.
            const trozos = (ocupanteSeleccionado.detalle ?? "").split(" · ");
            return {
                ...base,
                tareaActual: trozos[0]?.trim() || undefined,
                fase: actividad,
            };
        }
        if (tipo === "agente158") {
            return { ...base, activo: actividad !== "inactivo" };
        }
        if (tipo === "proceso") {
            return { ...base, procesoActivo: actividad !== "inactivo" };
        }
        if (tipo === "bitnet") {
            return { ...base, vivo: actividad !== "inactivo", dormido: actividad === "inactivo" };
        }
        return base;
    }, [ocupanteSeleccionado, genomaSeleccionado, estado]);

    // Ordena el genoma por nivel, descendente, para la tabla de evolución.
    const evolucion = useMemo(() => [...genomas].sort((a, b) => b.nivel - a.nivel), [genomas]);

    // Los nombres de sala de la leyenda, con su conteo de ocupantes vivos.
    const leyendaSalas = useMemo(() => {
        if (!estado) return [];
        return estado.salas.map((sala) => {
            const conteo = estado.ocupantes.filter((o) => o.salaId === sala.id).length;
            return { id: sala.id, nombre: sala.nombre, color: COLOR_POR_SALA[sala.id] ?? sala.color ?? "#94A3B8", conteo };
        });
    }, [estado]);

    if (cargando && !datos) {
        // Esqueleto de carga: la oficina aún no ha respondido.
        return (
            <div data-testid="oficina-mando" className="space-y-4" aria-busy="true">
                <div className="h-8 w-56 animate-pulse rounded-lg bg-white/10" />
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 h-[520px] animate-pulse rounded-xl bg-white/5" />
                    <div className="h-80 animate-pulse rounded-xl bg-white/5" />
                </div>
            </div>
        );
    }

    if (error && !datos) {
        // Error de carga: tono peligro con reintento.
        return (
            <div data-testid="oficina-mando" className="rounded-xl border border-red-400/20 bg-red-500/10 p-6 text-center">
                <p className="text-sm text-red-200">{error}</p>
                <button
                    type="button"
                    onClick={() => void refrescar()}
                    className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-200 transition-colors hover:bg-red-500/20"
                >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Reintentar
                </button>
            </div>
        );
    }

    const vacio = !seres.length;

    return (
        <div data-testid="oficina-mando" className="space-y-4">
            {/* Cabecera: título + botón Actualizar. */}
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Oficina 3D del Mando</h2>
                <button
                    type="button"
                    onClick={() => void refrescar()}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", !cargando && "animate-spin")} aria-hidden="true" />
                    Actualizar
                </button>
            </div>

            {vacio ? (
                // Sin actividad: la oficina se ve, pero con las salas vacías.
                <div className="rounded-xl border border-white/10 bg-black/30 p-6">
                    {estadoVisible && (
                        <OficinaSeres estado={estadoVisible} seres={[]} />
                    )}
                    <p className="mt-4 text-center text-sm text-white/50">Sin actividad ahora mismo.</p>
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-4">
                    {/* Izquierda (2/3): la escena 3D con leyenda e interruptor. */}
                    <div className="col-span-2">
                        <OficinaSeres
                            estado={estadoVisible ?? { salas: [], ocupantes: [], actualizadoEn: 0, datosReales: false }}
                            seres={seres}
                            onSeleccionCambia={setSeleccionado}
                            controlesExtra={
                                <div className="flex items-center gap-2">
                                    {leyendaSalas.map((sala) => (
                                        <span
                                            key={sala.id}
                                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70"
                                        >
                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: sala.color }} aria-hidden="true" />
                                            {sala.nombre} · {sala.conteo}
                                        </span>
                                    ))}
                                </div>
                            }
                        />
                        {/* Interruptor «solo activos» bajo la escena. */}
                        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-white/70">
                            <input
                                type="checkbox"
                                checked={soloActivos}
                                onChange={(e) => setSoloActivos(e.target.checked)}
                                className="sr-only"
                            />
                            <span
                                className={cn(
                                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                                    soloActivos ? "bg-emerald-500/60" : "bg-white/10",
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                                        soloActivos ? "translate-x-4" : "translate-x-1",
                                    )}
                                />
                            </span>
                            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                            Solo activos
                        </label>
                    </div>

                    {/* Derecha (1/3): la ficha del ser elegido. */}
                    <div>
                        {serSeleccionado && genomaSeleccionado && detalleVivo ? (
                            <FichaSerMando
                                ser={serSeleccionado}
                                genoma={genomaSeleccionado}
                                ocupante={ocupanteSeleccionado}
                                detalleVivo={detalleVivo}
                                vocesPorAgente={vocesPorAgente}
                                onIrALaTarea={() => alCambiarPestana("procesos")}
                                onExportar={exportar}
                            />
                        ) : (
                            <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-center">
                                <p className="text-sm text-white/50">Toca un ser para ver su ficha.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Evolución: tabla compacta por nivel. */}
            <section className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-sm font-medium text-white/70">Evolución</h3>
                {evolucion.length === 0 ? (
                    <p className="mt-2 text-sm text-white/50">Aún no hay seres que hayan evolucionado.</p>
                ) : (
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left text-xs text-white/70">
                            <thead>
                                <tr className="border-b border-white/10 text-white/40">
                                    <th className="py-1.5 pr-2 font-medium">Ser</th>
                                    <th className="py-1.5 pr-2 font-medium">Tipo</th>
                                    <th className="py-1.5 pr-2 font-medium">Nivel</th>
                                    <th className="py-1.5 pr-2 font-medium">Experiencia</th>
                                    <th className="py-1.5 pr-2 font-medium">Rasgos</th>
                                    <th className="py-1.5 font-medium">Última vez</th>
                                </tr>
                            </thead>
                            <tbody>
                                {evolucion.map((g) => {
                                    const objetivo = (g.nivel + 1) * (g.nivel + 1);
                                    const porcentaje = Math.min(1, g.xp / objetivo);
                                    const ultimaMs = Date.parse(g.ultimaVez);
                                    return (
                                        <tr key={g.id} className="border-b border-white/5">
                                            <td className="py-1.5 pr-2 text-white/80">{g.nombre}</td>
                                            <td className="py-1.5 pr-2 text-white/50">{etiquetaTipo(g.tipo)}</td>
                                            <td className="py-1.5 pr-2 font-semibold text-white">{g.nivel}</td>
                                            <td className="py-1.5 pr-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                                                            style={{ width: `${Math.round(porcentaje * 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-white/50">{g.xp}</span>
                                                </div>
                                            </td>
                                            <td className="py-1.5 pr-2">
                                                <div className="flex flex-wrap gap-1">
                                                    {g.rasgos.length === 0 ? (
                                                        <span className="text-white/30">—</span>
                                                    ) : (
                                                        g.rasgos.map((r) => (
                                                            <span key={r} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                                                                {r}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-1.5 text-white/50">{Number.isFinite(ultimaMs) ? haceCuanto(ultimaMs) : "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="mt-3 text-[11px] text-white/40">
                    Estos seres evolucionan con su trabajo real; sus versiones predeterminadas exportadas serán la base de los agentes del OS.
                </p>
            </section>
        </div>
    );
}
"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Clock, AlertTriangle, Zap } from "lucide-react";

export type SugerenciaPotente = {
    id: string;
    titulo: string;
    tipo: string;
    agente: string;
    modelo: string;
    motivo: string;
    coste_estimado: string;
    cupo_queda: string;
    modo: "plan" | "escribir";
    prioridad: number;
    visto: string;
};

export type SugerenciaAprobada = SugerenciaPotente & {
    estado: "en_curso" | "integrada" | "fallo" | "plan_dejado";
    aprobada_en: string;
    duracion_aprobacion?: number;
};

type DatosSugerencias = {
    sugerencias: SugerenciaPotente[];
    sin_cupo: Array<{ id: string; titulo: string; tipo: string; prioridad: number }>;
    total: number;
    visto: string;
};

function formatearHace(iso: string): string {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return "desconocido";
    const min = Math.max(0, Math.round((Date.now() - ms) / 60_000));
    if (min < 1) return "hace menos de 1 min";
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

function EsqueletoSugerencia() {
    return (
        <div className="mc-cristal rounded-lg border border-white/10 bg-black/25 p-3 animate-pulse">
            <div className="flex items-center gap-2">
                <div className="h-4 w-24 bg-white/10 rounded" />
                <div className="h-3 w-16 bg-white/5 rounded" />
            </div>
            <div className="mt-2 h-3 w-3/4 bg-white/5 rounded" />
            <div className="mt-1 h-3 w-1/2 bg-white/5 rounded" />
            <div className="mt-3 flex gap-2">
                <div className="h-6 w-20 bg-white/10 rounded-md" />
                <div className="h-6 w-20 bg-white/10 rounded-md" />
                <div className="h-6 w-28 bg-white/10 rounded-md" />
            </div>
        </div>
    );
}

function TarjetaSugerencia({
    s,
    alAprobar,
    alRechazar,
    alAprobarTipo,
}: {
    s: SugerenciaPotente;
    alAprobar: (id: string) => void;
    alRechazar: (id: string) => void;
    alAprobarTipo: (tipo: string, horas: number) => void;
}) {
    const esDePago = s.coste_estimado.startsWith("$/token");
    const [confirmandoPago, setConfirmandoPago] = useState(false);

    const manejarAprobar = () => {
        if (esDePago && !confirmandoPago) {
            setConfirmandoPago(true);
            return;
        }
        alAprobar(s.id);
    };

    return (
        <div className="mc-cristal rounded-lg border border-white/10 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-mono text-[11px] text-cyan-200/90">{s.id}</span>
                        <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-1.5 text-[10px] text-amber-200">
                            {s.modo === "plan" ? "Plan" : "Escribe"}
                        </span>
                        <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/60">
                            P{String(s.prioridad).padStart(3, "0")}
                        </span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">{s.titulo}</p>
                    <p className="mt-1 text-[10px] text-white/55">
                        <span className="font-medium text-white/70">{s.agente}</span> ·{" "}
                        <span className="font-mono text-cyan-200/70">{s.modelo}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/50">{s.motivo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="flex items-center gap-1 text-white/60">
                            <Zap className="h-3 w-3" aria-hidden />
                            Coste: <span className={esDePago ? "text-rose-200" : "text-emerald-200"}>{s.coste_estimado}</span>
                        </span>
                        <span className="flex items-center gap-1 text-white/50">
                            Cupo: {s.cupo_queda}
                        </span>
                    </p>
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {esDePago && confirmandoPago ? (
                    <>
                        <span className="flex items-center gap-1 text-[10px] text-rose-200/80">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            ¿Confirmas el coste estimado ({s.coste_estimado})?
                        </span>
                        <button
                            type="button"
                            onClick={() => alAprobar(s.id)}
                            className="mc-alzar cursor-pointer rounded-md border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-[10px] text-rose-100"
                        >
                            Sí, aprobar
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmandoPago(false)}
                            className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/50"
                        >
                            Cancelar
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => manejarAprobar()}
                            className="mc-alzar cursor-pointer rounded-md border border-emerald-300/40 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-100"
                        >
                            <Check className="h-3 w-3 mr-1" aria-hidden /> Aprobar
                        </button>
                        <button
                            type="button"
                            onClick={() => alRechazar(s.id)}
                            className="cursor-pointer rounded-md border border-rose-300/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200"
                        >
                            <X className="h-3 w-3 mr-1" aria-hidden /> Rechazar
                        </button>
                        <div className="relative ml-auto">
                            <button
                                type="button"
                                className="cursor-pointer rounded-md border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-100"
                            >
                                <Clock className="h-3 w-3 mr-1 inline" aria-hidden /> Aprobar tipo…
                            </button>
                            <div className="absolute right-0 top-full mt-1 z-10 mc-cristal rounded-lg border border-white/10 bg-black/40 p-1.5 shadow-lg min-w-[140px]">
                                <button
                                    type="button"
                                    onClick={() => alAprobarTipo(s.tipo, 1)}
                                    className="w-full mc-alzar cursor-pointer rounded-md px-2 py-1 text-[10px] text-white/80 hover:bg-white/5"
                                >
                                    1 hora
                                </button>
                                <button
                                    type="button"
                                    onClick={() => alAprobarTipo(s.tipo, 8)}
                                    className="w-full mc-alzar cursor-pointer rounded-md px-2 py-1 text-[10px] text-white/80 hover:bg-white/5"
                                >
                                    8 horas
                                </button>
                                <button
                                    type="button"
                                    onClick={() => alAprobarTipo(s.tipo, 24)}
                                    className="w-full mc-alzar cursor-pointer rounded-md px-2 py-1 text-[10px] text-white/80 hover:bg-white/5"
                                >
                                    24 horas
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function TarjetaAprobada({ a }: { a: SugerenciaAprobada }) {
    const estadoColor: Record<SugerenciaAprobada["estado"], string> = {
        en_curso: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
        integrada: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
        fallo: "border-rose-300/35 bg-rose-400/10 text-rose-200",
        plan_dejado: "border-amber-300/30 bg-amber-400/10 text-amber-200",
    };
    const estadoTexto: Record<SugerenciaAprobada["estado"], string> = {
        en_curso: "En curso",
        integrada: "Integrada",
        fallo: "Falló",
        plan_dejado: "Plan dejado",
    };

    return (
        <div className="mc-cristal rounded-lg border border-white/10 bg-black/25 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-mono text-[11px] text-cyan-200/90">{a.id}</span>
                        <span className={`rounded-full border px-1.5 text-[10px] ${estadoColor[a.estado]}`}>
                            {estadoTexto[a.estado]}
                        </span>
                        <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/60">
                            {a.modo === "plan" ? "Plan" : "Escribe"}
                        </span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">{a.titulo}</p>
                    <p className="mt-1 text-[10px] text-white/55">
                        <span className="font-medium text-white/70">{a.agente}</span> ·{" "}
                        <span className="font-mono text-cyan-200/70">{a.modelo}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/50">{a.motivo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px]">
                        <span className="text-white/50">Aprobada {formatearHace(a.aprobada_en)}</span>
                        {a.duracion_aprobacion && (
                            <span className="text-white/40">· expira en {a.duracion_aprobacion} h</span>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}

export function SugerenciasPotentes() {
    const [datos, setDatos] = useState<DatosSugerencias | null>(null);
    const [aprobadas, setAprobadas] = useState<SugerenciaAprobada[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        try {
            setCargando(true);
            const [resSugs, resAprob] = await Promise.all([
                fetch("/api/mando/sugerencias-potentes", { cache: "no-store" }),
                fetch("/api/mando/sugerencias-aprobadas", { cache: "no-store" }),
            ]);
            if (resSugs.ok) {
                const d = await resSugs.json();
                setDatos(d);
            }
            if (resAprob.ok) {
                const d = await resAprob.json();
                setAprobadas(d.aprobadas ?? []);
            }
            setError(null);
        } catch (e) {
            setError("No se pudieron leer las sugerencias.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargar();
        const intervalo = window.setInterval(cargar, 10_000);
        return () => window.clearInterval(intervalo);
    }, [cargar]);

    const aprobar = useCallback(async (id: string) => {
        try {
            const res = await fetch("/api/mando/sugerencias-potentes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "aprobar", id }),
            });
            if (res.ok) {
                await cargar();
            }
        } catch {
            /* error silencioso: la recarga lo reflejará */
        }
    }, [cargar]);

    const rechazar = useCallback(async (id: string) => {
        try {
            const res = await fetch("/api/mando/sugerencias-potentes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "rechazar", id }),
            });
            if (res.ok) {
                await cargar();
            }
        } catch {
            /* error silencioso */
        }
    }, [cargar]);

    const aprobarTipo = useCallback(async (tipo: string, horas: number) => {
        try {
            const res = await fetch("/api/mando/sugerencias-potentes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "aprobar-tipo", tipo, horas }),
            });
            if (res.ok) {
                await cargar();
            }
        } catch {
            /* error silencioso */
        }
    }, [cargar]);

    if (cargando && !datos) {
        return (
            <div className="space-y-2" role="status" aria-label="Cargando sugerencias">
                <EsqueletoSugerencia />
                <EsqueletoSugerencia />
                <EsqueletoSugerencia />
            </div>
        );
    }

    if (error) {
        return (
            <p className="mc-centrado mt-2 rounded-md border border-rose-300/25 bg-rose-400/10 px-2 py-1.5 text-[11px] leading-snug text-rose-100">
                {error}
            </p>
        );
    }

    const sinCupo = datos?.sin_cupo ?? [];
    const sugerencias = datos?.sugerencias ?? [];

    return (
        <div className="space-y-3">
            {(sugerencias.length === 0 && sinCupo.length === 0) ? (
                <p className="mc-centrado mt-2 text-[11px] leading-relaxed text-white/45">
                    Sin sugerencias de agentes potentes ahora mismo.
                </p>
            ) : (
                <>
                    {sugerencias.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-white/45 mb-2">
                                Sugerencias ({sugerencias.length})
                            </h4>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {sugerencias.map((s) => (
                                    <TarjetaSugerencia
                                        key={s.id}
                                        s={s}
                                        alAprobar={aprobar}
                                        alRechazar={rechazar}
                                        alAprobarTipo={aprobarTipo}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {sinCupo.length > 0 && (
                        <div className="mt-3">
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-white/45 mb-2">
                                Sin cupo ({sinCupo.length})
                            </h4>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {sinCupo.map((s) => (
                                    <div key={s.id} className="mc-cristal rounded-lg border border-white/10 bg-black/25 p-3 opacity-60">
                                        <p className="flex flex-wrap items-baseline gap-1.5">
                                            <span className="font-mono text-[11px] text-cyan-200/90">{s.id}</span>
                                            <span className="rounded-full border border-rose-300/35 bg-rose-400/10 px-1.5 text-[10px] text-rose-200">
                                                Sin cupo
                                            </span>
                                            <span className="rounded-full border border-white/10 px-1.5 text-[10px] text-white/60">
                                                P{String(s.prioridad).padStart(3, "0")}
                                            </span>
                                        </p>
                                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/60">{s.titulo}</p>
                                        <p className="mt-1 text-[10px] text-white/40">Tipo: {s.tipo} — ningún agente con cupo disponible</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {aprobadas.length > 0 && (
                        <div className="mt-3">
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-white/45 mb-2">
                                Aprobadas ({aprobadas.length})
                            </h4>
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {aprobadas.map((a) => (
                                    <TarjetaAprobada key={a.id} a={a} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
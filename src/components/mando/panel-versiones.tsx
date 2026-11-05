"use client";

/**
 * Panel «Versiones» del Centro de Versiones (Ola 1105V · VER1105C)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato `architecture/centro-versiones-1105.md` §4: versión publicada, fase y
 * detalle del lanzamiento, enlaces al run y a la release, botones «Lanzar
 * versión», «Pausar/Reanudar», «Reintentar paso» (solo si atascado) y el
 * interruptor «Lanzar sola al terminar cada lista» (POST `auto`). Una fila por
 * medio: icono lucide, título, formatos con su enlace de descarga, versión,
 * chip de estado (al-dia · generando · verificando · atascado · no-disponible)
 * y botón «Generar/Actualizar» (POST `regenerar` con su medio; para web,
 * «Publicar ahora»). Debajo, la línea de tiempo: `pasos` (fase, hora, detalle)
 * y `jobs` (medio, job, estado, duración, enlace). Sondea
 * `GET /api/mando/lanzamientos` cada 5 s solo con la pestaña visible.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Globe,
    Smartphone,
    Monitor,
    Cpu,
    Server,
    SmartphoneNfc,
    Tablet,
    Database,
    Library,
    Play,
    Pause,
    RotateCw,
    AlertTriangle,
    ExternalLink,
    Clock,
    GitBranch,
    Loader2,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { LanzamientoEstado, MedioFila } from "@/lib/mando/lanzamientos-tipos";
import { filasDeMedios } from "@/lib/mando/lanzamientos";

interface DatosLanzamiento {
    estado: LanzamientoEstado;
}

const ICONO_MEDIO: Record<string, React.ComponentType<{ className?: string }>> = {
    web: Globe,
    pwa: Smartphone,
    macos: Monitor,
    windows: Cpu,
    linux: Server,
    android: SmartphoneNfc,
    ios: Tablet,
    canales: Database,
    libreria: Library,
};

const CLASE_ESTADO: Record<string, string> = {
    "al-dia": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    generando: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    verificando: "bg-sky-500/20 text-sky-300 border-sky-500/30",
    atascado: "bg-red-500/20 text-red-300 border-red-500/30",
    "no-disponible": "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const TEXTO_ESTADO: Record<string, string> = {
    "al-dia": "Al día",
    generando: "Generando",
    verificando: "Verificando",
    atascado: "Atascado",
    "no-disponible": "No disponible",
};

function horaCorta(iso: string | null): string {
    if (!iso) return "—";
    const t = Date.parse(iso);
    return Number.isFinite(t)
        ? new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
        : "—";
}

function formatoDuracion(inicio: string | null, fin: string | null): string {
    if (!inicio) return "—";
    const i = Date.parse(inicio);
    const f = fin ? Date.parse(fin) : Date.now();
    if (!Number.isFinite(i) || !Number.isFinite(f)) return "—";
    const s = Math.floor((f - i) / 1000);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h} h ${m % 60} min`;
}

function ChipEstado({ estado }: { estado: string }) {
    const clase = CLASE_ESTADO[estado] || CLASE_ESTADO["no-disponible"];
    const texto = TEXTO_ESTADO[estado] || estado;
    return (
        <Badge variant="outline" className={clase}>
            {texto}
        </Badge>
    );
}

function FilaMedio({
    fila,
    version,
    runUrl,
    releaseUrl,
    enAccion,
    alRegenerar,
}: {
    fila: MedioFila;
    version: string;
    runUrl?: string;
    releaseUrl?: string;
    enAccion: boolean;
    alRegenerar: (medio: string) => void;
}) {
    const Icono = ICONO_MEDIO[fila.id] || Globe;

    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-start gap-3">
                <Icono className="h-5 w-5 shrink-0 text-white/70 mt-0.5" aria-hidden />
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <h4 className="font-semibold text-white truncate">{fila.titulo}</h4>
                        <span className="font-mono text-xs text-white/50">v{version}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {fila.formatos.map((f, i) => (
                            <span key={i} className="flex items-center gap-1 text-white/70">
                                <span className="font-mono text-white/50">{f.nombre}</span>
                                {f.url && (
                                    <a
                                        href={f.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex cursor-pointer items-center gap-1 text-sky-300 hover:underline"
                                    >
                                        <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                                    </a>
                                )}
                            </span>
                        ))}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                        <ChipEstado estado={fila.estado} />
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={enAccion}
                            onClick={() => void alRegenerar(fila.id)}
                            className="mc-alzar h-7 text-xs"
                        >
                            {fila.id === "web" ? "Publicar ahora" : "Generar/Actualizar"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LineaTiempo({ pasos, jobs }: { pasos: LanzamientoEstado["pasos"]; jobs: LanzamientoEstado["jobs"] }) {
    return (
        <div className="space-y-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Línea de tiempo</h4>

            {pasos.length > 0 && (
                <div className="space-y-2">
                    <h5 className="text-[11px] font-medium text-white/70">Pasos del lanzamiento</h5>
                    <ul className="space-y-1.5">
                        {pasos.map((p, i) => (
                            <li key={i} className="flex flex-wrap items-start gap-2 text-xs">
                                <span className="shrink-0 flex items-center gap-1.5 text-white/70">
                                    <GitBranch className="h-3 w-3" aria-hidden />
                                    <span className="font-medium">{p.fase}</span>
                                </span>
                                <span className="font-mono text-white/40">{new Date(p.t).toLocaleTimeString("es-ES")}</span>
                                <span className="truncate text-white/60">{p.detalle}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {jobs.length > 0 && (
                <div className="space-y-2">
                    <h5 className="text-[11px] font-medium text-white/70">Jobs de compilación</h5>
                    <ul className="space-y-1.5">
                        {jobs.map((j, i) => (
                            <li key={`${j.medio}-${j.job}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="shrink-0 flex items-center gap-1.5 text-white/70">
                                    <Clock className="h-3 w-3" aria-hidden />
                                    <span className="font-medium">{j.medio || "—"}</span>
                                </span>
                                <span className="font-mono text-white/50 truncate max-w-[150px]">{j.job}</span>
                                <Badge variant="outline" className={
                                    j.estado === "ok" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                                    j.estado === "fallo" ? "bg-red-500/20 text-red-300 border-red-500/30" :
                                    j.estado === "en-curso" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                                    j.estado === "omitido" ? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" :
                                    "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                }>
                                    {j.estado}
                                </Badge>
                                <span className="font-mono text-white/40 ml-auto">{formatoDuracion(j.inicio, j.fin)}</span>
                                {j.url && (
                                    <a
                                        href={j.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex cursor-pointer items-center gap-1 text-sky-300 hover:underline"
                                    >
                                        <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {pasos.length === 0 && jobs.length === 0 && (
                <p className="text-xs text-white/45">Sin pasos ni jobs todavía.</p>
            )}
        </div>
    );
}

export function PanelVersiones() {
    const [datos, setDatos] = useState<DatosLanzamiento | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const vivoRef = useRef(true);

    useEffect(() => {
        return () => {
            vivoRef.current = false;
        };
    }, []);

    const cargar = useCallback(async () => {
        if (document.visibilityState === "hidden") return;
        setError(null);
        try {
            const r = await fetch("/api/mando/lanzamientos", { cache: "no-store" });
            if (!vivoRef.current) return;
            if (!r.ok) {
                setError(r.status === 404 ? "Este panel solo funciona en Genesis local (404 en producción)." : `No se pudo leer el lanzamiento (HTTP ${r.status}).`);
                return;
            }
            const cuerpo = await r.json();
            setDatos({ estado: cuerpo.estado ?? cuerpo });
        } catch {
            if (vivoRef.current) setError("No se pudo leer el lanzamiento.");
        }
    }, []);

    useEffect(() => {
        void cargar();
        let intervalo: number | null = null;
        const empezar = () => {
            if (intervalo === null) intervalo = window.setInterval(() => void cargar(), 5_000);
        };
        const parar = () => {
            if (intervalo !== null) window.clearInterval(intervalo);
            intervalo = null;
        };
        const alCambiarVisibilidad = () => (document.visibilityState === "visible" ? empezar() : parar());
        if (document.visibilityState === "visible") empezar();
        document.addEventListener("visibilitychange", alCambiarVisibilidad);
        return () => {
            parar();
            document.removeEventListener("visibilitychange", alCambiarVisibilidad);
        };
    }, [cargar]);

    const actuar = useCallback(
        async (cuerpo: Record<string, unknown>) => {
            setOcupado(true);
            setError(null);
            try {
                const r = await fetch("/api/mando/lanzamientos", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(cuerpo),
                });
                const salida = (await r.json().catch(() => ({}))) as { error?: string; detalle?: string };
                if (!r.ok) {
                    setError(salida.error ?? `No se pudo completar la acción (HTTP ${r.status}).`);
                    return false;
                }
                await cargar();
                return true;
            } catch {
                setError("No se pudo completar la acción.");
                return false;
            } finally {
                setOcupado(false);
            }
        },
        [cargar],
    );

    const alRegenerar = useCallback(
        (medio: string) => void actuar({ accion: "regenerar", medio }),
        [actuar],
    );

    const estado = datos?.estado ?? null;
    const versionPublicada = estado?.version || "";
    const filas = estado ? filasDeMedios(estado, versionPublicada) : [];
    const pausado = estado?.pausado === true;
    const atascado = estado?.fase === "atascado";

    return (
        <section
            data-testid="panel-versiones"
            aria-label="Centro de Versiones"
            className="mc-cristal mc-entrar rounded-xl p-4"
        >
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <GitBranch className="h-4 w-4" aria-hidden />
                    Centro de Versiones
                </h3>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                    {estado?.fase || "esperando-lista"}
                </span>
            </header>

            {error ? <p className="mt-2 text-xs text-rose-200" role="alert">{error}</p> : null}
            {!datos && !error ? <p className="mt-3 text-xs text-white/50">Leyendo el estado del lanzamiento…</p> : null}

            {estado && (
                <div className="mt-3 space-y-4">
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-baseline gap-3">
                            <span className="text-lg font-mono font-semibold text-white">v{versionPublicada || "—"}</span>
                            <span className="text-xs text-white/60">{estado.detalle}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                            {estado.run_url && (
                                <a
                                    href={estado.run_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex cursor-pointer items-center gap-1 text-sky-300 hover:underline"
                                >
                                    <ExternalLink className="h-3 w-3" aria-hidden />
                                    Ver run
                                </a>
                            )}
                            {estado.release_url && (
                                <a
                                    href={estado.release_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex cursor-pointer items-center gap-1 text-sky-300 hover:underline"
                                >
                                    <ExternalLink className="h-3 w-3" aria-hidden />
                                    Ver release
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="default"
                            size="sm"
                            disabled={ocupado || estado.fase === "compilando" || estado.fase === "verificando-archivos"}
                            onClick={() => void actuar({ accion: "lanzar" })}
                            className="mc-alzar"
                        >
                            <Play className="h-3.5 w-3.5" aria-hidden />
                            Lanzar versión
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={ocupado}
                            onClick={() => void actuar({ accion: pausado ? "reanudar" : "pausar" })}
                            className="mc-alzar"
                        >
                            {pausado ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                            {pausado ? "Reanudar" : "Pausar"}
                        </Button>
                        {atascado && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={ocupado}
                                onClick={() => void actuar({ accion: "reintentar" })}
                                className="mc-alzar"
                            >
                                <RotateCw className="h-3.5 w-3.5" aria-hidden />
                                Reintentar paso
                            </Button>
                        )}
                        <div className="ml-auto flex items-center gap-2 text-xs text-white/60">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                <Switch
                                    checked={false}
                                    onCheckedChange={(v) => void actuar({ accion: "auto", activo: v })}
                                    disabled={ocupado}
                                    aria-label="Lanzar sola al terminar cada lista"
                                />
                                <span>Lanzar sola al terminar cada lista</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/50">Medios</h4>
                        {filas.length === 0 ? (
                            <p className="text-xs text-white/45">Sin medios configurados.</p>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {filas.map((f) => (
                                    <FilaMedio
                                        key={f.id}
                                        fila={f}
                                        version={versionPublicada}
                                        runUrl={estado.run_url}
                                        releaseUrl={estado.release_url}
                                        enAccion={ocupado}
                                        alRegenerar={alRegenerar}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <LineaTiempo pasos={estado.pasos} jobs={estado.jobs} />
                </div>
            )}
        </section>
    );
}
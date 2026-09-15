"use client";

/**
 * Panel «Publicar» del Centro de Mando (Ola 239)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que espera el visto bueno de Alex y, desde aquí mismo, el botón que lo
 * publica: cabecera (rama, HEAD, commits sin publicar), tres semáforos
 * (tsc · vitest · revisiones), áreas tocadas, la lista de commits y
 * <PublicarAhora>, que commitea, pasa las cuatro puertas, empuja y verifica
 * cambio por cambio.
 *
 * Antes este panel solo escribía un manifiesto y te mandaba a la terminal a
 * teclear `git push`. Ese «preparar» ya no está: era el apaño de no poder
 * publicar, y tenerlo al lado del botón de verdad sería dos formas de hacer lo
 * mismo, una de ellas a medias.
 */

import { useCallback, useEffect, useState } from "react";
import { CircleDashed, RefreshCw, Ruler } from "lucide-react";

import type { DiarioPublicacion } from "@/lib/mando/publicador-tipos";
import type { EstadoPublicacion } from "@/lib/mando/publicacion";
import { PublicarAhora } from "@/components/mando/publicar-ahora";

/** Clase del semáforo según el estado de la comprobación. */
function claseSemaforo(estado: "desconocido" | "ok" | "falla"): string {
    if (estado === "ok") return "bg-emerald-400";
    if (estado === "falla") return "bg-red-400";
    return "bg-zinc-600";
}

/** Etiqueta legible del estado de una comprobación. */
function textoSemaforo(estado: "desconocido" | "ok" | "falla"): string {
    if (estado === "ok") return "en verde";
    if (estado === "falla") return "falla";
    return "sin medir";
}

/** Un semáforo: punto de color + etiqueta + texto del estado. */
function Semaforo({ nombre, estado }: { nombre: string; estado: "desconocido" | "ok" | "falla" }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${claseSemaforo(estado)}`} aria-hidden />
            <span className="text-xs font-medium text-white/80">{nombre}</span>
            <span className="ml-auto text-[11px] text-white/50">{textoSemaforo(estado)}</span>
        </div>
    );
}

/** Panel principal: sondeo, cabecera, semáforos, áreas, commits y el botón que publica. */
export function PanelPublicacion() {
    const [estado, setEstado] = useState<EstadoPublicacion | null>(null);
    const [diario, setDiario] = useState<DiarioPublicacion | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(true);

    const cargar = useCallback(async () => {
        try {
            const respuesta = await fetch("/api/mando/publicacion", { cache: "no-store" });
            if (!respuesta.ok) {
                setError(
                    respuesta.status === 404
                        ? "La consola está apagada en esta instancia (solo funciona en local o con STARSEED_MANDO=1)."
                        : respuesta.status === 401
                          ? "Necesitas iniciar sesión para ver la publicación."
                          : `No se pudo leer el estado de publicación (HTTP ${respuesta.status}).`,
                );
                setEstado(null);
                return;
            }
            const cuerpo = (await respuesta.json()) as EstadoPublicacion & { diario?: DiarioPublicacion | null };
            setEstado(cuerpo);
            setDiario(cuerpo.diario ?? null);
            setError(null);
        } catch {
            setError("No se pudo leer el estado de publicación.");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
        const cada = window.setInterval(() => void cargar(), 30_000);
        return () => window.clearInterval(cada);
    }, [cargar]);


    if (cargando && !estado) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo lo que espera tu visto bueno…
            </div>
        );
    }

    if (error && !estado) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error}
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Reintentar
                </button>
            </div>
        );
    }

    if (!estado) return null;

    const areas = Object.entries(estado.areas).sort((a, b) => b[1] - a[1]);

    return (
        <section data-testid="panel-publicacion" className="space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Ruler className="h-4 w-4" />
                    Publicar
                </h2>
                <button
                    type="button"
                    onClick={() => void cargar()}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Actualizar
                </button>
            </header>

            <PublicarAhora diario={diario} alCambiar={() => void cargar()} />

            {/* Cabecera de estado */}
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">Rama</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-white">{estado.rama ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">HEAD</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-white">{estado.head ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-white/50">Commits sin publicar</p>
                    <p className={`mt-1 text-lg font-semibold ${estado.sinPublicar > 0 ? "text-amber-300" : "text-white"}`}>
                        {estado.sinPublicar}
                    </p>
                </div>
            </div>

            {/* Semáforos de comprobación */}
            <div className="grid gap-2 sm:grid-cols-3">
                <Semaforo nombre="tsc" estado={estado.comprobaciones.tsc} />
                <Semaforo nombre="vitest" estado={estado.comprobaciones.vitest} />
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${estado.comprobaciones.revisionesBloqueantes > 0 ? "bg-red-400" : "bg-emerald-400"}`}
                        aria-hidden
                    />
                    <span className="text-xs font-medium text-white/80">Revisiones bloqueantes</span>
                    <span className="ml-auto text-[11px] text-white/50">{estado.comprobaciones.revisionesBloqueantes}</span>
                </div>
            </div>

            {/* Áreas tocadas */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-sm font-semibold text-white">Áreas tocadas</h3>
                {areas.length === 0 ? (
                    <p className="mt-2 text-sm text-white/50">Sin archivos cambiados en `src/`.</p>
                ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {areas.map(([area, conteo], i) => (
                            <span
                                key={`${area}-${i}`}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/80"
                            >
                                {area}
                                <span className="text-white/50">· {conteo}</span>
                            </span>
                        ))}
                    </div>
                )}
                <p className="mt-2 text-[11px] text-white/40">{estado.archivosCambiados} archivos cambiados en total.</p>
            </div>

            {/* Lista de commits */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="text-sm font-semibold text-white">Commits sin publicar</h3>
                {estado.commits.length === 0 ? (
                    <p className="mt-2 text-sm text-white/50">Nada pendiente respecto a `origin/main`.</p>
                ) : (
                    <ul className="mt-2 space-y-1">
                        {estado.commits.map((c, i) => (
                            <li key={`${c.sha}-${i}`} className="flex items-start gap-2 font-mono text-xs text-white/70">
                                <span className="text-white/40">{c.sha}</span>
                                {c.ola ? <span className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/60">Ola {c.ola}</span> : null}
                                <span className="truncate text-white/80">{c.titulo}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

        </section>
    );
}
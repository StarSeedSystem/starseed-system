"use client";

// src/components/mando/linea-tiempo.tsx
// -----------------------------------------------------------------------------
// Línea de tiempo horizontal de una tarea (Ola 232 · Centro de Mando).
//
// Dibuja un carril por tarea con sus hitos (inicio → avisos → commit /
// bloqueante / fallo), ordenados cronológicamente, con la duración calculada
// entre el primer hito de arranque y el de cierre. El color de cada hito sale
// de la clasificación visual de `clasificar` (src/lib/mando/eventos.ts).
// -----------------------------------------------------------------------------

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";

import { clasificar } from "@/lib/mando/eventos";
import type { EventoRelevo } from "@/lib/mando/tipos";

/** Repositorio remoto para componer el enlace al commit/diff. */
const REPO_REMOTO = "https://github.com/StarSeedSystem/starseed-system";

/** Hitos que cuentan como «cierre» de la tarea (terminan el carril). */
const TIPOS_CIERRE = new Set(["commit", "bloqueante", "fallo", "sin_cambios", "verificado"]);

/** Extrae un hash de commit de un texto (7–40 caracteres hexadecimales). */
function extraerCommit(texto: string): string | null {
    const coincide = /\b([0-9a-f]{7,40})\b/i.exec(texto);
    return coincide ? coincide[1] : null;
}

/** Ordena eventos por `t` ascendente (el carril va de izquierda a derecha). */
function compararFecha(a: EventoRelevo, b: EventoRelevo): number {
    return a.t.localeCompare(b.t);
}

/** Formatea una marca de tiempo ISO en «HH:MM:SS» local. */
function horaLocal(iso: string): string {
    if (!iso) return "—";
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return "—";
    return fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Duración legible entre dos marcas ISO (p. ej. «3m 42s» o «1h 5m»). */
function duracionEntre(inicio: string, fin: string): string {
    const a = new Date(inicio).getTime();
    const b = new Date(fin).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
    const segundos = Math.max(0, Math.round((b - a) / 1000));
    if (segundos < 60) return `${segundos}s`;
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `${minutos}m ${segundos % 60}s`;
    const horas = Math.floor(minutos / 60);
    return `${horas}h ${minutos % 60}m`;
}

/**
 * Carril horizontal de los hitos de una tarea, con su duración total.
 *
 * @param eventos lista completa de eventos (se filtran por `tarea` dentro).
 * @param tarea   (opcional) id de la tarea a dibujar; si no se pasa, se usan
 *                todos los eventos recibidos.
 */
export function LineaTiempo({
    eventos,
    tarea,
}: {
    eventos: EventoRelevo[];
    tarea?: string;
}) {
    const hitos = useMemo(() => {
        const propios =
            tarea && tarea.trim()
                ? eventos.filter((e) => (e.tarea || "").trim() === tarea.trim())
                : eventos;
        return propios.sort(compararFecha);
    }, [eventos, tarea]);

    if (hitos.length === 0) {
        return (
            <p className="text-xs text-white/40">
                No hay hitos registrados para esta tarea todavía.
            </p>
        );
    }

    const inicio = hitos[0];
    const cierre = [...hitos].reverse().find((e) => TIPOS_CIERRE.has(e.tipo)) ?? null;
    const duracion =
        cierre && inicio && inicio !== cierre ? duracionEntre(inicio.t, cierre.t) : "";

    return (
        <div className="space-y-2">
            <div className="flex items-end justify-between gap-2">
                <div className="flex items-baseline gap-2 text-[11px] text-white/50">
                    <span className="font-mono text-white/60">{horaLocal(inicio.t)}</span>
                    <span aria-hidden>→</span>
                    <span className="font-mono text-white/60">
                        {cierre ? horaLocal(cierre.t) : "en curso"}
                    </span>
                </div>
                {duracion && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                        {duracion}
                    </span>
                )}
            </div>

            <ol className="relative flex items-center gap-2 overflow-x-auto pb-1">
                {hitos.map((evento, índice) => {
                    const clase = clasificar(evento);
                    const commit = evento.tipo === "commit" ? extraerCommit(evento.texto) : null;
                    const esUltimo = índice === hitos.length - 1;
                    const url = commit ? `${REPO_REMOTO}/commit/${commit}` : null;

                    return (
                        <li key={`${evento.id}-${índice}`} className="flex shrink-0 items-center gap-2">
                            {índice > 0 && (
                                <span aria-hidden className="h-px w-6 shrink-0 bg-white/20" />
                            )}
                            {url ? (
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={evento.texto}
                                    className="group flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
                                    style={{ borderColor: `${clase.color}66`, color: clase.color }}
                                >
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: clase.color }}
                                    />
                                    <span className="text-white/80">{evento.tipo}</span>
                                    <span className="font-mono text-[10px] text-white/50">
                                        {commit}
                                    </span>
                                    <ExternalLink
                                        className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100"
                                        style={{ color: clase.color }}
                                    />
                                </a>
                            ) : (
                                <span
                                    title={evento.texto}
                                    className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
                                    style={{ borderColor: `${clase.color}66`, color: clase.color }}
                                >
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: clase.color }}
                                    />
                                    <span className="text-white/80">{evento.tipo}</span>
                                </span>
                            )}
                            {!esUltimo && (
                                <span className="sr-only">siguiente hito</span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
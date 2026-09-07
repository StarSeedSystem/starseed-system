"use client";

/**
 * TOMAS DE VOZ — lista de síntesis del Estudio (Ola 265 · Forja fase 3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Panel que muestra las tomas (negativos de síntesis) de la voz seleccionada.
 * Cada «Probar» del Estudio deja una aquí. Permite:
 *
 *  · Reproducir la toma (con `<audio>` desde su data URL) si guardó el WAV.
 *  · Valorarla con estrellas 1–5 y anotar notas.
 *  · Comparar DOS tomas: se reproducen en secuencia y se resumen qué
 *    parámetros difieren entre ellas.
 *  · Promoverla a VERSIÓN (receta congelada) para el flujo de versiones.
 *  · Descargar el WAV (enlace al data URL) y borrarla.
 *
 * Vive en `localStorage` vía `tomas-voz.ts` (clave `starseed.voces.tomas-voz.v1`).
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowUp, Download, Play, Star, Trash2, X } from "lucide-react";

import {
    actualizarTomaVoz,
    borrarTomaVoz,
    listarTomasVozDe,
    suscribirTomasVoz,
    versionDesdeToma,
    type TomaVoz,
} from "@/lib/voces/tomas-voz";
import { crearVersion } from "@/lib/voces/versiones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
    /** Voz cuyas tomas se muestran. */
    timbreId: string;
    /** Nombre de la voz, para dar nombre a las versiones promovidas. */
    nombreVoz: string;
}

/** Texto legible de los efectos de una toma, para la comparación. */
function resumenEfectos(t: TomaVoz): string {
    const e = t.params.efectos;
    if (!e) return "sin efectos";
    const partes: string[] = [];
    if (e.eq && e.eq !== "ninguna") partes.push(`eq ${e.eq}`);
    if (e.reverb !== undefined && e.reverb > 0) partes.push(`reverb ${e.reverb.toFixed(2)}`);
    if (e.compresor) partes.push("compresor");
    if (e.deesser) partes.push("de-esser");
    if (e.ganancia !== undefined && e.ganancia !== 0) partes.push(`${e.ganancia > 0 ? "+" : ""}${e.ganancia} dB`);
    return partes.length ? partes.join(" · ") : "sin efectos";
}

/** Resumen de lo que define el sonido de una toma (para cabecera y comparar). */
function resumenParams(t: TomaVoz): string {
    const partes: string[] = [`vel ${t.params.speed.toFixed(2)}`];
    if (t.params.seed !== undefined) partes.push(`semilla ${t.params.seed}`);
    if (t.params.pitch !== undefined && t.params.pitch !== 1) partes.push(`tono ${t.params.pitch.toFixed(2)}`);
    if (t.params.emocion && t.params.emocion !== "neutra") {
        partes.push(`${t.params.emocion}${t.params.intensidad !== undefined && t.params.intensidad !== 1 ? ` ×${t.params.intensidad.toFixed(1)}` : ""}`);
    }
    partes.push(resumenEfectos(t));
    return partes.join(" · ");
}

export function TomasVoz({ timbreId, nombreVoz }: Props) {
    const [tomas, setTomas] = useState<TomaVoz[]>([]);
    const [comparando, setComparando] = useState<string[]>([]);
    const [reproduciendo, setReproduciendo] = useState<string | null>(null);

    useEffect(() => suscribirTomasVoz(() => setTomas(listarTomasVozDe(timbreId))), [timbreId]);
    useEffect(() => {
        setTomas(listarTomasVozDe(timbreId));
        setComparando([]);
    }, [timbreId]);

    const enComparacion = (id: string) => comparando.includes(id);

    const alternarComparacion = (id: string) => {
        setComparando((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            if (prev.length >= 2) return [prev[1], id];
            return [...prev, id];
        });
    };

    const seleccionadas = useMemo(
        () => comparando.map((id) => tomas.find((t) => t.id === id)).filter((t): t is TomaVoz => Boolean(t)),
        [comparando, tomas],
    );

    const reproducir = (id: string) => {
        const toma = tomas.find((t) => t.id === id);
        if (!toma?.audioDataUrl) return;
        setReproduciendo(id);
        const audio = new Audio(`data:audio/wav;base64,${toma.audioDataUrl}`);
        audio.onended = () => setReproduciendo(null);
        audio.onerror = () => setReproduciendo(null);
        void audio.play().catch(() => setReproduciendo(null));
    };

    const promover = (toma: TomaVoz) => {
        const version = versionDesdeToma(toma);
        crearVersion(version);
        setComparando((prev) => prev.filter((x) => x !== toma.id));
    };

    const valorar = (id: string, valor: 1 | 2 | 3 | 4 | 5) => {
        actualizarTomaVoz(id, { valoracion: valor });
    };

    const descargar = (toma: TomaVoz) => {
        if (!toma.audioDataUrl) return;
        try {
            const enlace = document.createElement("a");
            enlace.href = `data:audio/wav;base64,${toma.audioDataUrl}`;
            enlace.download = `starseed-toma-${toma.timbreId}-${toma.id.slice(0, 6)}.wav`;
            enlace.click();
        } catch {
            /* sin descarga posible */
        }
    };

    const esNueva = (t: TomaVoz) => comparando.includes(t.id) && comparando.length <= 2;

    return (
        <div data-testid="tomas-voz" className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium leading-none">Tomas de síntesis</p>
                <span className="text-xs text-muted-foreground">{tomas.length} en esta voz</span>
            </div>

            {comparando.length === 2 && seleccionadas.length === 2 && (
                <Comparador a={seleccionadas[0]} b={seleccionadas[1]} onCerrar={() => setComparando([])} />
            )}

            {tomas.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Aún no hay tomas: pulsa «Probar» en Ajustes para guardar la primera.
                </p>
            )}

            <ul className="space-y-2" aria-label="Tomas de síntesis de esta voz">
                {tomas.map((toma) => (
                    <li key={toma.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                            <button
                                type="button"
                                onClick={() => alternarComparacion(toma.id)}
                                aria-pressed={enComparacion(toma.id)}
                                className={`cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors duration-200 ${
                                    enComparacion(toma.id)
                                        ? "border-primary/60 bg-primary/10 text-foreground"
                                        : "border-border text-muted-foreground hover:bg-muted/60"
                                }`}
                                title={esNueva(toma) ? "Marcada para comparar" : "Marca para comparar"}
                            >
                                {esNueva(toma) ? <X className="h-3.5 w-3.5" /> : <span>Comparar</span>}
                            </button>
                            <Badge variant="outline">{toma.nivel}</Badge>
                        </div>

                        <p className="mt-2 line-clamp-2 text-sm text-foreground/90">{toma.texto}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{resumenParams(toma)}</p>

                        {toma.audioDataUrl && (
                            <div className="mt-2">
                                <audio
                                    key={toma.id}
                                    controls
                                    preload="none"
                                    src={`data:audio/wav;base64,${toma.audioDataUrl}`}
                                    className="h-8 w-full"
                                />
                            </div>
                        )}
                        {toma.sinAudio && (
                            <p className="mt-2 text-xs text-muted-foreground">
                                Sin audio guardado: el WAV pesaba demasiado o no llegó del motor.
                            </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {toma.audioDataUrl ? (
                                <Button type="button" size="sm" variant="outline" onClick={() => reproducir(toma.id)} className="cursor-pointer">
                                    <Play className="mr-1 h-3.5 w-3.5" /> {reproduciendo === toma.id ? "Sonando…" : "Reproducir"}
                                </Button>
                            ) : (
                                <Button type="button" size="sm" variant="outline" disabled className="cursor-pointer">
                                    <Play className="mr-1 h-3.5 w-3.5" /> Sin audio
                                </Button>
                            )}
                            <Button type="button" size="sm" variant="outline" onClick={() => promover(toma)} className="cursor-pointer">
                                <ArrowUp className="mr-1 h-3.5 w-3.5" /> Promover a versión
                            </Button>
                            {toma.audioDataUrl && (
                                <Button type="button" size="sm" variant="ghost" onClick={() => descargar(toma)} className="cursor-pointer">
                                    <Download className="mr-1 h-3.5 w-3.5" /> Descargar WAV
                                </Button>
                            )}
                            <Button type="button" size="sm" variant="ghost" onClick={() => borrarTomaVoz(toma.id)} className="cursor-pointer text-destructive">
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Borrar
                            </Button>
                        </div>

                        <div className="mt-2 flex items-center gap-1" role="group" aria-label="Valorar toma">
                            {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => valorar(toma.id, n as 1 | 2 | 3 | 4 | 5)}
                                    aria-label={`${n} estrellas`}
                                    className="cursor-pointer"
                                >
                                    <Star
                                        className={`h-4 w-4 transition-colors duration-200 ${
                                            (toma.valoracion ?? 0) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                                        }`}
                                    />
                                </button>
                            ))}
                            {toma.notas && <span className="ml-2 text-xs text-muted-foreground">{toma.notas}</span>}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Resumen de qué difiere entre dos tomas comparadas. */
function Comparador({ a, b, onCerrar }: { a: TomaVoz; b: TomaVoz; onCerrar: () => void }) {
    const difieren: string[] = [];
    if (a.params.speed !== b.params.speed) difieren.push("velocidad");
    if (a.params.seed !== b.params.seed) difieren.push("semilla");
    if (a.params.pitch !== b.params.pitch) difieren.push("tono");
    if ((a.params.emocion ?? "neutra") !== (b.params.emocion ?? "neutra")) difieren.push("emoción");
    if (a.params.intensidad !== b.params.intensidad) difieren.push("intensidad");
    if (resumenEfectos(a) !== resumenEfectos(b)) difieren.push("efectos");

    const reproducirSecuencia = () => {
        const audio1 = new Audio(`data:audio/wav;base64,${a.audioDataUrl}`);
        audio1.play().catch(() => null);
        if (b.audioDataUrl) {
            audio1.onended = () => {
                const audio2 = new Audio(`data:audio/wav;base64,${b.audioDataUrl}`);
                void audio2.play().catch(() => null);
            };
        }
    };

    return (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Comparando dos tomas</p>
                <button type="button" onClick={onCerrar} className="cursor-pointer text-muted-foreground" aria-label="Cerrar comparación">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                {a.nombreVoz} A vs B — difieren en: {difieren.length ? difieren.join(" · ") : "nada (parámetros idénticos)"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                {[a, b].map((toma, i) => (
                    <span key={toma.id} className="rounded border px-2 py-1 text-xs">
                        {i === 0 ? "A" : "B"} · {resumenParams(toma)}
                    </span>
                ))}
            </div>
            {a.audioDataUrl && b.audioDataUrl && (
                <Button type="button" size="sm" onClick={reproducirSecuencia} className="mt-2 cursor-pointer">
                    <Play className="mr-1 h-3.5 w-3.5" /> Reproducir A → B
                </Button>
            )}
        </div>
    );
}
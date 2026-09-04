"use client";

/**
 * BANCO DE PRUEBAS A/B DE VOZ (Ola 240 · Tarea VZ3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Compara lado a lado la MISMA frase sintetizada con hasta CUATRO versiones de
 * voz (`VersionVoz` de `src/lib/voces/versiones.ts`). Cada columna muestra los
 * parámetros clave de su versión y un botón «Escuchar» que sintetiza la frase
 * elegida por la vía de su motor:
 *
 *   · estudio / alta  → `POST /api/voz/hablar` (demonio OmniVoice) y reproduce
 *     el WAV resultante en un `<audio>`.
 *   · ligera / minima → `hablarStarSeed` tras fijar el timbre de la versión de
 *     forma temporal (se restaura el anterior al terminar).
 *
 * Muestra la latencia medida de cada síntesis, un botón «Escuchar todas en
 * orden» y una valoración de 1 a 5 estrellas por versión que llama a
 * `onValorar`. Cada columna enseña su error de forma honesta (demonio apagado,
 * 404, tiempo de espera…), nunca una columna en blanco.
 */

import { useMemo, useRef, useState } from "react";
import { ListMusic, Play, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import { hablarStarSeed } from "@/lib/aurora/voz-starseed/motor";
import { NIVELES } from "@/lib/aurora/voz-starseed/niveles";
import {
    aplicarVersionATimbre,
    type VersionVoz,
} from "@/lib/voces/versiones";

/** Clave donde `fijarTimbre` guarda el timbre actual (ver `timbres.ts`). */
const CLAVE_TIMBRE = "starseed.voz.timbre.v1";

/** Frases de prueba predefinidas: bienvenida, técnica, emotiva, número y fecha. */
const FRASES_PREDEFINIDAS: { etiqueta: string; texto: string }[] = [
    {
        etiqueta: "Bienvenida del rito",
        texto: "Bienvenido a StarSeed. Soy Aurora, tu guía en esta red.",
    },
    {
        etiqueta: "Explicación técnica",
        texto: "El motor de voz usa un modelo cuantizado a 1,58 bits: pesos ternarios que no necesitan tarjeta gráfica.",
    },
    {
        etiqueta: "Frase emotiva",
        texto: "A veces basta una voz cálida para que un lugar se sienta como casa.",
    },
    {
        etiqueta: "Número y fecha",
        texto: "El próximo encuentro es el viernes 12 de septiembre de 2026, a las 18:45.",
    },
];

interface EstadoColumna {
    latenciaMs: number | null;
    error: string | null;
}

interface Props {
    /** Versiones elegidas para comparar (hasta cuatro). */
    versiones: VersionVoz[];
    /** Se invoca al valorar una versión, con su id y el valor 1–5. */
    onValorar: (id: string, valor: number) => void;
}

export function BancoPruebasVoz({ versiones, onValorar }: Props) {
    const [frase, setFrase] = useState(FRASES_PREDEFINIDAS[0]?.texto ?? "");
    const [estados, setEstados] = useState<Record<string, EstadoColumna>>({});
    const [sintetizando, setSintetizando] = useState<string | null>(null);
    const [sonandoTodas, setSonandoTodas] = useState(false);
    const [valorando, setValorando] = useState<string | null>(null);
    const reproductores = useRef<Map<string, HTMLAudioElement>>(new Map());

    /** Hasta cuatro versiones: mantiene claves únicas aunque llegue un id repetido. */
    const elegidas = useMemo(() => {
        const vistos = new Set<string>();
        const resultado: { version: VersionVoz; clave: string }[] = [];
        for (const v of versiones.slice(0, 4)) {
            let clave = v.id;
            let n = 2;
            while (vistos.has(clave)) {
                clave = `${v.id}-${n}`;
                n += 1;
            }
            vistos.add(clave);
            resultado.push({ version: v, clave });
        }
        return resultado;
    }, [versiones]);

    /** Orden de reproducción para «Escuchar todas»: las elegidas en orden. */
    const elegirFrase = (texto: string) => setFrase(texto);

    /** Recupera el timbre previo guardado, o `null` si no había ninguno. */
    const leerTimbreAnterior = (): string | null => {
        if (typeof window === "undefined") return null;
        try {
            return window.localStorage.getItem(CLAVE_TIMBRE);
        } catch {
            return null;
        }
    };

    /** Restaura el timbre previo tras una síntesis por motor único. */
    const restaurarTimbre = (previo: string | null) => {
        if (typeof window === "undefined") return;
        try {
            if (previo === null) {
                window.localStorage.removeItem(CLAVE_TIMBRE);
            } else {
                window.localStorage.setItem(CLAVE_TIMBRE, previo);
            }
        } catch { /* sin almacenamiento */ }
    };

    /** Fija temporalmente el timbre de una versión (devuelve el previo). */
    const fijarTimbreTemporal = (version: VersionVoz): string | null => {
        const previo = leerTimbreAnterior();
        const timbre = aplicarVersionATimbre(version);
        try {
            if (typeof window !== "undefined") {
                window.localStorage.setItem(CLAVE_TIMBRE, timbre.id);
            }
        } catch { /* sin almacenamiento */ }
        return previo;
    };

    /** Reproduce un blob de audio en un elemento `<audio>`. */
    const reproducirBlob = (clave: string, blob: Blob): Promise<void> => {
        return new Promise((resolver) => {
            try {
                const anterior = reproductores.current.get(clave);
                if (anterior && !anterior.paused) anterior.pause();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                reproductores.current.set(clave, audio);
                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    resolver();
                };
                audio.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolver();
                };
                void audio.play();
            } catch {
                resolver();
            }
        });
    };

    /** Sintetiza la frase con ESTA versión; mide y anota la latencia. */
    const escucharVersion = async (clave: string, version: VersionVoz): Promise<void> => {
        const texto = frase.trim();
        setEstados((e) => ({ ...e, [clave]: { latenciaMs: null, error: null } }));
        if (!texto) {
            setEstados((e) => ({
                ...e,
                [clave]: { latenciaMs: null, error: "Escribe una frase antes de escuchar." },
            }));
            return;
        }
        setSintetizando(clave);
        const inicio = performance.now();
        try {
            if (version.motor === "estudio" || version.motor === "alta") {
                // Vía del demonio: proxy `/api/voz/hablar`, que devuelve el WAV.
                const control = new AbortController();
                const temporizador = setTimeout(() => control.abort(), 30_000);
                let resp: Response;
                try {
                    resp = await fetch("/api/voz/hablar", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            texto,
                            voz: version.params.voz,
                            speed: version.params.speed,
                            ...(version.params.instruct ? { instruct: version.params.instruct } : {}),
                        }),
                        signal: control.signal,
                    });
                } catch (err) {
                    clearTimeout(temporizador);
                    const aborted = err instanceof DOMException && err.name === "AbortError";
                    setEstados((e) => ({
                        ...e,
                        [clave]: {
                            latenciaMs: null,
                            error: aborted
                                ? "El demonio tardó demasiado (30 s) sin responder."
                                : "No se pudo hablar con el demonio local.",
                        },
                    }));
                    return;
                }
                clearTimeout(temporizador);
                if (resp.status === 404) {
                    setEstados((e) => ({
                        ...e,
                        [clave]: { latenciaMs: null, error: "La ruta de voz no existe en esta instancia (404)." },
                    }));
                    return;
                }
                if (!resp.ok) {
                    let mensaje = "El demonio respondió con error.";
                    try {
                        const datos = (await resp.json().catch(() => ({}))) as { error?: string };
                        if (typeof datos.error === "string" && datos.error) mensaje = datos.error;
                    } catch { /* sin cuerpo */ }
                    setEstados((e) => ({ ...e, [clave]: { latenciaMs: null, error: mensaje } }));
                    return;
                }
                const audio = await resp.blob();
                await reproducirBlob(clave, audio);
                setEstados((e) => ({
                    ...e,
                    [clave]: { latenciaMs: Math.round(performance.now() - inicio), error: null },
                }));
            } else {
                // Vía del motor único (ligera/minima): fijar timbre temporal.
                const previo = fijarTimbreTemporal(version);
                const timbre = aplicarVersionATimbre(version);
                let ok = false;
                try {
                    ok = await hablarStarSeed(texto, {
                        timbre,
                        contexto: "aviso",
                        nivel: version.motor,
                    });
                } finally {
                    restaurarTimbre(previo);
                }
                if (!ok) {
                    setEstados((e) => ({
                        ...e,
                        [clave]: {
                            latenciaMs: null,
                            error: `El motor «${NIVELES[version.motor].etiqueta}» no pudo sonar en este equipo.`,
                        },
                    }));
                    return;
                }
                setEstados((e) => ({
                    ...e,
                    [clave]: { latenciaMs: Math.round(performance.now() - inicio), error: null },
                }));
            }
        } catch {
            setEstados((e) => ({
                ...e,
                [clave]: { latenciaMs: null, error: "No se pudo reproducir el audio." },
            }));
        } finally {
            setSintetizando(null);
        }
    };

    /** Reproduce las versiones elegidas una tras otra, en el orden de la lista. */
    const escucharTodas = async () => {
        if (sonandoTodas || elegidas.length === 0) return;
        setSonandoTodas(true);
        try {
            for (const { clave, version } of elegidas) {
                await escucharVersion(clave, version);
            }
        } finally {
            setSonandoTodas(false);
        }
    };

    const etiquetaTamano = (version: VersionVoz): string => {
        if (version.tamano === "auto") return "auto";
        return version.tamano;
    };

    return (
        <div className="space-y-6">
            {/* ── Frase de prueba ──────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Frase de prueba</CardTitle>
                    <CardDescription>
                        La misma frase se sintetiza con cada versión para compararlas lado a lado.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {FRASES_PREDEFINIDAS.map((f) => (
                            <button
                                key={f.etiqueta}
                                type="button"
                                onClick={() => elegirFrase(f.texto)}
                                aria-pressed={frase === f.texto}
                                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-200 ${
                                    frase === f.texto
                                        ? "border-primary/60 bg-primary/10"
                                        : "border-border hover:bg-muted/60"
                                }`}
                            >
                                {f.etiqueta}
                            </button>
                        ))}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="frase-libre">Frase</Label>
                        <Textarea
                            id="frase-libre"
                            rows={2}
                            value={frase}
                            onChange={(e) => setFrase(e.target.value)}
                            placeholder="Escribe una frase libre para probar…"
                        />
                    </div>
                </CardContent>
            </Card>

            {/* ── Acciones globales ────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-3">
                <Button
                    type="button"
                    onClick={() => void escucharTodas()}
                    disabled={sonandoTodas || elegidas.length === 0 || !frase.trim()}
                    className="cursor-pointer"
                >
                    <ListMusic className="mr-1.5 h-4 w-4" />
                    {sonandoTodas ? "Sonando…" : "Escuchar todas en orden"}
                </Button>
                <span className="text-xs text-muted-foreground">
                    {elegidas.length === 0
                        ? "Elige hasta cuatro versiones para comparar."
                        : `${elegidas.length} ${elegidas.length === 1 ? "versión" : "versiones"} a comparar.`}
                </span>
            </div>

            {/* ── Columnas por versión ─────────────────────────────────────── */}
            {elegidas.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                    No hay versiones seleccionadas para el banco de pruebas.
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {elegidas.map(({ version, clave }) => {
                        const estado = estados[clave] ?? { latenciaMs: null, error: null };
                        const sonando = sintetizando === clave;
                        const valorActual = version.valoracion;
                        return (
                            <Card key={clave} className="flex flex-col">
                                <CardHeader>
                                    <CardTitle className="truncate text-sm" title={version.nombre}>
                                        {version.nombre}
                                    </CardTitle>
                                    <CardDescription className="flex flex-wrap gap-1.5">
                                        <Badge variant="outline">{NIVELES[version.motor].etiqueta}</Badge>
                                        <Badge variant="secondary">{etiquetaTamano(version)}</Badge>
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-1 flex-col gap-3">
                                    {/* Parámetros clave */}
                                    <dl className="space-y-1 text-xs">
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-muted-foreground">Voz</dt>
                                            <dd className="font-medium">{version.params.voz}</dd>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-muted-foreground">Velocidad</dt>
                                            <dd className="tabular-nums">{version.params.speed.toFixed(2)}</dd>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-muted-foreground">Carácter</dt>
                                            <dd className="truncate text-right" title={version.params.instruct}>
                                                {version.params.instruct.trim() || "—"}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-muted-foreground">Expr</dt>
                                            <dd className="tabular-nums">
                                                {version.params.expr.arco.toFixed(2)}/
                                                {version.params.expr.vivacidad.toFixed(2)}/
                                                {version.params.expr.calidez.toFixed(2)}
                                            </dd>
                                        </div>
                                    </dl>

                                    {/* Resultado: latencia o error honesto */}
                                    <div className="min-h-[2.5rem]">
                                        {estado.error ? (
                                            <p role="status" className="text-xs text-destructive">
                                                {estado.error}
                                            </p>
                                        ) : estado.latenciaMs != null ? (
                                            <p role="status" className="text-xs tabular-nums text-emerald-600">
                                                Sintetizado en {estado.latenciaMs} ms
                                            </p>
                                        ) : null}
                                    </div>

                                    {/* Escuchar */}
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => void escucharVersion(clave, version)}
                                        disabled={sonando || !frase.trim()}
                                        className="w-full cursor-pointer"
                                    >
                                        <Play className="mr-1.5 h-4 w-4" />
                                        {sonando ? "Sintetizando…" : "Escuchar"}
                                    </Button>

                                    {/* Valoración 1–5 */}
                                    <div
                                        className="flex items-center justify-center gap-1"
                                        role="radiogroup"
                                        aria-label={`Valorar ${version.nombre}`}
                                        onMouseLeave={() => setValorando(null)}
                                    >
                                        {[1, 2, 3, 4, 5].map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                role="radio"
                                                aria-checked={valorActual === n}
                                                aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
                                                className="cursor-pointer p-0.5 transition-transform duration-150 hover:scale-110"
                                                onMouseEnter={() => setValorando(clave)}
                                                onClick={() => onValorar(version.id, n)}
                                            >
                                                <Star
                                                    aria-hidden
                                                    className={`h-4 w-4 ${
                                                        n <= (valorando === clave ? n : (valorActual ?? 0))
                                                            ? "fill-amber-400 text-amber-400"
                                                            : "text-muted-foreground/40"
                                                    }`}
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
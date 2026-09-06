"use client";

/**
 * PANEL «OÍDO 1.58» — reconocimiento de voz ternario (Ola 249 · motor v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pestaña del Estudio de Voces para probar VibeASR.cpp (ASR ternario 1.58-bit
 * en CPU, ~1,6 GB de GGUF) a través del daemon local y su proxy:
 * grabar del micrófono (MediaRecorder, límite 60 s) o subir un archivo,
 * transcribir con el oído local y comparar con el Whisper del navegador.
 *
 * Nota honesta (2026-09-06): `oss-stt.ts` solo ofrece dictado EN VIVO por
 * segmentos (VAD + lotes); no expone una transcripción de un Blob ya grabado.
 * Por eso el botón «Comparar con Whisper» queda deshabilitado con esa nota,
 * hasta que exista una vía de transcripción de blob en el navegador.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Ear, Mic, RefreshCw, Square, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
    COMANDO_INSTALAR_OIDO,
    estadoOido,
    transcribirLocal,
    type EstadoOido,
} from "@/lib/aurora/stt-oss/vibeasr-local";

/** Límite duro de grabación: 60 s bastan para probar y protegen la cola del daemon. */
const LIMITE_GRABACION_S = 60;
/** Solo se conservan las últimas 5 tomas (historial vivo, nada persiste). */
const MAX_TOMAS = 5;

interface Aviso {
    tipo: "ok" | "error";
    texto: string;
}

/** Una toma transcrita del historial local del panel. */
interface Toma {
    id: number;
    texto: string;
    motor: string;
    segundos: number;
}

/** Cachea la duración del último blob grabado/subido (para el RTF aproximado). */
interface AudioActual {
    blob: Blob;
    duracionS: number | null;
}

export function PanelOido() {
    const [estado, setEstado] = useState<EstadoOido | null>(null);
    const [sondeando, setSondeando] = useState(false);
    const [grabando, setGrabando] = useState(false);
    const [segundosGrabados, setSegundosGrabados] = useState(0);
    const [audio, setAudio] = useState<AudioActual | null>(null);
    const [transcribiendo, setTranscribiendo] = useState(false);
    const [tomas, setTomas] = useState<Toma[]>([]);
    const [aviso, setAviso] = useState<Aviso | null>(null);

    const grabador = useRef<MediaRecorder | null>(null);
    const trozos = useRef<Blob[]>([]);
    const inicioGrabacion = useRef(0);
    const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);
    const siguienteId = useRef(1);

    /** Sondea el estado del oído (instalación/modelos/ocupación). Nunca lanza. */
    const sondear = useCallback(async () => {
        setSondeando(true);
        try {
            setEstado(await estadoOido());
        } finally {
            setSondeando(false);
        }
    }, []);

    useEffect(() => {
        void sondear();
    }, [sondear]);

    /** Detiene el temporizador de la cuenta atrás de grabación. */
    const pararReloj = () => {
        if (temporizador.current) {
            clearInterval(temporizador.current);
            temporizador.current = null;
        }
    };

    /** Duración real del blob (segundos) usando un elemento <audio> efímero. */
    const medirDuracion = (blob: Blob): Promise<number | null> =>
        new Promise((resolve) => {
            try {
                const url = URL.createObjectURL(blob);
                const el = new Audio();
                el.preload = "metadata";
                el.onloadedmetadata = () => {
                    const d = Number.isFinite(el.duration) ? el.duration : null;
                    URL.revokeObjectURL(url);
                    resolve(d);
                };
                el.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(null);
                };
                el.src = url;
            } catch {
                resolve(null);
            }
        });

    const detenerGrabacion = useCallback(() => {
        pararReloj();
        try {
            if (grabador.current && grabador.current.state !== "inactive") {
                grabador.current.stop();
            }
        } catch {
            /* si ya estaba parado, no pasa nada */
        }
        setGrabando(false);
    }, []);

    const iniciarGrabacion = async () => {
        setAviso(null);
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            setAviso({ tipo: "error", texto: "Sin permiso de micrófono. Concédelo para grabar." });
            return;
        }
        // Elegimos el mimeType soportado (webm/opus primero; Safari suele dar mp4).
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
            (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
        );
        if (!mime) {
            stream.getTracks().forEach((t) => t.stop());
            setAviso({ tipo: "error", texto: "Este navegador no puede grabar audio (MediaRecorder)." });
            return;
        }
        const rec = new MediaRecorder(stream, { mimeType: mime });
        trozos.current = [];
        inicioGrabacion.current = performance.now();
        rec.ondataavailable = (e) => {
            if (e.data.size > 0) trozos.current.push(e.data);
        };
        rec.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            const durMs = performance.now() - inicioGrabacion.current;
            const blob = new Blob(trozos.current, { type: mime });
            // Duración por reloj de pared: fiable aunque el blob no la declare.
            setAudio({ blob, duracionS: Math.max(0.1, Math.round(durMs / 100) / 10) });
        };
        grabador.current = rec;
        rec.start();
        setGrabando(true);
        setSegundosGrabados(0);
        // Cuenta atrás y corte automático a los 60 s.
        temporizador.current = setInterval(() => {
            const transcurridos = (performance.now() - inicioGrabacion.current) / 1000;
            setSegundosGrabados(Math.floor(transcurridos));
            if (transcurridos >= LIMITE_GRABACION_S) detenerGrabacion();
        }, 250);
    };

    const alSubirArchivo = async (archivo: File | null) => {
        setAviso(null);
        if (!archivo) return;
        const duracion = await medirDuracion(archivo);
        setAudio({ blob: archivo, duracionS: duracion });
    };

    const transcribir = async () => {
        if (!audio) return;
        setTranscribiendo(true);
        setAviso(null);
        try {
            const r = await transcribirLocal(audio.blob);
            if (!r.texto.trim()) {
                setAviso({ tipo: "error", texto: "El oído no reconoció palabras en esta toma." });
                return;
            }
            setTomas((prev) =>
                [
                    { id: siguienteId.current++, texto: r.texto, motor: r.motor, segundos: r.segundos },
                    ...prev,
                ].slice(0, MAX_TOMAS),
            );
            // RTF aproximado: segundos de cómputo / duración del audio.
            const rtf = audio.duracionS && audio.duracionS > 0 ? r.segundos / audio.duracionS : null;
            setAviso({
                tipo: "ok",
                texto: `Transcrito en ${r.segundos.toFixed(1)} s${
                    rtf != null ? ` · RTF ≈ ${rtf.toFixed(2)}` : ""
                }${rtf != null && rtf < 1 ? " (más rápido que el habla)" : ""}.`,
            });
            // Refresca la ocupación real del daemon tras una toma.
            void sondear();
        } catch (e) {
            setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo transcribir." });
        } finally {
            setTranscribiendo(false);
        }
    };

    const listo = estado != null && estado.instalado && estado.modelos;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Ear className="h-4 w-4" aria-hidden />
                        Oído 1.58 — reconocimiento de voz ternario (VibeASR.cpp)
                    </CardTitle>
                    <CardDescription>
                        ASR cuantizado a 1,58 bits corriendo en la CPU de esta neurona (~1,6 GB de
                        modelos, punto flotante cero). Se carga bajo demanda y se libera: nada
                        corre en paralelo a la voz salvo que quepa en memoria.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Estado de instalación / ocupación */}
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-2 text-sm">
                            <span
                                aria-hidden
                                className={`h-2.5 w-2.5 rounded-full ${
                                    estado == null
                                        ? "bg-muted-foreground/40"
                                        : listo
                                          ? estado.ocupado
                                              ? "bg-amber-500"
                                              : "bg-emerald-500"
                                          : "bg-destructive"
                                }`}
                            />
                            {estado == null
                                ? "Daemon inalcanzable (¿apagado o el OS en la nube?)"
                                : !listo
                                  ? "Oído no instalado"
                                  : estado.ocupado
                                    ? "Oído ocupado transcribiendo"
                                    : "Oído listo"}
                        </span>
                        {estado?.modelos && <Badge variant="secondary">modelos GGUF presentes</Badge>}
                        {estado != null && estado.cola > 0 && (
                            <Badge variant="outline">cola: {estado.cola}</Badge>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void sondear()}
                            disabled={sondeando}
                            className="cursor-pointer"
                        >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Volver a medir
                        </Button>
                    </div>

                    {/* Comando de instalación cuando falta el binario o los modelos */}
                    {estado != null && !listo && (
                        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                            <p className="text-sm">
                                Falta {estado.instalado ? "descargar los modelos GGUF" : "compilar VibeASR.cpp"}.
                                Ejecuta en la terminal de esta neurona:
                            </p>
                            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                                <code>{COMANDO_INSTALAR_OIDO}</code>
                            </pre>
                        </div>
                    )}

                    {/* Grabación / subida */}
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            type="button"
                            variant={grabando ? "destructive" : "default"}
                            onClick={() => (grabando ? detenerGrabacion() : void iniciarGrabacion())}
                            className="cursor-pointer"
                        >
                            {grabando ? (
                                <>
                                    <Square className="mr-1.5 h-4 w-4" />
                                    Detener ({LIMITE_GRABACION_S - segundosGrabados} s)
                                </>
                            ) : (
                                <>
                                    <Mic className="mr-1.5 h-4 w-4" />
                                    Grabar
                                </>
                            )}
                        </Button>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted/60">
                            <Upload className="h-4 w-4" aria-hidden />
                            Subir audio
                            <input
                                type="file"
                                accept="audio/*"
                                className="hidden"
                                aria-label="Subir un archivo de audio"
                                onChange={(e) => {
                                    void alSubirArchivo(e.target.files?.[0] ?? null);
                                    e.target.value = "";
                                }}
                            />
                        </label>
                        {audio && (
                            <span className="text-sm text-muted-foreground">
                                Toma lista ({(audio.blob.size / 1024).toFixed(0)} KB
                                {audio.duracionS != null ? ` · ${audio.duracionS.toFixed(1)} s` : ""})
                            </span>
                        )}
                    </div>

                    {/* Acciones de transcripción */}
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            type="button"
                            onClick={() => void transcribir()}
                            disabled={!audio || transcribiendo || !listo || (estado?.ocupado ?? false)}
                            className="cursor-pointer"
                        >
                            <Ear className="mr-1.5 h-4 w-4" />
                            {transcribiendo ? "Transcribiendo…" : "Transcribir con el oído 1.58"}
                        </Button>
                        {/* oss-stt.ts solo dicta en vivo; no hay transcripción de blob. */}
                        <Button
                            type="button"
                            variant="outline"
                            disabled
                            title="Whisper del navegador solo dicta en vivo"
                            className="cursor-pointer"
                        >
                            Comparar con Whisper (navegador)
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Whisper del navegador solo dicta en vivo
                        </span>
                    </div>

                    {aviso && (
                        <p
                            role="status"
                            className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}
                        >
                            {aviso.texto}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Últimas tomas (solo memoria del panel; no se persisten) */}
            {tomas.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Últimas tomas</CardTitle>
                        <CardDescription>Historial vivo de esta sesión del Estudio.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-2">
                            {tomas.map((t) => (
                                <li
                                    key={t.id}
                                    className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                                >
                                    <p className="whitespace-pre-wrap">{t.texto}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {t.motor} · {t.segundos.toFixed(1)} s
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

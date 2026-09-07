"use client";

/**
 * SUBPESTAÑA «CLONAR» DEL ESTUDIO DE VOCES (Ola 266 · Forja fase 4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Clonación con poco audio (3-20 s) sobre la voz seleccionada: grabar del
 * micrófono (MediaRecorder, mismo patrón que `panel-oido.tsx`) o subir un
 * archivo, escribir la transcripción EXACTA de lo que se dice, marcar el
 * consentimiento explícito y guardar la referencia en el daemon. El daemon
 * precodifica los códigos .rvq y, al sintetizar con `clon: true`, reclona la
 * voz; por eso «Escuchar clon» habla con un timbre clonado y «Borrar
 * referencia» deshace la subida.
 *
 * La voz es identidad soberana: sin consentimiento nada se sube.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Play, RefreshCw, Save, Square, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
    TEXTO_MIN,
    TEXTO_MAX,
    borrarClon,
    listarClones,
    subirMuestraClon,
    validarTextoMuestra,
    type ClonVoz,
} from "@/lib/voces/clonacion";
import { buscarTimbre, type Timbre } from "@/lib/aurora/timbres";

/** Texto sugerido (~12 s) para leer en voz alta al grabar la muestra de referencia. */
const TEXTO_SUGERIDO =
    "Hola, esta es mi voz. Llevo años contando historias a mi manera, con pausas y sin prisa, para que suene natural y cercana.";

/** Límite duro de grabación: 20 s bastan para una referencia de clonación. */
const LIMITE_GRABACION_S = 20;

interface Aviso {
    tipo: "ok" | "error";
    texto: string;
}

interface PropsClonarVoz {
    /** Id del timbre destino ([a-z0-9-], 2-40): la referencia se guarda bajo este id. */
    timbreId: string;
    /** Nombre legible de la voz, para los mensajes y la muestra clonada. */
    nombre: string;
}

export function ClonarVoz({ timbreId, nombre }: PropsClonarVoz) {
    const [grabando, setGrabando] = useState(false);
    const [segundosGrabados, setSegundosGrabados] = useState(0);
    const [audio, setAudio] = useState<Blob | null>(null);
    const [texto, setTexto] = useState("");
    const [consentimiento, setConsentimiento] = useState(false);
    const [clon, setClon] = useState<ClonVoz | null>(null);
    const [sondeando, setSondeando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [escuchando, setEscuchando] = useState(false);
    const [aviso, setAviso] = useState<Aviso | null>(null);

    const grabador = useRef<MediaRecorder | null>(null);
    const trozos = useRef<Blob[]>([]);
    const inicioGrabacion = useRef(0);
    const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);
    const entradaArchivo = useRef<HTMLInputElement | null>(null);

    /** Refresca el estado de la referencia guardada para este timbre. */
    const refrescar = useCallback(async () => {
        setSondeando(true);
        try {
            const clones = await listarClones();
            const actual = clones.find((c) => c.timbre === timbreId.trim().toLowerCase()) ?? null;
            setClon(actual);
        } catch {
            setClon(null);
        } finally {
            setSondeando(false);
        }
    }, [timbreId]);

    useEffect(() => {
        void refrescar();
        // Al cambiar de voz (o salir de la pestaña) se limpia el texto sugerido
        // vacío: no arrastramos la transcripción de otra voz.
        return () => {
            if (temporizador.current) clearInterval(temporizador.current);
        };
    }, [refrescar]);

    /** Timbre real + `clon: true` para «Escuchar clon». */
    const timbreClon = useCallback((): Timbre | null => {
        const base = buscarTimbre(timbreId);
        if (!base) return null;
        return {
            ...base,
            local: { ...base.local, clon: true },
        };
    }, [timbreId]);

    /** Detiene el reloj de grabación. */
    const pararReloj = () => {
        if (temporizador.current) {
            clearInterval(temporizador.current);
            temporizador.current = null;
        }
    };

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
            setAviso({ tipo: "error", texto: "Sin permiso de micrófono. Concédelo para grabar la muestra." });
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
            const blob = new Blob(trozos.current, { type: mime });
            setAudio(blob.size > 0 ? blob : null);
        };
        grabador.current = rec;
        rec.start();
        setGrabando(true);
        setSegundosGrabados(0);
        // Cuenta atrás y corte automático a los 20 s.
        temporizador.current = setInterval(() => {
            const transcurridos = (performance.now() - inicioGrabacion.current) / 1000;
            setSegundosGrabados(Math.floor(transcurridos));
            if (transcurridos >= LIMITE_GRABACION_S) detenerGrabacion();
        }, 250);
    };

    const guardar = async () => {
        setAviso(null);
        if (!audio) {
            setAviso({ tipo: "error", texto: "Primero graba o sube una muestra de audio." });
            return;
        }
        if (!consentimiento) {
            setAviso({ tipo: "error", texto: "Marca el consentimiento antes de guardar la referencia." });
            return;
        }
        const errorTexto = validarTextoMuestra(texto);
        if (errorTexto) {
            setAviso({ tipo: "error", texto: errorTexto });
            return;
        }
        setGuardando(true);
        try {
            const r = await subirMuestraClon({
                audio,
                texto,
                timbreId,
                consentimiento: true,
            });
            if (!r.ok) {
                setAviso({ tipo: "error", texto: r.error ?? "No se pudo guardar la referencia." });
                return;
            }
            setAviso({ tipo: "ok", texto: "Referencia guardada y precodificada (.rvq)." });
            await refrescar();
        } finally {
            setGuardando(false);
        }
    };

    const escuchar = async () => {
        setAviso(null);
        if (!clon) {
            setAviso({ tipo: "error", texto: "No hay referencia guardada todavía para escuchar." });
            return;
        }
        const t = timbreClon();
        if (!t) {
            setAviso({ tipo: "error", texto: "No se encontró el timbre de esta voz." });
            return;
        }
        setEscuchando(true);
        try {
            const { hablarStarSeed } = await import("@/lib/aurora/voz-starseed/motor");
            const sono = await hablarStarSeed(TEXTO_SUGERIDO, { timbre: t, contexto: "aviso" });
            if (!sono) {
                setAviso({ tipo: "error", texto: "No se pudo reproducir el clon (¿daemon local apagado?)." });
            }
        } catch {
            setAviso({ tipo: "error", texto: "No se pudo cargar la vía de voz." });
        } finally {
            setEscuchando(false);
        }
    };

    const borrar = async () => {
        setAviso(null);
        const r = await borrarClon(timbreId);
        if (!r.ok) {
            setAviso({ tipo: "error", texto: r.error ?? "No se pudo borrar la referencia." });
            return;
        }
        setAviso({ tipo: "ok", texto: "Referencia borrada." });
        setAudio(null);
        setClon(null);
    };

    const alSubirArchivo = (archivo: File | null) => {
        setAviso(null);
        if (archivo) setAudio(archivo);
    };

    return (
        <div className="space-y-5 pt-1" data-testid="clonar-voz">
            <p className="text-xs text-muted-foreground">
                Clona la voz de «{nombre}» con un fragmento corto de audio de su persona titular:
                úsala solo con su consentimiento y para fines responsables.
            </p>

            {/* Estado de la referencia guardada */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 text-sm">
                    <span
                        aria-hidden
                        className={`h-2.5 w-2.5 rounded-full ${
                            clon ? "bg-emerald-500" : "bg-muted-foreground/40"
                        }`}
                    />
                    {clon ? "Referencia guardada" : "Sin referencia todavía"}
                </span>
                {clon && (
                    <>
                        {clon.duracionS != null && (
                            <Badge variant="secondary">{clon.duracionS.toFixed(1)} s</Badge>
                        )}
                        {clon.rvq && <Badge variant="outline">rvq listo</Badge>}
                    </>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void refrescar()}
                    disabled={sondeando}
                    className="cursor-pointer"
                >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Volver a leer
                </Button>
            </div>

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
                            Grabar muestra
                        </>
                    )}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => entradaArchivo.current?.click()}
                    className="cursor-pointer"
                >
                    <Upload className="mr-1.5 h-4 w-4" />
                    Subir audio
                </Button>
                <input
                    ref={entradaArchivo}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    aria-label="Subir un audio de referencia"
                    onChange={(e) => {
                        alSubirArchivo(e.target.files?.[0] ?? null);
                        e.target.value = "";
                    }}
                />
                {audio && (
                    <span className="text-sm text-muted-foreground">
                        Muestra lista ({(audio.size / 1024).toFixed(0)} KB)
                    </span>
                )}
            </div>

            {/* Texto sugerido para leer en voz alta */}
            <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium leading-none">Texto para leer en voz alta (~12 s)</p>
                <p className="text-sm text-muted-foreground">{TEXTO_SUGERIDO}</p>
            </div>

            {/* Transcripción exacta */}
            <div className="space-y-1.5">
                <Label htmlFor="clonar-transcripcion">Transcripción exacta de la muestra</Label>
                <Textarea
                    id="clonar-transcripcion"
                    rows={3}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Escribe EXACTAMENTE lo que se oye en el audio (entre 20 y 400 caracteres)."
                />
                <p className="text-xs text-muted-foreground">
                    {texto.length}/{TEXTO_MAX} caracteres (mínimo {TEXTO_MIN}). La precisión decide la calidad del clon.
                </p>
            </div>

            {/* Consentimiento explícito */}
            <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                    type="checkbox"
                    checked={consentimiento}
                    onChange={(e) => setConsentimiento(e.target.checked)}
                    className="mt-0.5 h-4 w-4 cursor-pointer"
                />
                <span>
                    Confirmo que la persona cuya voz se clona lo ha autorizado y que el audio se
                    usará de forma responsable, sin suplantar su identidad.
                </span>
            </label>

            {/* Acciones */}
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    onClick={() => void guardar()}
                    disabled={guardando}
                    className="cursor-pointer"
                >
                    <Save className="mr-1.5 h-4 w-4" />
                    {guardando ? "Guardando…" : "Guardar referencia"}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void escuchar()}
                    disabled={!clon || escuchando}
                    className="cursor-pointer"
                >
                    <Play className="mr-1.5 h-4 w-4" />
                    {escuchando ? "Escuchando…" : "Escuchar clon"}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => void borrar()}
                    disabled={!clon}
                    className="cursor-pointer"
                >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Borrar referencia
                </Button>
            </div>

            {aviso && (
                <p
                    role="status"
                    className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}
                >
                    {aviso.texto}
                </p>
            )}
        </div>
    );
}
"use client";

/*
 * use-camera-engine — motor real de cámara (getUserMedia + MediaRecorder).
 * ═══════════════════════════════════════════════════════════════════════════
 * Aplica MediaTrackConstraints REALES soportadas por el hardware: resolución,
 * fps, facingMode se piden al abrir el stream; zoom/torch/exposición/foco se
 * aplican con `track.applyConstraints({advanced:[...]})` SOLO si el hardware
 * los expone en `track.getCapabilities()` — honesto: la UI solo muestra lo que
 * el dispositivo soporta de verdad, nunca simula un control inexistente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraHwSettings, PhotoFormat } from "@/lib/camera/camera-settings";
import { RESOLUTION_PRESETS } from "@/lib/camera/camera-settings";

export type CameraStatus = "idle" | "requesting" | "active" | "error";

export interface CapabilityRange {
    min: number;
    max: number;
    step: number;
}

export interface CameraCapabilitiesInfo {
    zoom: CapabilityRange | null;
    torch: boolean;
    focusDistance: CapabilityRange | null;
    exposureCompensation: CapabilityRange | null;
}

const EMPTY_CAPS: CameraCapabilitiesInfo = { zoom: null, torch: false, focusDistance: null, exposureCompensation: null };

interface ExtendedTrackCapabilities extends MediaTrackCapabilities {
    zoom?: CapabilityRange;
    torch?: boolean;
    focusDistance?: CapabilityRange;
    exposureCompensation?: CapabilityRange;
}

export interface UseCameraEngineResult {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    status: CameraStatus;
    error: string | null;
    capabilities: CameraCapabilitiesInfo;
    isRecording: boolean;
    recordMs: number;
    start: () => Promise<void>;
    stop: () => void;
    capturePhoto: (opts: { format: PhotoFormat; quality: number }) => Promise<Blob | null>;
    startRecording: () => void;
    stopRecording: () => Promise<Blob | null>;
    setZoom: (value: number) => Promise<void>;
    setTorch: (on: boolean) => Promise<void>;
    setFocusDistance: (value: number) => Promise<void>;
    setExposureCompensation: (value: number) => Promise<void>;
    mediaRecorderSupported: boolean;
}

export function useCameraEngine(settings: Pick<CameraHwSettings, "facingMode" | "resolution" | "fps">): UseCameraEngineResult {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recordStartRef = useRef<number>(0);

    const [status, setStatus] = useState<CameraStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [capabilities, setCapabilities] = useState<CameraCapabilitiesInfo>(EMPTY_CAPS);
    const [isRecording, setIsRecording] = useState(false);
    const [recordMs, setRecordMs] = useState(0);

    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setStatus("idle");
        setCapabilities(EMPTY_CAPS);
    }, []);

    const start = useCallback(async () => {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setStatus("error");
            setError("Este navegador no soporta acceso a la cámara.");
            return;
        }
        setStatus("requesting");
        setError(null);
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const { width, height } = RESOLUTION_PRESETS[settings.resolution];
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: settings.facingMode,
                    width: { ideal: width },
                    height: { ideal: height },
                    frameRate: { ideal: settings.fps },
                },
                audio: true, // necesario para grabar vídeo con sonido
            });
            streamRef.current = newStream;
            setStatus("active");
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
                await videoRef.current.play().catch(() => {});
            }

            const track = newStream.getVideoTracks()[0];
            if (track && typeof track.getCapabilities === "function") {
                try {
                    const caps = track.getCapabilities() as ExtendedTrackCapabilities;
                    setCapabilities({
                        zoom: caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 } : null,
                        torch: !!caps.torch,
                        focusDistance: caps.focusDistance
                            ? { min: caps.focusDistance.min, max: caps.focusDistance.max, step: caps.focusDistance.step || 1 }
                            : null,
                        exposureCompensation: caps.exposureCompensation
                            ? {
                                  min: caps.exposureCompensation.min,
                                  max: caps.exposureCompensation.max,
                                  step: caps.exposureCompensation.step || 0.1,
                              }
                            : null,
                    });
                } catch {
                    setCapabilities(EMPTY_CAPS);
                }
            } else {
                setCapabilities(EMPTY_CAPS);
            }
        } catch (e: unknown) {
            setStatus("error");
            const err = e as { name?: string; message?: string };
            if (err?.name === "NotAllowedError") {
                setError("Permiso de cámara/micrófono denegado. Actívalo en los ajustes del navegador para usar la Cámara.");
            } else if (err?.name === "NotFoundError") {
                setError("No se encontró ninguna cámara en este dispositivo.");
            } else if (err?.name === "NotReadableError") {
                setError("La cámara está en uso por otra aplicación.");
            } else {
                setError(err?.message || "No se pudo acceder a la cámara.");
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- se relanza a propósito solo cuando cambian los ajustes de hardware relevantes
    }, [settings.facingMode, settings.resolution, settings.fps]);

    useEffect(
        () => () => {
            streamRef.current?.getTracks().forEach((t) => t.stop());
            if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        },
        [],
    );

    const applyConstraint = useCallback(async (constraint: Record<string, unknown>) => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track) return;
        try {
            await track.applyConstraints({ advanced: [constraint] } as MediaTrackConstraints);
        } catch {
            /* el hardware no admite este ajuste ahora mismo: la UI ya solo lo ofrece si getCapabilities lo declaró */
        }
    }, []);

    const setZoom = useCallback((value: number) => applyConstraint({ zoom: value }), [applyConstraint]);
    const setTorch = useCallback((on: boolean) => applyConstraint({ torch: on }), [applyConstraint]);
    const setFocusDistance = useCallback((value: number) => applyConstraint({ focusDistance: value }), [applyConstraint]);
    const setExposureCompensation = useCallback(
        (value: number) => applyConstraint({ exposureCompensation: value }),
        [applyConstraint],
    );

    const capturePhoto = useCallback(async ({ format, quality }: { format: PhotoFormat; quality: number }): Promise<Blob | null> => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return null;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const mime = format === "png" ? "image/png" : format === "webp" ? "image/webp" : "image/jpeg";
        return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
    }, []);

    const mediaRecorderSupported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

    const startRecording = useCallback(() => {
        const s = streamRef.current;
        if (!s || isRecording || !mediaRecorderSupported) return;
        chunksRef.current = [];
        const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
        const mime = candidates.find((c) => MediaRecorder.isTypeSupported?.(c)) || "";
        try {
            const recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
            recordStartRef.current = Date.now();
            setRecordMs(0);
            recordTimerRef.current = setInterval(() => setRecordMs(Date.now() - recordStartRef.current), 200);
        } catch {
            /* MediaRecorder no soportado con estas opciones: la UI oculta el modo vídeo si esto falla siempre */
        }
    }, [isRecording, mediaRecorderSupported]);

    const stopRecording = useCallback((): Promise<Blob | null> => {
        return new Promise((resolve) => {
            const recorder = recorderRef.current;
            if (!recorder) {
                resolve(null);
                return;
            }
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" });
                chunksRef.current = [];
                resolve(blob);
            };
            try {
                recorder.stop();
            } catch {
                resolve(null);
            }
            recorderRef.current = null;
            setIsRecording(false);
            if (recordTimerRef.current) {
                clearInterval(recordTimerRef.current);
                recordTimerRef.current = null;
            }
        });
    }, []);

    return {
        videoRef,
        status,
        error,
        capabilities,
        isRecording,
        recordMs,
        start,
        stop,
        capturePhoto,
        startRecording,
        stopRecording,
        setZoom,
        setTorch,
        setFocusDistance,
        setExposureCompensation,
        mediaRecorderSupported,
    };
}

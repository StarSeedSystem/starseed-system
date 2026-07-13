"use client";

/*
 * camera-settings — Ajustes de la app Cámara (StarSeed OS).
 * ═══════════════════════════════════════════════════════════════════════════
 * Dos capas de persistencia, deliberadamente separadas:
 *   · Hardware (por DISPOSITIVO): resolución/fps/facingMode/formato/calidad/
 *     grid/temporizador — localStorage. Cada dispositivo tiene su propia
 *     cámara y capacidades reales; no tiene sentido sincronizarlo entre neuronas.
 *   · Almacenamiento (por CUENTA, sincronizado): folder destino elegida +
 *     guardar en dispositivo/nube — entity_state, para que la preferencia
 *     viaje con la cuenta a cualquier neurona (patrón library-brains.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import { getEntityState, setEntityState, type EntityRef } from "@/lib/sync/entity-state";

export type PhotoFormat = "jpeg" | "png" | "webp";
export type VideoFormat = "webm" | "mp4";
export type ResolutionPreset = "sd" | "hd" | "fullhd" | "4k";
export type TimerSeconds = 0 | 3 | 10;

export const RESOLUTION_PRESETS: Record<ResolutionPreset, { label: string; width: number; height: number }> = {
    sd: { label: "SD · 640×480", width: 640, height: 480 },
    hd: { label: "HD · 1280×720", width: 1280, height: 720 },
    fullhd: { label: "Full HD · 1920×1080", width: 1920, height: 1080 },
    "4k": { label: "4K · 3840×2160", width: 3840, height: 2160 },
};

export const FPS_OPTIONS = [24, 30, 60] as const;
export const TIMER_OPTIONS: TimerSeconds[] = [0, 3, 10];

export interface CameraHwSettings {
    facingMode: "user" | "environment";
    resolution: ResolutionPreset;
    fps: number;
    grid: boolean;
    timerSeconds: TimerSeconds;
    photoFormat: PhotoFormat;
    videoFormat: VideoFormat;
    /** 0.5–1 (calidad de codificación jpeg/webp). */
    quality: number;
}

export const DEFAULT_CAMERA_HW: CameraHwSettings = {
    facingMode: "environment",
    resolution: "fullhd",
    fps: 30,
    grid: false,
    timerSeconds: 0,
    photoFormat: "jpeg",
    videoFormat: "webm",
    quality: 0.92,
};

const HW_KEY = "starseed.camera.hw.v1";

function isClient(): boolean {
    return typeof window !== "undefined";
}

export function loadCameraHwSettings(): CameraHwSettings {
    if (!isClient()) return DEFAULT_CAMERA_HW;
    try {
        const raw = window.localStorage.getItem(HW_KEY);
        if (!raw) return DEFAULT_CAMERA_HW;
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_CAMERA_HW, ...(parsed && typeof parsed === "object" ? parsed : {}) };
    } catch {
        return DEFAULT_CAMERA_HW;
    }
}

export function saveCameraHwSettings(next: CameraHwSettings): void {
    if (!isClient()) return;
    try {
        window.localStorage.setItem(HW_KEY, JSON.stringify(next));
    } catch {
        /* cuota / modo privado: la sesión sigue funcionando en memoria */
    }
}

/** Hook local (por dispositivo) de los ajustes de hardware de la cámara. */
export function useCameraHwSettings(): [CameraHwSettings, (patch: Partial<CameraHwSettings>) => void] {
    const [settings, setSettings] = useState<CameraHwSettings>(DEFAULT_CAMERA_HW);

    useEffect(() => {
        setSettings(loadCameraHwSettings());
    }, []);

    const update = useCallback((patch: Partial<CameraHwSettings>) => {
        setSettings((prev) => {
            const next = { ...prev, ...patch };
            saveCameraHwSettings(next);
            return next;
        });
    }, []);

    return [settings, update];
}

// ─────────────────────── Almacenamiento (sincronizado por cuenta) ───────────────────────

export interface CameraStoragePrefs {
    /** Folder destino explícita elegida por el usuario (id de LibraryFolder). null = automática por origen. */
    destFolderId: string | null;
    saveToCloud: boolean;
    saveToDevice: boolean;
}

export const DEFAULT_STORAGE_PREFS: CameraStoragePrefs = {
    destFolderId: null,
    saveToCloud: true,
    saveToDevice: false,
};

const STORAGE_PREFS_KEY = "camera-storage-prefs";

function normalizeStoragePrefs(raw: unknown): CameraStoragePrefs {
    if (!raw || typeof raw !== "object") return DEFAULT_STORAGE_PREFS;
    const r = raw as Record<string, unknown>;
    return {
        destFolderId: typeof r.destFolderId === "string" ? r.destFolderId : null,
        saveToCloud: r.saveToCloud !== false,
        saveToDevice: r.saveToDevice === true,
    };
}

export async function getCameraStoragePrefs(ref: EntityRef): Promise<CameraStoragePrefs> {
    try {
        const row = await getEntityState<CameraStoragePrefs>(ref, STORAGE_PREFS_KEY);
        if (!row || !row.value) return DEFAULT_STORAGE_PREFS;
        return normalizeStoragePrefs(row.value);
    } catch {
        return DEFAULT_STORAGE_PREFS;
    }
}

export async function setCameraStoragePrefs(ref: EntityRef, prefs: CameraStoragePrefs): Promise<void> {
    try {
        await setEntityState(ref, STORAGE_PREFS_KEY, prefs);
    } catch {
        /* best-effort: la UI ya aplicó el cambio de forma optimista */
    }
}

/** Hook: ajustes de almacenamiento sincronizados de la cuenta. */
export function useCameraStoragePrefs(ref: EntityRef | null): [CameraStoragePrefs, (patch: Partial<CameraStoragePrefs>) => void, boolean] {
    const [prefs, setPrefs] = useState<CameraStoragePrefs>(DEFAULT_STORAGE_PREFS);
    const [loading, setLoading] = useState<boolean>(!!ref);

    const refKind = ref?.kind ?? "";
    const refId = ref?.id ?? "";

    useEffect(() => {
        if (!ref) {
            setPrefs(DEFAULT_STORAGE_PREFS);
            setLoading(false);
            return;
        }
        let alive = true;
        setLoading(true);
        void getCameraStoragePrefs(ref).then((p) => {
            if (alive) {
                setPrefs(p);
                setLoading(false);
            }
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refKind/refId identifican `ref` de forma estable
    }, [refKind, refId]);

    const update = useCallback(
        (patch: Partial<CameraStoragePrefs>) => {
            setPrefs((prev) => {
                const next = { ...prev, ...patch };
                if (ref) void setCameraStoragePrefs(ref, next);
                return next;
            });
        },
        [ref],
    );

    return [prefs, update, loading];
}

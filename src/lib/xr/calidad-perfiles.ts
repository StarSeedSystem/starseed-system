/**
 * StarSeed XR · PERFILES DE CALIDAD. Qué significa cada nivel en resolución, foveación, sombras, cristal,
 * capas y límites. Es una tabla (dato), no lógica: la lógica de cuándo subir o bajar vive en `calidad.ts`.
 * `escalaResolucion` es relativa al `framebufferScaleFactor` que el navegador recomienda (1 = lo normal).
 * El cristal líquido de la Trinity tiene un equivalente barato por nivel (§2 del contrato).
 */
import type { NivelCalidad } from "./tipos";

export type MaterialCristal = "plano" | "translucido" | "vidrio-entorno" | "transmision-media" | "transmision-completa";
export type AvatarCalidad = "orbe-manos" | "cabeza-manos" | "vrm-ligero" | "vrm" | "vrm-completo";

export interface PerfilCalidad {
    nivel: NivelCalidad;
    escalaResolucion: number;
    /** Foveación fija 0–1 (1 = la más agresiva). */
    foveacion: number;
    msaa: 0 | 2 | 4;
    sombras: { activas: boolean; resolucion: number };
    particulas: number;
    /** Multiplica la distancia a la que cambia el LOD (más = más detalle lejos). */
    sesgoLod: number;
    /** Posproceso sólo vale en pantalla: en una sesión XR se evita (copia del búfer del visor). */
    posprocesoPantalla: "ninguno" | "bloom-ligero" | "bloom-completo";
    material: MaterialCristal;
    capas: { lejana: boolean; capasWebXR: boolean };
    lucesDinamicas: number;
    texturaMaxPx: number;
    jugadoresVisibles: number;
    avatar: AvatarCalidad;
    audio: "estereo" | "panner" | "hrtf";
    fisica: { pasosHz: number; cuerposMax: number };
    refrescoPreferidoHz: number;
    transiciones: "minimas" | "normales" | "ricas";
}

export const PERFILES: Record<NivelCalidad, PerfilCalidad> = {
    minima: {
        nivel: "minima", escalaResolucion: 0.7, foveacion: 1, msaa: 0, sombras: { activas: false, resolucion: 0 },
        particulas: 0, sesgoLod: 0.5, posprocesoPantalla: "ninguno", material: "plano",
        capas: { lejana: false, capasWebXR: false }, lucesDinamicas: 1, texturaMaxPx: 512, jugadoresVisibles: 4,
        avatar: "orbe-manos", audio: "estereo", fisica: { pasosHz: 30, cuerposMax: 20 }, refrescoPreferidoHz: 72, transiciones: "minimas",
    },
    baja: {
        nivel: "baja", escalaResolucion: 0.85, foveacion: 0.8, msaa: 0, sombras: { activas: false, resolucion: 0 },
        particulas: 150, sesgoLod: 0.75, posprocesoPantalla: "ninguno", material: "translucido",
        capas: { lejana: true, capasWebXR: false }, lucesDinamicas: 2, texturaMaxPx: 1024, jugadoresVisibles: 8,
        avatar: "cabeza-manos", audio: "panner", fisica: { pasosHz: 45, cuerposMax: 60 }, refrescoPreferidoHz: 72, transiciones: "normales",
    },
    media: {
        nivel: "media", escalaResolucion: 1, foveacion: 0.5, msaa: 2, sombras: { activas: true, resolucion: 1024 },
        particulas: 800, sesgoLod: 1, posprocesoPantalla: "bloom-ligero", material: "vidrio-entorno",
        capas: { lejana: true, capasWebXR: true }, lucesDinamicas: 3, texturaMaxPx: 2048, jugadoresVisibles: 12,
        avatar: "vrm-ligero", audio: "hrtf", fisica: { pasosHz: 60, cuerposMax: 150 }, refrescoPreferidoHz: 72, transiciones: "normales",
    },
    alta: {
        nivel: "alta", escalaResolucion: 1.15, foveacion: 0.3, msaa: 4, sombras: { activas: true, resolucion: 2048 },
        particulas: 3000, sesgoLod: 1.25, posprocesoPantalla: "bloom-completo", material: "transmision-media",
        capas: { lejana: true, capasWebXR: true }, lucesDinamicas: 5, texturaMaxPx: 2048, jugadoresVisibles: 24,
        avatar: "vrm", audio: "hrtf", fisica: { pasosHz: 60, cuerposMax: 300 }, refrescoPreferidoHz: 90, transiciones: "ricas",
    },
    maxima: {
        nivel: "maxima", escalaResolucion: 1.3, foveacion: 0, msaa: 4, sombras: { activas: true, resolucion: 4096 },
        particulas: 10000, sesgoLod: 1.5, posprocesoPantalla: "bloom-completo", material: "transmision-completa",
        capas: { lejana: true, capasWebXR: true }, lucesDinamicas: 8, texturaMaxPx: 4096, jugadoresVisibles: 48,
        avatar: "vrm-completo", audio: "hrtf", fisica: { pasosHz: 90, cuerposMax: 600 }, refrescoPreferidoHz: 120, transiciones: "ricas",
    },
};

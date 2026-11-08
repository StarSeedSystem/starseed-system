"use client";

/**
 * Pedir la pantalla a compartir y, si no llega, decir por qué (MIC1108A · 2026-11-08).
 * `pedirPantalla()` hay que llamarla SIN esperas antes, en el mismo gesto de la persona (el navegador
 * solo la da ahí): devuelve la pista de vídeo o null. `motivoSinPantalla()` explica el último null:
 * cancelado, sin permiso del sistema (macOS: Grabación de pantalla) o motor web sin getDisplayMedia
 * (Android WebView). Contrato: architecture/apps-autonomas-sin-internet.md §13.
 */
import type { AjustesMedios } from "@/lib/llamadas/permiso-medios";
import { explicarFalloMedios } from "@/lib/nativa/medios-nativos";

let ultimoError: unknown = null;

export function pedirPantalla(): Promise<MediaStreamTrack | null> {
    ultimoError = null;
    try {
        const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
        if (!md?.getDisplayMedia) {
            ultimoError = { name: "NoMediaDevices" };
            return Promise.resolve(null);
        }
        return md
            .getDisplayMedia({ video: true, audio: false })
            .then((s) => s.getVideoTracks()[0] ?? null)
            .catch((e: unknown) => {
                ultimoError = e ?? { name: "AbortError" };
                return null;
            });
    } catch (e) {
        ultimoError = e;
        return Promise.resolve(null);
    }
}

/** Por qué no llegó la pantalla del último `pedirPantalla()`. Nunca lanza. */
export async function motivoSinPantalla(): Promise<{ motivo: string; ajustes: AjustesMedios | null }> {
    if (!ultimoError) return { motivo: "No se eligió ninguna pantalla, ventana ni pestaña para compartir.", ajustes: null };
    const d = await explicarFalloMedios(ultimoError, { audio: false, video: true, pantalla: true });
    return { motivo: d.mensaje, ajustes: d.ajustes };
}

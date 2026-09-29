"use client";
/**
 * Pistas locales (paquete E): archivos de audio que la persona abre desde su dispositivo.
 * Se reproducen con el motor compartido por una URL de objeto (blob:) que NUNCA sale del
 * navegador; al cerrar la pestaña desaparecen (no se guardan: el archivo es suyo, no nuestro).
 */
import { useSyncExternalStore } from "react";
import type { MediaTrack } from "@/components/dashboard/apps/media/media-engine";

let pistas: MediaTrack[] = [];
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

export function anadirArchivosE(archivos: FileList | File[]): MediaTrack[] {
    const nuevas: MediaTrack[] = [];
    for (const f of Array.from(archivos)) {
        if (!f.type.startsWith("audio/") && !/\.(mp3|ogg|oga|wav|flac|m4a|aac|opus|webm)$/i.test(f.name)) continue;
        let url = "";
        try { url = URL.createObjectURL(f); } catch { continue; }
        nuevas.push({ id: `local-${Date.now().toString(36)}-${nuevas.length}-${f.size}`, title: f.name.replace(/\.[^.]+$/, ""), artist: "De tu dispositivo", url, kind: "music" });
    }
    if (nuevas.length) { pistas = [...pistas, ...nuevas].slice(-50); avisar(); }
    return nuevas;
}

export function quitarPistaLocalE(id: string) {
    const p = pistas.find((x) => x.id === id);
    if (p) { try { URL.revokeObjectURL(p.url); } catch { /* ya liberada */ } }
    pistas = pistas.filter((x) => x.id !== id);
    avisar();
}

const VACIAS: MediaTrack[] = [];
export function usePistasLocalesE(): MediaTrack[] {
    return useSyncExternalStore(
        (cb) => { oyentes.add(cb); return () => { oyentes.delete(cb); }; },
        () => pistas,
        () => VACIAS,
    );
}

"use client";

/*
 * ReproductorEstacion (Ola 1010E · ES1010H, integrado con ES1010L) —
 * decide el reproductor por `detectarFormato` (§9): nativo audio/vídeo,
 * marco aislado con los tokens del navegador del OS, enlace interno con
 * next/link, o botón «Abrir en una pestaña». HLS: nativo si el navegador
 * lo soporta; si no (falta integración perezosa de hls.js), pestaña.
 */

import Link from "next/link";
import { Cast, ExternalLink, Music } from "lucide-react";
import { FRAME_ALLOW, FRAME_SANDBOX } from "@/components/browser/web-frame";
import { conParent, detectarFormato } from "@/lib/estaciones/formato";
import type { Estacion } from "@/lib/estaciones/tipos";

function soportaHlsNativo(): boolean {
    if (typeof document === "undefined") return false;
    try {
        const v = document.createElement("video");
        return v.canPlayType("application/vnd.apple.mpegurl") !== "";
    } catch {
        return false;
    }
}

export function EnlacePestana({ href, grande }: { href: string; grande?: boolean }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 backdrop-blur text-sm hover:bg-black/50 ${grande ? "px-5 py-2.5" : "px-3 py-1.5"}`}
        >
            <ExternalLink className="h-4 w-4" /> Abrir en una pestaña
        </a>
    );
}

export function ReproductorEstacion({ estacion }: { estacion: Estacion }) {
    const d = detectarFormato(estacion.enlace, estacion.tipo);
    const claseCaja =
        "relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 backdrop-blur";
    if (d.reproductor === "interno") {
        return (
            <div className={`${claseCaja} flex aspect-video items-center justify-center`}>
                <Link
                    href={estacion.enlace}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-5 py-2.5 text-sm hover:bg-black/50"
                >
                    <Cast className="h-4 w-4 text-rose-300" /> Abrir dentro de StarSeed
                </Link>
            </div>
        );
    }
    if (d.reproductor === "nativo-audio" || (d.formato === "hls" && d.soloAudio)) {
        return (
            <div className={`${claseCaja} flex items-center gap-3 px-4 py-3`}>
                <Music className="h-5 w-5 text-rose-300" aria-hidden />
                {/* Autoplay en silencio (regla §1.4): nada suena solo. */}
                <audio controls playsInline muted src={estacion.enlace} className="w-full" />
            </div>
        );
    }
    if (d.reproductor === "nativo-video" || (d.formato === "hls" && soportaHlsNativo())) {
        return (
            <div className={`${claseCaja} aspect-video`}>
                <video controls playsInline muted src={estacion.enlace} className="h-full w-full" />
            </div>
        );
    }
    if (d.reproductor === "marco" && d.urlIncrustable) {
        const src = conParent(d.urlIncrustable, window.location.host);
        return (
            <div className={`${claseCaja} aspect-video`}>
                <iframe
                    src={src}
                    title={estacion.titulo}
                    sandbox={FRAME_SANDBOX}
                    allow={FRAME_ALLOW}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full"
                />
            </div>
        );
    }
    return (
        <div className={`${claseCaja} flex aspect-video flex-col items-center justify-center gap-2`}>
            <p className="text-xs text-muted-foreground">{d.motivo}</p>
            <EnlacePestana href={estacion.enlace} grande />
        </div>
    );
}

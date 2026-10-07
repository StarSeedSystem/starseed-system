"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Volume2 } from "lucide-react";
import { FRAME_ALLOW, FRAME_SANDBOX } from "@/components/browser/web-frame";
import { conParent, detectarFormato } from "@/lib/estaciones/formato";
import type { Estacion } from "@/lib/estaciones/tipos";

interface Props {
    estacion: Pick<Estacion, "enlace" | "tipo" | "titulo">;
    className?: string;
    compacto?: boolean;
}

/** Barras del ecualizador de la barra de audio; quietas con prefers-reduced-motion. */
function BarrasAudio() {
    return (
        <span aria-hidden className="flex h-4 items-end gap-0.5">
            {[6, 14, 10, 16, 8].map((alto, i) => (
                <span key={i} className="w-1 rounded bg-emerald-400 animate-pulse motion-reduce:animate-none"
                    style={{ height: alto, animationDelay: `${i * 120}ms` }} />
            ))}
        </span>
    );
}

/** Reproductor autoadaptable de una estación: nativo, HLS, marco aislado, interno o pestaña. */
export function ReproductorEstacion({ estacion, className, compacto }: Props) {
    const { enlace, tipo, titulo } = estacion;
    const f = useMemo(() => detectarFormato(enlace, tipo), [enlace, tipo]);
    const medio = useRef<HTMLMediaElement | null>(null);
    const [silencio, setSilencio] = useState(true);
    const [forzarPestana, setForzarPestana] = useState(false);

    useEffect(() => {
        if (f.reproductor !== "hls" || !medio.current) return;
        const v = medio.current as HTMLVideoElement;
        if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = enlace; return; }
        let hls: { destroy(): void } | null = null;
        let vivo = true;
        import("hls.js").then((m) => {
            if (!vivo) { return; }
            const Hls = m.default;
            if (Hls.isSupported()) {
                const instancia = new Hls();
                instancia.loadSource(enlace);
                instancia.attachMedia(v);
                hls = instancia;
            } else { setForzarPestana(true); }
        }).catch(() => { if (vivo) setForzarPestana(true); });
        return () => { vivo = false; hls?.destroy(); };
    }, [f.reproductor, enlace]);

    const activarSonido = () => {
        setSilencio(false);
        const m = medio.current;
        if (m) { m.muted = false; Promise.resolve(m.play()).catch(() => undefined); }
    };

    const urlMarco = f.reproductor === "marco" && f.urlIncrustable
        ? (f.formato === "twitch" && typeof window !== "undefined"
            ? conParent(f.urlIncrustable, window.location.hostname) : f.urlIncrustable)
        : null;

    let cuerpo: React.ReactNode;
    if (forzarPestana || f.reproductor === "pestana") {
        cuerpo = (
            <div data-testid="reproductor-pestana" className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-white/70">{f.motivo}</p>
                <a href={enlace} target="_blank" rel="noopener noreferrer"
                    className="cursor-pointer rounded-full bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-black min-h-[44px]">
                    Abrir en una pestaña
                </a>
            </div>
        );
    } else if (f.reproductor === "interno") {
        cuerpo = (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-white/70">{f.motivo}</p>
                <Link href={enlace} className="cursor-pointer rounded-full bg-emerald-500/90 px-5 py-2.5 text-sm font-semibold text-black min-h-[44px]">
                    Abrir en StarSeed
                </Link>
            </div>
        );
    } else if (f.reproductor === "marco" && urlMarco) {
        cuerpo = (
            <iframe src={urlMarco} title={titulo} className="aspect-video w-full"
                sandbox={FRAME_SANDBOX} allow={FRAME_ALLOW} allowFullScreen
                loading="lazy" referrerPolicy="no-referrer" />
        );
    } else if (f.reproductor === "nativo-audio" || compacto || f.soloAudio) {
        cuerpo = (
            <div data-testid="barra-audio" className="flex items-center gap-3 p-3">
                <BarrasAudio />
                <audio ref={(n) => { medio.current = n; }} src={enlace} controls muted autoPlay
                    className="min-w-0 flex-1" aria-label={titulo} />
            </div>
        );
    } else {
        cuerpo = (
            <video ref={(n) => { medio.current = n; }} src={f.reproductor === "hls" ? undefined : enlace}
                controls playsInline muted autoPlay className="aspect-video w-full" aria-label={titulo} />
        );
    }

    return (
        <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/60 ${className ?? ""}`}>
            {cuerpo}
            {silencio && (f.reproductor === "nativo-audio" || f.reproductor === "nativo-video" || f.reproductor === "hls") && !forzarPestana && (
                <button type="button" onClick={activarSonido} aria-label="Activar sonido"
                    className="cursor-pointer absolute bottom-3 right-3 flex min-h-[44px] items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-black">
                    <Volume2 className="h-4 w-4" aria-hidden /> Activar sonido
                </button>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-1.5">
                <span className="truncate text-xs text-white/60">{f.motivo}</span>
                <a href={enlace} target="_blank" rel="noopener noreferrer"
                    className="cursor-pointer text-xs text-emerald-300 underline underline-offset-2">
                    Abrir en una pestaña
                </a>
            </div>
        </div>
    );
}

'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Miniaturas REALES de archivos (Adenda 69 · H-4)
// ----------------------------------------------------------------
// Un archivo del escritorio ya no es una caja gris con un icono
// genérico: enseña LO QUE ES.
//
//   imagen / gif  → la propia imagen
//   vídeo         → PRIMER FOTOGRAMA real (<video preload=metadata>
//                   con #t=…) o su póster si lo trae
//   pdf           → primera página real (visor nativo del navegador,
//                   solo en tarjeta grande) · si no es viable, página
//                   rica con su sello
//   audio         → portada si existe; si no, ONDA sonora derivada del
//                   nombre (determinista: el mismo archivo, la misma onda)
//   código/texto/ → FRAGMENTO REAL del contenido, renderizado
//   markdown        (con degradado de desvanecido al pie)
//   3D/datos/…    → placa de cristal con su icono y su sello de tipo
//
// Reglas de la casa:
//   • NUNCA una caja gris: si la miniatura falla, se cae a una placa
//     con degradado del acento del tipo (fileVisual) — siempre bonita.
//   • Todo es best-effort y perezoso: un archivo que no se deja leer
//     (CORS, URL firmada caducada…) degrada en silencio.
//   • El texto se pide UNA vez por URL y se cachea en memoria: cien
//     iconos de código no hacen cien fetch.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DesktopIcon } from "./desktop-store";
import { fileVisual, thumbnailUrl } from "./desktop-file-icons";

// ── Caché de fragmentos de texto (una petición por URL, para siempre) ──
const SNIPPET_MAX = 1200;
const snippetCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

async function loadSnippet(url: string): Promise<string | null> {
    if (snippetCache.has(url)) return snippetCache.get(url) ?? null;
    const pending = inFlight.get(url);
    if (pending) return pending;
    const p = (async (): Promise<string | null> => {
        try {
            const res = await fetch(url, { headers: { Range: "bytes=0-4095" } });
            // 206 (parcial) y 200 (entero) valen; cualquier otra cosa, no.
            if (!res.ok && res.status !== 206) throw new Error(String(res.status));
            const text = (await res.text()).slice(0, SNIPPET_MAX);
            snippetCache.set(url, text);
            return text;
        } catch {
            snippetCache.set(url, null);
            return null;
        } finally {
            inFlight.delete(url);
        }
    })();
    inFlight.set(url, p);
    return p;
}

/** Fragmento real del archivo (o el texto embebido del icono, si lo tiene). */
function useSnippet(icon: DesktopIcon, enabled: boolean): string | null {
    const [text, setText] = useState<string | null>(() => icon.text?.slice(0, SNIPPET_MAX) ?? null);
    const url = icon.url;
    useEffect(() => {
        if (!enabled || icon.text || !url) return;
        let alive = true;
        loadSnippet(url).then((t) => { if (alive) setText(t); });
        return () => { alive = false; };
    }, [enabled, url, icon.text]);
    return icon.text?.slice(0, SNIPPET_MAX) ?? text;
}

/** Hash estable (mismo archivo ⇒ misma onda / mismas líneas fantasma). */
function hashOf(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}

function pseudoBars(seed: string, n: number): number[] {
    let h = hashOf(seed) || 1;
    return Array.from({ length: n }, () => {
        h = (h * 1103515245 + 12345) & 0x7fffffff;
        return 0.22 + ((h >> 8) % 78) / 100; // 0.22 .. 1.0
    });
}

/** Extensión legible del archivo (para el sello). */
export function extensionOf(icon: DesktopIcon): string {
    const src = icon.url ?? icon.name ?? "";
    const m = /\.([a-z0-9]{1,6})(?:[?#].*)?$/i.exec(src);
    if (m) return m[1].toUpperCase();
    return fileVisual(icon.fileKind, icon.url ?? icon.name).label.toUpperCase().slice(0, 5);
}

// ── Placa base: SIEMPRE con degradado del acento (nunca gris) ─────
function Plate({ accent, className, children }: {
    accent: string; className?: string; children?: React.ReactNode;
}): React.ReactElement {
    return (
        <div className={cn("relative h-full w-full overflow-hidden", className)}>
            <span
                aria-hidden
                className="absolute inset-0"
                style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 78%, #0B1020), color-mix(in srgb, ${accent} 22%, rgba(8,11,20,0.95)))`,
                }}
            />
            <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
            {children}
        </div>
    );
}

/** Sello de tipo (esquina inferior derecha). */
function TypeBadge({ label }: { label: string }): React.ReactElement {
    return (
        <span className="absolute bottom-1 right-1 rounded-md border border-white/25 bg-black/60 px-1 text-[8px] font-black leading-[13px] tracking-wide text-white/90 backdrop-blur-sm">
            {label}
        </span>
    );
}

// ── Vídeo: primer fotograma REAL ─────────────────────────────────
function VideoThumb({ icon, accent, showBadge }: {
    icon: DesktopIcon; accent: string; showBadge: boolean;
}): React.ReactElement {
    const [failed, setFailed] = useState(false);
    const ref = useRef<HTMLVideoElement | null>(null);
    const poster = icon.thumbUrl;

    // `#t=0.5` pide al navegador que muestre el fotograma del segundo 0,5
    // (el 0 suele ser negro). `preload=metadata` evita descargar el vídeo entero.
    const src = icon.url ? `${icon.url}${icon.url.includes("#") ? "" : "#t=0.5"}` : undefined;

    if (!src || failed) {
        return <IconPlate icon={icon} accent={accent} showBadge={showBadge} />;
    }
    return (
        <div className="relative h-full w-full overflow-hidden bg-black">
            <video
                ref={ref}
                src={src}
                poster={poster}
                muted
                playsInline
                preload="metadata"
                tabIndex={-1}
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
            />
            <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
            <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/35 bg-black/45 backdrop-blur-sm"
            >
                <span className="ml-0.5 border-y-[5px] border-l-[8px] border-y-transparent border-l-white" />
            </span>
            {showBadge && <TypeBadge label={extensionOf(icon)} />}
        </div>
    );
}

// ── Audio: portada real, o ONDA determinista del archivo ─────────
function AudioThumb({ icon, accent, showBadge, bars = 18 }: {
    icon: DesktopIcon; accent: string; showBadge: boolean; bars?: number;
}): React.ReactElement {
    const [coverFailed, setCoverFailed] = useState(false);
    const cover = icon.thumbUrl;
    const heights = pseudoBars(icon.url ?? icon.name, bars);

    if (cover && !coverFailed) {
        return (
            <div className="relative h-full w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cover} alt="" draggable={false} onError={() => setCoverFailed(true)} className="h-full w-full object-cover" />
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-1/3 items-end gap-[2px] bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1">
                    {heights.slice(0, 10).map((h, i) => (
                        <span key={i} className="w-full rounded-sm bg-white/80" style={{ height: `${h * 70}%` }} />
                    ))}
                </span>
                {showBadge && <TypeBadge label={extensionOf(icon)} />}
            </div>
        );
    }

    return (
        <Plate accent={accent}>
            <span aria-hidden className="absolute inset-0 flex items-center justify-center gap-[2px] px-2">
                {heights.map((h, i) => (
                    <span
                        key={i}
                        className="w-full max-w-[4px] rounded-full bg-white/85"
                        style={{ height: `${h * 62}%`, opacity: 0.55 + h * 0.45 }}
                    />
                ))}
            </span>
            {showBadge && <TypeBadge label={extensionOf(icon)} />}
        </Plate>
    );
}

// ── Texto / código / markdown: FRAGMENTO REAL renderizado ─────────
function TextThumb({ icon, accent, showBadge, rich }: {
    icon: DesktopIcon; accent: string; showBadge: boolean; rich: boolean;
}): React.ReactElement {
    const snippet = useSnippet(icon, true);
    const isCode = (icon.fileKind ?? "") === "code" || (icon.fileKind ?? "") === "html";

    // Sin fragmento (aún, o CORS): "página" con líneas fantasma — nunca una caja gris.
    if (!snippet) {
        const ghost = pseudoBars(icon.name, rich ? 9 : 5);
        return (
            <Plate accent={accent}>
                <span aria-hidden className="absolute inset-0 flex flex-col justify-center gap-[3px] px-2.5">
                    {ghost.map((w, i) => (
                        <span key={i} className="h-[2px] rounded-full bg-white/60" style={{ width: `${35 + w * 60}%` }} />
                    ))}
                </span>
                {showBadge && <TypeBadge label={extensionOf(icon)} />}
            </Plate>
        );
    }

    const lines = snippet.split("\n").slice(0, rich ? 14 : 7);
    return (
        <div className="relative h-full w-full overflow-hidden bg-[#0B1020]">
            <span
                aria-hidden
                className="absolute inset-0 opacity-25"
                style={{ background: `linear-gradient(135deg, ${accent}, transparent 70%)` }}
            />
            <pre
                className={cn(
                    "relative m-0 overflow-hidden whitespace-pre-wrap break-all p-1.5 leading-[1.35] text-white/85",
                    rich ? "text-[7px]" : "text-[4px]",
                    isCode ? "font-mono" : "font-sans",
                )}
            >
                {lines.join("\n")}
            </pre>
            <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0B1020] to-transparent" />
            {showBadge && <TypeBadge label={extensionOf(icon)} />}
        </div>
    );
}

// ── PDF: primera página real (solo tarjeta grande) ───────────────
function PdfThumb({ icon, accent, showBadge, rich }: {
    icon: DesktopIcon; accent: string; showBadge: boolean; rich: boolean;
}): React.ReactElement {
    const [failed, setFailed] = useState(false);
    // El visor nativo del navegador pinta la 1ª página de verdad. Solo lo
    // montamos en tarjeta grande: un <iframe> por icono pequeño sería un abuso.
    if (rich && icon.url && !failed) {
        return (
            <div className="relative h-full w-full overflow-hidden bg-white">
                <iframe
                    src={`${icon.url}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                    title={icon.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                    className="pointer-events-none absolute inset-0 h-full w-full border-0"
                />
                <span aria-hidden className="pointer-events-none absolute inset-0" />
                {showBadge && <TypeBadge label="PDF" />}
            </div>
        );
    }
    // Icono rico: hoja blanca con su sello (jamás una caja gris).
    return (
        <Plate accent={accent}>
            <span aria-hidden className="absolute inset-[18%] rounded-[3px] bg-white/92 shadow-md" />
            <span aria-hidden className="absolute inset-x-[26%] top-[30%] flex flex-col gap-[3px]">
                {[92, 78, 86, 60].map((w, i) => (
                    <span key={i} className="h-[2px] rounded-full bg-slate-400/70" style={{ width: `${w}%` }} />
                ))}
            </span>
            {showBadge && <TypeBadge label="PDF" />}
        </Plate>
    );
}

// ── Imagen ───────────────────────────────────────────────────────
function ImageThumb({ icon, accent, showBadge }: {
    icon: DesktopIcon; accent: string; showBadge: boolean;
}): React.ReactElement {
    const [failed, setFailed] = useState(false);
    const src = thumbnailUrl(icon) ?? icon.url;
    if (!src || failed) return <IconPlate icon={icon} accent={accent} showBadge={showBadge} />;
    return (
        <div className="relative h-full w-full overflow-hidden bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt=""
                draggable={false}
                loading="lazy"
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
            />
            {showBadge && <TypeBadge label={extensionOf(icon)} />}
        </div>
    );
}

// ── Respaldo universal: placa de cristal con el icono del tipo ────
function IconPlate({ icon, accent, showBadge }: {
    icon: DesktopIcon; accent: string; showBadge: boolean;
}): React.ReactElement {
    const { Icon } = fileVisual(icon.fileKind, icon.url ?? icon.name);
    return (
        <Plate accent={accent}>
            <span className="absolute inset-0 grid place-items-center">
                <Icon className="size-[44%] text-white drop-shadow" strokeWidth={1.7} />
            </span>
            {showBadge && <TypeBadge label={extensionOf(icon)} />}
        </Plate>
    );
}

// ── Componente público ───────────────────────────────────────────
export interface FileThumbProps {
    icon: DesktopIcon;
    /** `rich` = tarjeta grande (vista previa): fragmentos, PDF real, más detalle. */
    rich?: boolean;
    /** Sello con la extensión / tipo. */
    showBadge?: boolean;
    className?: string;
}

/** ¿Este archivo tiene una miniatura mejor que su icono Lucide? */
export function hasRichThumb(icon: DesktopIcon): boolean {
    if (icon.kind !== "file") return false;
    const g = fileVisual(icon.fileKind, icon.url ?? icon.name).group;
    if (g === "image") return Boolean(thumbnailUrl(icon) ?? icon.url);
    if (g === "video" || g === "audio" || g === "document" || g === "code" || g === "data") return true;
    return Boolean(icon.thumbUrl);
}

/**
 * Miniatura de un archivo del escritorio. Elige la mejor representación real
 * disponible para su tipo y SIEMPRE devuelve algo bonito (nunca una caja gris).
 */
export function FileThumb({ icon, rich = false, showBadge = true, className }: FileThumbProps): React.ReactElement {
    const visual = fileVisual(icon.fileKind, icon.url ?? icon.name);
    const accent = icon.accent ?? visual.accent;
    const body = (() => {
        switch (visual.group) {
            case "image": return <ImageThumb icon={icon} accent={accent} showBadge={showBadge} />;
            case "video": return <VideoThumb icon={icon} accent={accent} showBadge={showBadge} />;
            case "audio": return <AudioThumb icon={icon} accent={accent} showBadge={showBadge} bars={rich ? 28 : 14} />;
            case "code":
                return <TextThumb icon={icon} accent={accent} showBadge={showBadge} rich={rich} />;
            case "document": {
                const k = icon.fileKind ?? "";
                if (k === "pdf") return <PdfThumb icon={icon} accent={accent} showBadge={showBadge} rich={rich} />;
                if (k === "text" || k === "markdown" || k === "note" || k === "doc") {
                    return <TextThumb icon={icon} accent={accent} showBadge={showBadge} rich={rich} />;
                }
                return <IconPlate icon={icon} accent={accent} showBadge={showBadge} />;
            }
            case "data": return <TextThumb icon={icon} accent={accent} showBadge={showBadge} rich={rich} />;
            default: return <IconPlate icon={icon} accent={accent} showBadge={showBadge} />;
        }
    })();

    return <div className={cn("relative h-full w-full overflow-hidden", className)}>{body}</div>;
}

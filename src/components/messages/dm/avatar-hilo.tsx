"use client";

/** Avatar de un chat (persona o grupo) con el punto de «en línea» y su halo. */
import { useState } from "react";
import { Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { urlVigenteAdjunto } from "@/lib/mensajeria/adjuntos";

function iniciales(nombre: string): string {
    const partes = nombre.replace(/^@/, "").trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return "·";
    return (partes.length === 1 ? partes[0].slice(0, 2) : `${partes[0][0]}${partes[1][0]}`).toUpperCase();
}

/** Tono estable a partir del nombre (para que cada persona tenga «su» color). */
function tonoDe(nombre: string): number {
    let h = 0;
    for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
}

export function AvatarHilo({
    nombre, url, esGrupo = false, enLinea = false, tam = 40, className,
}: { nombre: string; url?: string | null; esGrupo?: boolean; enLinea?: boolean; tam?: number; className?: string }) {
    const src = urlVigenteAdjunto(url ?? undefined);
    const [fallo, setFallo] = useState(false);
    const tono = tonoDe(nombre || "?");
    const punto = Math.max(9, Math.round(tam * 0.26));
    return (
        <span className={cn("relative inline-block shrink-0", className)} style={{ width: tam, height: tam }}>
            <span
                className="grid h-full w-full place-items-center overflow-hidden rounded-full font-semibold text-white"
                style={{
                    background: `linear-gradient(135deg, hsl(${tono} 70% 58%), hsl(${(tono + 40) % 360} 65% 38%))`,
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14), 0 4px 14px rgba(0,0,0,.25)",
                    fontSize: Math.max(10, Math.round(tam * 0.36)),
                }}
            >
                {src && !fallo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFallo(true)} />
                ) : esGrupo ? (
                    <Users2 style={{ width: tam * 0.46, height: tam * 0.46 }} aria-hidden />
                ) : (
                    <span aria-hidden>{iniciales(nombre)}</span>
                )}
            </span>
            {enLinea && (
                <span
                    aria-label="En línea"
                    className="absolute bottom-0 right-0 rounded-full"
                    style={{
                        width: punto,
                        height: punto,
                        background: "#10B981",
                        boxShadow: "0 0 0 2px rgba(10,12,28,.95), 0 0 10px rgba(16,185,129,.75)",
                    }}
                />
            )}
        </span>
    );
}

export default AvatarHilo;

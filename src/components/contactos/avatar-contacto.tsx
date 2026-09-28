"use client";

/**
 * AvatarContacto (contrato C8) — foto o iniciales sobre un degradado propio del nombre,
 * anillo del color de la relación y punto verde de «en línea» con un halo suave.
 * Lo usan la app de Contactos, el perfil («Añadir a contactos») y los chats.
 */

import { useEffect, useState } from "react";

import { iniciales } from "@/lib/contactos/modelo";
import { RELACIONES, type TipoRelacion } from "@/lib/contactos/tipos";

export interface AvatarContactoProps {
    nombre: string;
    avatarUrl?: string | null;
    /** Diámetro en px (por defecto 40). */
    tam?: number;
    enLinea?: boolean;
    relacion?: TipoRelacion;
}

/** Hash estable (FNV-1a) de un texto. */
function hashTexto(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** Degradado determinista a partir del nombre (misma persona, mismo color en todo el OS). */
export function degradadoDeNombre(nombre: string): string {
    const h = hashTexto((nombre || "?").trim().toLowerCase());
    const tono = h % 360;
    const tono2 = (tono + 38 + ((h >> 9) % 40)) % 360;
    return `linear-gradient(135deg, hsl(${tono} 72% 52%) 0%, hsl(${tono2} 70% 34%) 100%)`;
}

const FONDO_HUECO = "rgba(8,10,26,0.95)";

export function AvatarContacto({ nombre, avatarUrl, tam = 40, enLinea, relacion }: AvatarContactoProps) {
    const [fallo, setFallo] = useState(false);
    useEffect(() => setFallo(false), [avatarUrl]);

    const color = relacion ? RELACIONES.find((r) => r.id === relacion)?.color : undefined;
    const anillo = color ? Math.max(2, Math.round(tam / 24)) : 0;
    const hueco = color ? Math.max(1.5, Math.round(tam / 36)) : 0;
    const punto = Math.max(8, Math.round(tam * 0.26));
    const conFoto = Boolean(avatarUrl) && !fallo;
    const etiqueta = enLinea ? `${nombre} · en línea` : nombre;

    return (
        <span
            role="img"
            aria-label={etiqueta}
            title={etiqueta}
            data-testid="avatar-contacto"
            className="relative inline-flex shrink-0 select-none rounded-full"
            style={{
                width: tam,
                height: tam,
                padding: anillo,
                background: color ? `conic-gradient(from 200deg, ${color}, ${color}99, ${color})` : undefined,
                boxShadow: color ? `0 0 ${Math.round(tam / 3)}px -${Math.round(tam / 8)}px ${color}` : undefined,
            }}
        >
            <span
                aria-hidden
                className="flex h-full w-full rounded-full"
                style={{ padding: hueco, background: color ? FONDO_HUECO : undefined }}
            >
                <span
                    className="flex h-full w-full items-center justify-center overflow-hidden rounded-full font-semibold text-white"
                    style={{
                        background: conFoto ? "rgba(255,255,255,0.06)" : degradadoDeNombre(nombre),
                        fontSize: Math.max(10, Math.round(tam * 0.36)),
                        letterSpacing: "0.02em",
                        textShadow: "0 1px 2px rgba(0,0,0,0.35)",
                    }}
                >
                    {conFoto ? (
                        // eslint-disable-next-line @next/next/no-img-element -- avatares de cualquier origen (Supabase, perfiles externos)
                        <img
                            src={avatarUrl as string}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="h-full w-full object-cover"
                            onError={() => setFallo(true)}
                        />
                    ) : (
                        iniciales(nombre)
                    )}
                </span>
            </span>
            {enLinea ? (
                <span
                    aria-hidden
                    data-testid="avatar-en-linea"
                    className="absolute rounded-full"
                    style={{
                        width: punto,
                        height: punto,
                        right: Math.max(0, anillo - 1),
                        bottom: Math.max(0, anillo - 1),
                        background: "#10B981",
                        boxShadow: `0 0 0 2px ${FONDO_HUECO}, 0 0 10px 1px rgba(16,185,129,0.7)`,
                    }}
                />
            ) : null}
        </span>
    );
}

export default AvatarContacto;

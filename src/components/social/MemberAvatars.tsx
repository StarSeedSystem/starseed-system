// src/components/social/MemberAvatars.tsx
"use client";

import React from "react";
import Link from "next/link";
import {
    sampleProfiles,
    type SystemKey,
} from "@/data/sample-entities";
import { profileHref } from "@/lib/entity-links";

function onImgError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
    e.currentTarget.style.display = "none";
}

/**
 * Lista de miembros con avatares enlazados a sus perfiles reales. Usa perfiles
 * reales del sistema y completa con avatares deterministas DiceBear si faltan.
 */
export function MemberAvatars({
    system,
    total,
    accent,
    seed,
}: {
    system: SystemKey;
    total: number;
    accent: string;
    seed: string;
}) {
    // Solo miembros REALES (sin rellenar con miembros ficticios).
    const real = sampleProfiles.filter((p) => p.system === system);
    const members = real
        .map((p) => ({
            id: p.id,
            name: p.name,
            handle: p.handle,
            avatar: p.avatar,
            accent: p.accent,
        }))
        .slice(0, 9);

    if (members.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-white/12 p-6 text-center text-sm text-muted-foreground">
                {total > 0
                    ? `${total.toLocaleString("es-ES")} miembros. Inicia sesión para ver el directorio.`
                    : "Aún no hay miembros. Sé el primero en unirte."}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => {
                const inner = (
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/30 p-3 transition-colors hover:bg-white/5 min-w-0">
                        <span
                            className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2"
                            style={{ ["--tw-ring-color" as any]: `${m.accent}55` }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={m.avatar}
                                alt={m.name}
                                loading="lazy"
                                onError={onImgError}
                                className="h-full w-full object-cover"
                            />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{m.name}</p>
                            {m.handle && (
                                <p className="truncate text-xs text-muted-foreground">{m.handle}</p>
                            )}
                        </div>
                    </div>
                );
                return m.handle ? (
                    <Link key={m.id} href={profileHref({ handle: m.handle })} className="cursor-pointer">
                        {inner}
                    </Link>
                ) : (
                    <div key={m.id}>{inner}</div>
                );
            })}
            {total > members.length && (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-white/10 p-3 text-sm text-muted-foreground">
                    +{(total - members.length).toLocaleString("es-ES")} miembros más
                </div>
            )}
        </div>
    );
}

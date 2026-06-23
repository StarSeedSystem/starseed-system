"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import * as Icons from "lucide-react";
import { Award } from "lucide-react";
import { useRealtime } from "@/lib/realtime/realtime";
import {
    badgesForProfile,
    myProfileId,
    type ProfileBadge,
} from "@/lib/badges/badges";

// Mapa de área → etiqueta legible (para el chip "área").
const AREA_LABELS: Record<string, string> = {
    general: "General",
    politica: "Política",
    educacion: "Educación",
    cultura: "Cultura",
};

// Resuelve el icono de la insignia: si `icon` coincide con un icono de lucide
// se usa ese; si no, fallback a Award. SSR-safe (solo lectura del map).
function BadgeIcon({ icon }: { icon: string | null }) {
    if (icon) {
        const key = icon.charAt(0).toUpperCase() + icon.slice(1);
        const Cmp = (Icons as any)[key] ?? (Icons as any)[icon];
        if (Cmp) return <Cmp className="w-5 h-5" />;
    }
    return <Award className="w-5 h-5" />;
}

export function FeaturedBadgesWidget({ pageType = "personal" }: { pageType: string }) {
    const [profileId, setProfileId] = useState<string | null>(null);
    const [badges, setBadges] = useState<ProfileBadge[]>([]);
    const [loading, setLoading] = useState(true);

    // Carga las insignias reales del perfil activo (el del usuario).
    const reload = useCallback(async () => {
        try {
            const pid = await myProfileId();
            setProfileId(pid);
            const list = await badgesForProfile(pid);
            setBadges(Array.isArray(list) ? list : []);
        } catch {
            /* tolerante a fallos: conservamos lo que hubiera */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    // Tiempo real: cualquier cambio en profile_badges de este perfil recarga.
    useRealtime(
        "profile_badges",
        { filter: profileId ? `profile_id=eq.${profileId}` : undefined },
        () => {
            void reload();
        },
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Insignias Destacadas</CardTitle>
                <CardDescription>
                    {pageType === "personal"
                        ? "Logros y roles reconocidos en la red."
                        : "Reconocimientos de esta página."}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
                {loading ? (
                    <p className="text-sm text-muted-foreground">Cargando insignias…</p>
                ) : badges.length > 0 ? (
                    badges.map((badge) => (
                        <Badge
                            key={badge.id}
                            variant="secondary"
                            className="flex items-center gap-2 p-2 text-sm"
                            title={badge.description ?? badge.name}
                        >
                            <BadgeIcon icon={badge.icon} />
                            <span>{badge.name}</span>
                            {badge.area ? (
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {AREA_LABELS[badge.area] ?? badge.area}
                                </span>
                            ) : null}
                        </Badge>
                    ))
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Aún sin insignias — gánalas participando
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

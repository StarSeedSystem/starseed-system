// src/app/(app)/partido/[slug]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { GovernanceEntityPage } from "@/components/social/governance-entity-page";
import { GlassCard } from "@/components/ui/glass-card";
import { Flag } from "lucide-react";
import { getPartido } from "@/data/sample-governance";

const GOLD = "#E9C46A";

export default function PartidoPage() {
    const params = useParams();
    const slug = String(Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? ""));
    const partido = getPartido(slug);

    if (!partido) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <GlassCard className="flex flex-col items-center gap-4 p-[clamp(1.5rem,5vw,3rem)] text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                        <Flag className="h-8 w-8 text-muted-foreground" />
                    </span>
                    <div>
                        <h1 className="font-headline text-2xl font-bold">Aún no existe este partido</h1>
                        <p className="mt-2 max-w-md text-sm text-muted-foreground">
                            Todavía no hay ningún partido político con esta dirección en la red.
                            Crea el primero o explora la gobernanza activa.
                        </p>
                    </div>
                    <Link
                        href="/network/politics"
                        className="cursor-pointer text-sm hover:underline"
                        style={{ color: GOLD }}
                    >
                        ← Volver a Gobernanza
                    </Link>
                </GlassCard>
            </div>
        );
    }

    return (
        <GovernanceEntityPage
            kind="partido"
            slug={slug}
            name={partido.name}
            subtitle={partido.ideology}
            accent={partido.accent}
            followLabel="Afiliarme"
            followedLabel="Militante"
            backHref="/network/politics"
            backLabel="← Volver a Gobernanza"
            stats={[
                { label: "Militantes", value: partido.members.toLocaleString("es-ES") },
                { label: "Votos históricos", value: partido.votesHistory.toLocaleString("es-ES") },
                { label: "Fundado", value: partido.founded },
                { label: "Replicación", value: partido.replicationActive ? "Activa" : "Inactiva" },
            ]}
        />
    );
}

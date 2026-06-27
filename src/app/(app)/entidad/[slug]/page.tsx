// src/app/(app)/entidad/[slug]/page.tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { GovernanceEntityPage } from "@/components/social/governance-entity-page";
import { GlassCard } from "@/components/ui/glass-card";
import { Landmark } from "lucide-react";
import { getFederativeEntity } from "@/data/sample-governance";

const GOLD = "#E9C46A";

export default function EntidadFederativaPage() {
    const params = useParams();
    const slug = String(Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? ""));
    const ef = getFederativeEntity(slug);

    if (!ef) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <GlassCard className="flex flex-col items-center gap-4 p-[clamp(1.5rem,5vw,3rem)] text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                        <Landmark className="h-8 w-8 text-muted-foreground" />
                    </span>
                    <div>
                        <h1 className="font-headline text-2xl font-bold">Aún no existe esta Entidad Federativa</h1>
                        <p className="mt-2 max-w-md text-sm text-muted-foreground">
                            Todavía no hay ninguna Entidad Federativa con esta dirección en la red.
                            Crea la primera o explora la gobernanza activa.
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
            kind="ef"
            slug={slug}
            name={ef.name}
            subtitle={ef.blurb}
            accent={ef.accent}
            followLabel="Unirme a la E.F."
            followedLabel="Ciudadano/a"
            backHref="/network/politics"
            backLabel="← Volver a Gobernanza"
            stats={[
                { label: "Ciudadanía", value: ef.citizens.toLocaleString("es-ES") },
                { label: "Leyes activas", value: ef.chamber.activeLaws.toLocaleString("es-ES") },
                { label: "En debate", value: ef.chamber.inDebate.toLocaleString("es-ES") },
                { label: "Participación", value: `${ef.chamber.participation}%` },
            ]}
        />
    );
}

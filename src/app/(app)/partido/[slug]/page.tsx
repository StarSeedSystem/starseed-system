// src/app/(app)/partido/[slug]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { GovernanceEntityPage } from "@/components/social/governance-entity-page";
import { getPartido } from "@/data/sample-governance";

export default function PartidoPage() {
    const params = useParams();
    const slug = String(Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? ""));
    const partido = getPartido(slug);

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

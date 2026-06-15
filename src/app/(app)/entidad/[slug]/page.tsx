// src/app/(app)/entidad/[slug]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { GovernanceEntityPage } from "@/components/social/governance-entity-page";
import { getFederativeEntity } from "@/data/sample-governance";

export default function EntidadFederativaPage() {
    const params = useParams();
    const slug = String(Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? ""));
    const ef = getFederativeEntity(slug);

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

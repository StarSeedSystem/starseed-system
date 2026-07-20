"use client";

/**
 * ── HubSocialHome — Corazón social del Hub (Adenda 77 · PACK 1) ───────────────
 *
 * Orquesta, con una jerarquía visual limpia y sin saturar, todo el tejido social
 * centrado en el GRAFO de conexiones:
 *   · Presencia en vivo como fila superior.
 *   · Sub-pestañas: Red · Diversidad · Insignias · Delegaciones.
 *   · Sinapsis sugeridas como carrusel dentro de «Red».
 *   · Historias de conexión como popover en cada tarjeta (dentro de ConnectionsHub).
 *
 * Un solo `useHubGraph()` alimenta a todos los paneles (una sola carga real).
 */

import React, { useMemo, useState } from "react";
import { Compass, PieChart, Award, Vote } from "lucide-react";
import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";
import { useHubGraph } from "@/lib/hub-social/graph";
import { suggestSynapses } from "@/lib/hub-social/synapses";
import { PresenceRow } from "@/components/hub/presence-row";
import { SynapsesCarousel } from "@/components/hub/synapses-carousel";
import { DiversityPanel } from "@/components/hub/diversity-panel";
import { BadgesPanel } from "@/components/hub/badges-panel";
import { DelegationsPanel } from "@/components/hub/delegations-panel";
import { ConnectionsHub } from "@/components/hub/connections-hub";

type SocialTab = "red" | "diversidad" | "insignias" | "delegaciones";

export function HubSocialHome() {
    const graph = useHubGraph();
    const [tab, setTab] = useState<SocialTab>("red");

    const synapses = useMemo(
        () => suggestSynapses(graph.catalog, graph.mine, graph.metrics, 10),
        [graph.catalog, graph.mine, graph.metrics],
    );

    const items: SectionTabItem[] = [
        { value: "red", label: "Red", icon: Compass },
        { value: "diversidad", label: "Diversidad", icon: PieChart },
        { value: "insignias", label: "Insignias", icon: Award },
        { value: "delegaciones", label: "Delegaciones", icon: Vote },
    ];

    return (
        <div className="space-y-5">
            {/* Presencia en vivo — fila superior */}
            <PresenceRow profile={graph.profile} myGroupSlugs={graph.myGroupSlugs} needsAuth={graph.needsAuth} />

            {/* Sub-pestañas */}
            <SectionTabs
                items={items}
                value={tab}
                onValueChange={(v) => setTab(v as SocialTab)}
                ariaLabel="Secciones sociales del Hub"
            />

            {tab === "red" && (
                <div className="space-y-5 animate-in fade-in-50 duration-300">
                    {!graph.needsAuth && <SynapsesCarousel synapses={synapses} onChanged={graph.refresh} />}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.015] p-4 shadow-inner sm:p-5">
                        <ConnectionsHub graphMine={graph.mine} />
                    </div>
                </div>
            )}

            {tab === "diversidad" && (
                <div className="animate-in fade-in-50 duration-300">
                    <DiversityPanel mine={graph.mine} metrics={graph.metrics} profile={graph.profile} />
                </div>
            )}

            {tab === "insignias" && (
                <div className="animate-in fade-in-50 duration-300">
                    <BadgesPanel metrics={graph.metrics} ready={!graph.loading && !graph.needsAuth} />
                </div>
            )}

            {tab === "delegaciones" && (
                <div className="animate-in fade-in-50 duration-300">
                    <DelegationsPanel graph={graph} />
                </div>
            )}
        </div>
    );
}

export default HubSocialHome;

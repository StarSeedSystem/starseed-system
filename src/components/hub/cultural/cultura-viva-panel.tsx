"use client";

/*
 * CulturaVivaPanel — Orquestador de la sección «Cultura viva» del Hub
 * (Adenda 77 · PACK 2 cultural). Sub-secciones: Idiomas, Festivos, Puente
 * cultural, Hermanamientos y Salas de voz. El mapa-mundi de conexiones vive en
 * /hub/mapa (capa «Conexiones»), enlazado desde aquí.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, CalendarPlus, Compass, Handshake, Radio, Globe2, ArrowUpRight } from "lucide-react";
import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";
import { LanguageExchange } from "./language-exchange";
import { FestivalCalendar } from "./festival-calendar";
import { CulturalBridge } from "./cultural-bridge";
import { TwinningPanel } from "./twinning-panel";
import { AudioRoomsPanel } from "./audio-rooms-panel";

const SUB_TABS: SectionTabItem[] = [
    { value: "idiomas", label: "Idiomas", icon: ArrowLeftRight },
    { value: "festivos", label: "Festivos", icon: CalendarPlus },
    { value: "puente", label: "Puente cultural", icon: Compass },
    { value: "hermanamientos", label: "Hermanamientos", icon: Handshake },
    { value: "salas", label: "Salas de voz", icon: Radio },
];

export function CulturaVivaPanel() {
    const [sub, setSub] = useState("idiomas");

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-gradient-to-br from-primary/[0.06] via-transparent to-secondary/[0.06] p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground/90">
                        <Globe2 className="size-5 text-primary" /> Cultura viva
                    </h2>
                    <p className="max-w-2xl text-sm text-muted-foreground text-balance">
                        El tejido intercultural de la confederación: idiomas, festividades del mundo, puentes entre sistemas,
                        hermanamientos de comunidades y voz en directo por biorregión.
                    </p>
                </div>
                <Link
                    href="/hub/mapa"
                    className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/20"
                >
                    <Globe2 className="size-4" /> Mapa de conexiones <ArrowUpRight className="size-3.5" />
                </Link>
            </div>

            <div className="mx-auto w-full max-w-full lg:max-w-5xl">
                <SectionTabs items={SUB_TABS} value={sub} onValueChange={setSub} ariaLabel="Secciones de Cultura viva" />
            </div>

            <div className="animate-in fade-in-50 duration-300">
                {sub === "idiomas" && <LanguageExchange />}
                {sub === "festivos" && <FestivalCalendar />}
                {sub === "puente" && <CulturalBridge />}
                {sub === "hermanamientos" && <TwinningPanel />}
                {sub === "salas" && <AudioRoomsPanel />}
            </div>
        </div>
    );
}

export default CulturaVivaPanel;

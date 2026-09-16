"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Network, Scale, School, Palette } from "lucide-react";

import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";
import { cn } from "@/lib/utils";

export const PANORAMA_SUB_KEY = "starseed:hub:panorama-sub";

type SubId = "panorama" | "politica" | "educacion" | "cultura";

const PanelPanorama = dynamic(
    () => import("@/components/network/paneles").then((m) => m.PanelPanorama),
    { ssr: false, loading: () => <EsqueletoPanel /> },
);
const PanelPolitica = dynamic(
    () => import("@/components/network/paneles").then((m) => m.PanelPolitica),
    { ssr: false, loading: () => <EsqueletoPanel /> },
);
const PanelEducacion = dynamic(
    () => import("@/components/network/paneles").then((m) => m.PanelEducacion),
    { ssr: false, loading: () => <EsqueletoPanel /> },
);
const PanelCultura = dynamic(
    () => import("@/components/network/paneles").then((m) => m.PanelCultura),
    { ssr: false, loading: () => <EsqueletoPanel /> },
);

const SUBS: { id: SubId; label: string; icon: SectionTabItem["icon"] }[] = [
    { id: "panorama", label: "Panorama", icon: Network },
    { id: "politica", label: "Política", icon: Scale },
    { id: "educacion", label: "Educación", icon: School },
    { id: "cultura", label: "Cultura", icon: Palette },
];

function esSubValida(valor: string | null | undefined): valor is SubId {
    return SUBS.some((s) => s.id === valor);
}

function leerSubGuardada(): SubId {
    try {
        const guardada = window.localStorage.getItem(PANORAMA_SUB_KEY);
        return esSubValida(guardada) ? guardada : "panorama";
    } catch {
        return "panorama";
    }
}

function EsqueletoPanel() {
    return (
        <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-6" aria-hidden="true">
            <div className="h-5 w-1/3 rounded bg-white/10" />
            <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded bg-white/5" />
                <div className="h-3 w-5/6 rounded bg-white/5" />
                <div className="h-3 w-2/3 rounded bg-white/5" />
            </div>
        </div>
    );
}

export function PanoramaSociocultural({ subPorDefecto }: { subPorDefecto?: string }) {
    // Hidrata primero con el valor del servidor/prop y recuérdalo tras montar:
    // al montar se lee localStorage, que solo existe en el cliente.
    const [activa, setActiva] = useState<SubId>(
        esSubValida(subPorDefecto) ? subPorDefecto : "panorama",
    );

    useEffect(() => {
        setActiva((prev) => {
            const guardada = leerSubGuardada();
            // Si la prop pidió una sub-pestaña concreta distinta de la guardada,
            // gana la prop: es una intención explícita del que monta el panel.
            if (esSubValida(subPorDefecto) && subPorDefecto !== prev) return subPorDefecto;
            return guardada;
        });
        // Solo al montar: recordar entre visitas, no perseguir cambios de prop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cambiar = useCallback((valor: string) => {
        if (!esSubValida(valor)) return;
        setActiva(valor);
        try {
            window.localStorage.setItem(PANORAMA_SUB_KEY, valor);
        } catch {
            // Ventana privada o almacenamiento bloqueado: se pierde el recuerdo,
            // pero la pestaña debe seguir funcionando igual.
        }
    }, []);

    const items: SectionTabItem[] = SUBS.map((s) => ({
        value: s.id,
        label: s.label,
        icon: s.icon,
    }));

    const panelActivo = SUBS.find((s) => s.id === activa) ?? SUBS[0];
    // Solo se monta el panel activo: Cultura trae Leaflet y Educación un grafo
    // 3D; montar los cuatro a la vez arrastraría la Mac.
    const Panel = {
        panorama: PanelPanorama,
        politica: PanelPolitica,
        educacion: PanelEducacion,
        cultura: PanelCultura,
    }[panelActivo.id];

    return (
        <div className="space-y-4">
            <SectionTabs
                items={items}
                value={activa}
                onValueChange={cambiar}
                ariaLabel="Secciones del Panorama Sociocultural"
            />
            <div
                role="tabpanel"
                aria-label={panelActivo.label}
                className={cn("focus:outline-none")}
            >
                <Panel />
            </div>
        </div>
    );
}

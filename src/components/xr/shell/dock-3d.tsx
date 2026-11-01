"use client";

import { useEffect, useState } from "react";
import { Container, Text } from "@react-three/uikit";
import { PanelCristal } from "./panel-cristal";
import { loadDockConfig, DOCK_ICON_MAP, DOCK_FALLBACK_ICON, type DockItemConfig } from "@/components/layout/dock-config";
import { itemsDelDock, resolverApp } from "./apps-3d";
import { posicionesDock } from "@/lib/xr/espacio-trinity";
import { usePrefsXR } from "./use-prefs-xr";

export interface Dock3DProps {
    abrir?: (idOrRuta: string) => void;
}

export function Dock3D({ abrir }: Dock3DProps) {
    const { confort, modo } = usePrefsXR();
    const [config, setConfig] = useState<DockItemConfig[]>([]);
    const [tarjetaSolo2D, setTarjetaSolo2D] = useState<{ motivo: string; ruta: string } | null>(null);

    useEffect(() => {
        const actualizar = () => {
            setConfig(loadDockConfig());
        };
        actualizar();
        const handleStorage = (e: StorageEvent) => {
            if (e.key === "starseed.dock.items.v2") {
                actualizar();
            }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, []);

    const itemsVisibles = itemsDelDock(config, confort.postura);
    const posiciones = posicionesDock(itemsVisibles.length, {
        alturaOjos: confort.alturaOjos ?? 1.6,
        postura: confort.postura,
        manoDominante: confort.manoDominante,
        modo: modo ?? "vr-inmersivo",
    });

    const handlePulsar = (item: DockItemConfig) => {
        const res = resolverApp(item);
        if (res.tipo === "nativa-3d") {
            abrir?.(res.id || item.path);
        } else {
            setTarjetaSolo2D({ motivo: res.motivo || "Esta app todavía no tiene vista 3D", ruta: res.ruta || item.path });
        }
    };

    return (
        <Container flexDirection="row" alignItems="center">
            {itemsVisibles.map((item, idx) => {
                const pos = posiciones[idx] || { posicion: [0, 0, 0] as [number, number, number], yaw: 0 };
                const IconComponent = DOCK_ICON_MAP[item.iconKey] || DOCK_FALLBACK_ICON;
                return (
                    <PanelCristal key={item.id} nodo="anchor" ancho={0.08} alto={0.09} curvatura={0.58}>
                        <Container
                            flexDirection="column"
                            alignItems="center"
                            justifyContent="center"
                            onClick={() => handlePulsar(item)}
                        >
                            <Text fontSize={0.024} color="#F5F7FF">{item.label.slice(0, 10)}</Text>
                        </Container>
                    </PanelCristal>
                );
            })}
            {tarjetaSolo2D && (
                <PanelCristal nodo="anchor" ancho={0.4} alto={0.25} curvatura={0.58}>
                    <Container flexDirection="column" padding={20} justifyContent="space-between">
                        <Text fontSize={0.03} color="#F5F7FF">{tarjetaSolo2D.motivo}</Text>
                        <Container
                            onClick={() => {
                                window.location.href = tarjetaSolo2D.ruta;
                            }}
                        >
                            <Text fontSize={0.025} color="#39FF14">Salir y abrir en 2D</Text>
                        </Container>
                    </Container>
                </PanelCristal>
            )}
        </Container>
    );
}

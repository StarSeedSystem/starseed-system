"use client";

/**
 * StarSeed XR · DOCK CURVO 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a/b). LAS MISMAS
 * apps del dock 2D: `loadDockConfig()` + evento `storage` de `starseed.dock.items.v2` (oyente
 * limpiado al desmontar). Lógica en `apps-3d.ts`; icono = inicial en círculo (`Svg` de uikit
 * es más caro) y acento del token del color (DockColor→nodo): ninguno a mano.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Container, Text } from "@react-three/uikit";
import { OBJETIVO_MIN_TACTO_M, disponerTrinity, posicionesDock, type EntradaEspacio } from "@/lib/xr/espacio-trinity";
import { CRISTAL, type NodoCardinal } from "@/lib/xr/tokens-3d";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { DOCK_STORAGE_KEY } from "@/lib/dock/dock-defaults";
import { loadDockConfig, type DockColor, type DockItemConfig } from "@/components/layout/dock-config";
import { Animado } from "./animado";
import { colorAcento, colorConAlfa, pixeles } from "./material-cristal";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { ETIQUETA_MAS, itemsDelDock, resolverApp } from "./apps-3d";

const NODO_DE_COLOR: Record<DockColor, NodoCardinal> = {
    neutral: "zenith", cyan: "zenith", emerald: "horizon", amber: "logic", crimson: "anchor", purple: "horizon",
};
const LADO_BOTON = Math.max(0.07, OBJETIVO_MIN_TACTO_M * 2); // ≥ OBJETIVO_MIN_TACTO_M (3 cm), con margen para el dedo
const ALTO_BOTON = 0.09;
const ETIQUETA_SALIDA_2D = "Salir y abrir en 2D";

export interface PropsDock3D {
    espacio: EntradaEspacio;
    nivel?: NivelCalidad;
    abrir: (id: string) => void; // abre el panel nativo en Horizon o Logic
    salirYAbrir2D: (ruta: string) => void; // termina la sesión y navega a la ruta 2D de una app sin vista 3D
}

/** Panel de cristal flotante sobre el dock: lo comparten el «Más» y la tarjeta «solo-2d». */
function Flotante({ posicion, radio, nivel, ancho, alto, children }: {
    posicion: [number, number, number]; radio: number | undefined; nivel?: NivelCalidad; ancho: number; alto: number; children?: ReactNode;
}) {
    return <group position={posicion}>
        <Animado evento="despliegue" nivel={nivel}>
            <PanelCristal nodo="anchor" ancho={ancho} alto={alto} curvatura={radio}>
                {children}
            </PanelCristal>
        </Animado>
    </group>;
}

function Boton({ etiqueta, onClick }: { etiqueta: string; onClick: () => void }) {
    return <Container cursor="pointer" onClick={onClick} backgroundColor={CRISTAL.fondoB.color}>
        <Texto3D distancia={0.65} fontSize={pixeles(0.008)}>{etiqueta}</Texto3D>
    </Container>;
}

/* Motivo honesto de una app sin vista 3D (solo las «solo-2d» lo traen). */
/* Motivo honesto de una app sin vista 3D (solo las «solo-2d» lo traen). */
const motivoDe = (it: DockItemConfig): string => {
    const r = resolverApp(it);
    return r.tipo === "solo-2d" ? r.motivo : "";
};
export function Dock3D({ espacio, nivel, abrir, salirYAbrir2D }: PropsDock3D) {
    const [config, setConfig] = useState<DockItemConfig[]>(() => loadDockConfig());
    const [tarjeta, setTarjeta] = useState<DockItemConfig | null>(null);
    const [masAbierto, setMasAbierto] = useState(false);
    const [enfocado, setEnfocado] = useState<string | null>(null);
    const { visibles, ocultas } = itemsDelDock(config, espacio.postura);

    useEffect(() => {
        const releer = (e: StorageEvent): void => { if (e.key === DOCK_STORAGE_KEY) setConfig(loadDockConfig()); };
        window.addEventListener("storage", releer);
        return () => window.removeEventListener("storage", releer);
    }, []);

    const radio = disponerTrinity(espacio).nodos.anchor.curvatura ?? undefined;
    const fichas = visibles.map((f) => ({ clave: f.id, nombre: f.label, color: f.color, item: f as DockItemConfig | null }))
        .concat(ocultas.length > 0 ? [{ clave: "__mas", nombre: ETIQUETA_MAS, color: "neutral" as DockColor, item: null }] : []);
    const pulsar = (unItem: DockItemConfig): void => (resolverApp(unItem).tipo === "nativa-3d" ? abrir(unItem.id) : setTarjeta(unItem));
    return <group>
            {posicionesDock(fichas.length, espacio).map((pose, i) => {
                const ficha = fichas[i];
                const nodo = NODO_DE_COLOR[ficha.color];
                return (
                    <group key={ficha.clave} position={pose.posicion} rotation={[0, pose.yaw, 0]}>
                        <Animado hermano={{ i, n: fichas.length }} nivel={nivel} evento={enfocado === ficha.clave ? "foco" : "entrada"}>
                            <Container
                                width={pixeles(LADO_BOTON)} height={pixeles(ALTO_BOTON)} cursor="pointer"
                                onClick={() => (ficha.item ? pulsar(ficha.item) : setMasAbierto((v) => !v))}
                                onPointerOver={() => setEnfocado(ficha.clave)} onPointerOut={() => setEnfocado(null)}
                            >
                                <PanelCristal nodo={nodo} ancho={LADO_BOTON} alto={ALTO_BOTON} curvatura={radio}>
                                    <Container width={pixeles(0.034)} height={pixeles(0.034)} borderRadius={pixeles(0.017)}
                                        justifyContent="center" alignItems="center" backgroundColor={colorConAlfa(colorAcento(nodo), 0.35)}>
                                        <Text fontSize={pixeles(0.014)}>{ficha.nombre.charAt(0).toUpperCase()}</Text>
                                    </Container>
                                    <Texto3D distancia={0.7} fontSize={pixeles(0.008)}>{ficha.nombre}</Texto3D>
                                </PanelCristal>
                            </Container>
                        </Animado>
                    </group>
                );
            })}
            {masAbierto && (
                <Flotante posicion={[0, espacio.alturaOjos - 0.2, -0.65]} radio={radio} nivel={nivel} ancho={0.34} alto={0.2}>
                    <Boton etiqueta={ETIQUETA_MAS} onClick={() => setMasAbierto(false)} />
                    {ocultas.map((o) => (
                        <Boton key={o.id} etiqueta={o.label} onClick={() => pulsar(o)} />
                    ))}
                </Flotante>
            )}
            {tarjeta && (
                <Flotante posicion={[0, espacio.alturaOjos, -0.7]} radio={radio} nivel={nivel} ancho={0.4} alto={0.26}>
                    <Texto3D distancia={0.7} fontSize={pixeles(0.01)}>{tarjeta.label}</Texto3D>
                    <Texto3D distancia={0.7} fontSize={pixeles(0.008)} tono="textoSecundario">{motivoDe(tarjeta)}</Texto3D>
                    <Boton etiqueta={ETIQUETA_SALIDA_2D} onClick={() => salirYAbrir2D(tarjeta.path)} />
                    <Boton etiqueta="Volver" onClick={() => setTarjeta(null)} />
                </Flotante>
            )}
        </group>;
}

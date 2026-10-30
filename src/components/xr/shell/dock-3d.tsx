"use client";

/**
 * StarSeed XR · DOCK CURVO 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 * Son LAS MISMAS apps del dock 2D: `storage` sobre `starseed.dock.items.v2` las refresca. El arco,
 * la altura y el tacto salen del núcleo; el color, de `tokens-3d.ts`; el material, de `PanelCristal`.
 * PARA XR1010AS: `posicionesDock` ya da coordenadas del suelo, así que se monta en la RAÍZ del rig;
 * dentro del grupo del nodo Anchor se sumaría dos veces. Icono = inicial del nombre en un círculo
 * (pasar cada icono de lucide a SVG en uikit no es barato ni mejora la lectura a 6 cm).
 */
import { useEffect, useMemo, useState } from "react";
import { Container } from "@react-three/uikit";
import { DOCK_STORAGE_KEY } from "@/lib/dock/dock-defaults";
import { loadDockConfig, type DockItemConfig } from "@/components/layout/dock-config";
import { posicionesDock, OBJETIVO_MIN_TACTO_M, type EntradaEspacio } from "@/lib/xr/espacio-trinity";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { colorAcento, pixeles } from "./material-cristal";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { Animado } from "./animado";
import { itemsDelDock, resolverApp, nodoDelColor, ETIQUETA_MAS } from "./apps-3d";

const ANCHO = Math.max(OBJETIVO_MIN_TACTO_M, 0.062);
const ALTO = Math.max(OBJETIVO_MIN_TACTO_M, 0.078);
const CIRCULO = 0.03;
const SEPARACION_MAS = 0.11;

export interface PropsDock3D {
    entrada: EntradaEspacio;
    /** Abre el panel 3D de una app en Horizon o Logic. */
    abrir: (id: string) => void;
    /** XR1010AS: cierra la sesión antes de navegar. Sin ella, navegar ya termina la sesión XR. */
    alSalir2D?: (ruta: string) => void;
    nivel?: NivelCalidad;
    opacidadMinima?: number;
}

interface Tarjeta { ruta: string; motivo: string; etiqueta: string }

const inicial = (label: string): string => label.trim().charAt(0).toUpperCase() || "?";

export function Dock3D({ entrada, abrir, alSalir2D, nivel, opacidadMinima }: PropsDock3D) {
    const [items, setItems] = useState<DockItemConfig[]>(() => loadDockConfig());
    const [enfocado, setEnfocado] = useState<string | null>(null);
    const [masAbierto, setMasAbierto] = useState(false);
    const [tarjeta, setTarjeta] = useState<Tarjeta | null>(null);

    useEffect(() => {
        const alCambiar = (e: StorageEvent): void => { if (e.key === DOCK_STORAGE_KEY) setItems(loadDockConfig()); };
        window.addEventListener("storage", alCambiar);
        return () => window.removeEventListener("storage", alCambiar);
    }, []);

    const { visibles, mas } = useMemo(() => itemsDelDock(items, entrada.postura), [items, entrada.postura]);
    const total = visibles.length + (mas.length > 0 ? 1 : 0);
    const posiciones = useMemo(() => (total > 0 ? posicionesDock(total, entrada) : []), [total, entrada]);
    const masAbiertos = useMemo(() => (masAbierto && mas.length > 0 ? posicionesDock(mas.length, entrada) : []), [masAbierto, mas.length, entrada]);
    const pulsar = (item: DockItemConfig): void => {
        const app = resolverApp(item);
        if (app.tipo === "solo-2d") return setTarjeta({ ruta: app.ruta, motivo: app.motivo, etiqueta: item.label });
        abrir(app.tipo === "nativa-3d" ? app.id : app.ruta);
    };
    const salir2D = (): void => { if (!tarjeta) return; if (alSalir2D) alSalir2D(tarjeta.ruta); else if (typeof window !== "undefined") window.location.assign(tarjeta.ruta); };

    const boton = (item: DockItemConfig, pos: { posicion: [number, number, number]; yaw: number }, i: number, n: number) => {
        const curvatura = Math.max(0.01, Math.hypot(pos.posicion[0], pos.posicion[2]));
        const nodo = nodoDelColor(item.color);
        return (
            <group key={item.id} position={pos.posicion} rotation={[0, pos.yaw, 0]} onClick={() => pulsar(item)}
                onPointerOver={() => setEnfocado(item.id)}
                onPointerOut={() => setEnfocado((actual) => (actual === item.id ? null : actual))}>
                <Animado hermano={{ i, n }} evento={enfocado === item.id ? "foco" : "desfoco"} nivel={nivel}>
                    <PanelCristal nodo={nodo} ancho={ANCHO} alto={ALTO} curvatura={curvatura} nivel={nivel} opacidadMinima={opacidadMinima}>
                        <Container flexDirection="column" alignItems="center" justifyContent="center" gap={2} padding={4}>
                            <Container width={pixeles(CIRCULO)} height={pixeles(CIRCULO)} borderRadius={pixeles(CIRCULO / 2)}
                                borderWidth={1} borderColor={colorAcento(nodo)} backgroundColor={CRISTAL.fondoB.color}
                                alignItems="center" justifyContent="center">
                                <Texto3D distancia={curvatura} fontSize={18}>{inicial(item.label)}</Texto3D>
                            </Container>
                            <Texto3D distancia={curvatura}>{item.label}</Texto3D>
                        </Container>
                    </PanelCristal>
                </Animado>
            </group>
        );
    };
    const subir = (p: { posicion: [number, number, number]; yaw: number }) => ({ posicion: [p.posicion[0], p.posicion[1] + SEPARACION_MAS, p.posicion[2]] as [number, number, number], yaw: p.yaw });
    const posMas = posiciones[visibles.length];
    return (
        <group>
            {visibles.map((item, i) => (posiciones[i] ? boton(item, posiciones[i], i, visibles.length) : null))}
            {posMas && mas.length > 0 ? (
                <group key="mas" position={posMas.posicion} rotation={[0, posMas.yaw, 0]} onClick={() => setMasAbierto((v) => !v)}>
                    <PanelCristal nodo="anchor" ancho={ANCHO} alto={ALTO} curvatura={0.6} nivel={nivel} opacidadMinima={opacidadMinima}>
                        <Container flexDirection="column" alignItems="center" justifyContent="center">
                            <Texto3D distancia={0.6}>{ETIQUETA_MAS}</Texto3D>
                            <Texto3D distancia={0.6} tono="textoSecundario">{`+${mas.length}`}</Texto3D>
                        </Container>
                    </PanelCristal>
                </group>
            ) : null}
            {masAbiertos.map((item, i) => (posiciones[i] ? boton(item, subir(posiciones[i]), i, mas.length) : null))}
            {tarjeta ? (
                <group position={[0, Math.max(0.9, entrada.alturaOjos - 0.25), -0.55]}>
                    <PanelCristal nodo="logic" ancho={0.46} alto={0.26} nivel={nivel} opacidadMinima={opacidadMinima}>
                        <Container flexDirection="column" alignItems="center" justifyContent="center" gap={8} padding={16}>
                            <Texto3D distancia={0.55}>Esta app todavía no tiene vista 3D</Texto3D>
                            <Texto3D distancia={0.55} tono="textoSecundario">{`${tarjeta.etiqueta}: ${tarjeta.motivo}`}</Texto3D>
                            <Container cursor="pointer" paddingX={12} paddingY={6} borderWidth={1} borderColor={CRISTAL.borde.color} onClick={salir2D}>
                                <Texto3D distancia={0.55}>Salir y abrir en 2D</Texto3D>
                            </Container>
                        </Container>
                    </PanelCristal>
                </group>
            ) : null}
        </group>
    );
}

export default Dock3D;

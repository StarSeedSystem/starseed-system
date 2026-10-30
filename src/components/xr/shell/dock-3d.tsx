"use client";

/**
 * StarSeed XR · DOCK CURVO 3D (XR1010M · contrato §3 a–b): las MISMAS apps que el dock 2D. Lee
 * `loadDockConfig()` y se refresca con el evento `storage` de `starseed.dock.items.v2` y el cambio
 * local `starseed:dock` (oyente siempre limpio); curva con `posicionesDock`, cristal XR1010H del
 * color-token del item, entrada escalonada (Animado, XR1010I) y foco al apuntar. Decisiones dichas:
 * los SVG de `DOCK_ICON_MAP` son HTML del 2D y uikit no los pinta, así que el icono es la INICIAL
 * del nombre en un círculo del color del item (barato); «Más»/«Menos» alterna lo que no cabe; lo
 * que no tiene vista 3D SE DICE (`solo-2d`) con «Salir y abrir en 2D». Cable: XR1010AS (Anchor).
 */

import { useEffect, useMemo, useState } from "react";
import { Container } from "@react-three/uikit";
import { OBJETIVO_MIN_TACTO_M, posicionesDock, type EntradaEspacio } from "@/lib/xr/espacio-trinity";
import { loadDockConfig, type DockItemConfig, type DockColor } from "@/components/layout/dock-config";
import { DOCK_STORAGE_KEY } from "@/lib/dock/dock-defaults";
import type { Vec3 } from "@/lib/xr/tipos";
import { COLOR_DE_ITEM, COLOR_TARJETA, NODO_DE_COLOR, itemsDelDock, resolverApp, type ItemsDock3D } from "./apps-3d";
import { colorAcento, colorConAlfa, pixeles } from "./material-cristal";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { Animado } from "./animado";

/** Medidas en metros, con el objetivo táctil del núcleo (§3 a) como piso. */
const ANCHO_BOTON = Math.max(0.07, OBJETIVO_MIN_TACTO_M), ALTO_BOTON = Math.max(0.09, OBJETIVO_MIN_TACTO_M), LADO_CIRCULO = Math.max(0.05, OBJETIVO_MIN_TACTO_M);
const ANCHO_TARJETA = 0.36, ALTO_TARJETA = 0.15, ALTURA_TARJETA = 0.13, DISTANCIA = 0.62;

export interface PropsDock3D {
    entrada: EntradaEspacio;
    /** Abre la app nativa 3D en Horizon/Logic; `salirA2D` termina sesión y navega a la ruta. */
    abrir: (id: string) => void;
    salirA2D: (ruta: string) => void;
}

export function Dock3D({ entrada, abrir, salirA2D }: PropsDock3D) {
    const [items, setItems] = useState<ItemsDock3D>(() => itemsDelDock(loadDockConfig(), entrada.postura));
    const [expandido, setExpandido] = useState(false);
    const [tarjeta, setTarjeta] = useState<DockItemConfig | null>(null);

    // Mismas apps que el dock 2D: refresco con `storage` (otra pestaña) y `starseed:dock` (local).
    useEffect(() => {
        const cambiar = () => setItems(itemsDelDock(loadDockConfig(), entrada.postura));
        const alAlmacenar = (e: StorageEvent) => e.key === DOCK_STORAGE_KEY && cambiar();
        window.addEventListener("storage", alAlmacenar);
        window.addEventListener("starseed:dock", cambiar);
        return () => {
            window.removeEventListener("storage", alAlmacenar);
            window.removeEventListener("starseed:dock", cambiar);
        };
    }, [entrada.postura]);

    const enVista = expandido ? items.mas : items.visibles;
    const resto = expandido ? items.visibles : items.mas;
    const n = enVista.length + (resto.length > 0 ? 1 : 0);
    const posiciones = useMemo(() => posicionesDock(n, entrada), [n, entrada]);
    const centro = useMemo(() => posicionesDock(1, entrada)[0], [entrada]);
    const botones = [
        ...enVista.map((item, i) => ({ i, item, titulo: item.label, color: item.color })),
        ...(resto.length > 0 ? [{ i: n - 1, item: null, titulo: expandido ? "Menos" : "Más", color: "neutral" as DockColor }] : []),
    ];
    const resolucion = tarjeta != null ? resolverApp(tarjeta) : null;
    const motivo = resolucion?.tipo === "solo-2d" ? resolucion.motivo : "";

    const alPulsar = (item: DockItemConfig) => {
        const r = resolverApp(item);
        if (r.tipo !== "solo-2d") abrir(r.id);
        setTarjeta((prev) => (r.tipo === "solo-2d" && prev?.id !== item.id ? item : null));
    };

    return (
        <group>
            {botones.map((b) => (
                <BotonDock3D key={b.item?.id ?? "mas"} titulo={b.titulo} color={b.color} i={b.i} n={n}
                    posicion={posiciones[b.i].posicion} yaw={posiciones[b.i].yaw}
                    alPulsar={() => (b.item ? alPulsar(b.item) : setExpandido(!expandido))} />
            ))}
            {tarjeta != null && resolucion?.tipo === "solo-2d" && (
                <TarjetaSolo2D titulo={tarjeta.label} motivo={motivo}
                    posicion={[centro.posicion[0], centro.posicion[1] + ALTURA_TARJETA, centro.posicion[2]]}
                    yaw={centro.yaw} salirA2D={() => salirA2D(tarjeta.path)} />
            )}
        </group>
    );
}
interface PropsBotonDock { titulo: string; color: DockColor; i: number; n: number; posicion: Vec3; yaw: number; alPulsar: () => void }
interface PropsTarjeta { titulo: string; motivo: string; posicion: Vec3; yaw: number; salirA2D: () => void }

/** Botón: cristal del token del item, inicial en círculo y nombre debajo; entrada escalonada y foco. */
function BotonDock3D({ titulo, color, i, n, posicion, yaw, alPulsar }: PropsBotonDock) {
    const [s, setS] = useState(0); // 0 = entrada, 1 = con foco, 2 = sin foco
    return (
        <group position={posicion} rotation={[0, yaw, 0]}>
            <Animado evento={s === 1 ? "foco" : s === 2 ? "desfoco" : "entrada"} hermano={{ i, n }} distancia={DISTANCIA}>
                <PanelCristal nodo={NODO_DE_COLOR[color]} ancho={ANCHO_BOTON} alto={ALTO_BOTON}>
                    <Container onClick={alPulsar} onPointerOver={() => setS(1)} onPointerOut={() => s !== 0 && setS(2)}
                        cursor="pointer" width={pixeles(ANCHO_BOTON)} height={pixeles(ALTO_BOTON)}
                        flexDirection="column" alignItems="center" justifyContent="center">
                        <Container width={pixeles(LADO_CIRCULO)} height={pixeles(LADO_CIRCULO)} borderRadius={pixeles(LADO_CIRCULO) / 2}
                            backgroundColor={COLOR_DE_ITEM[color]} alignItems="center" justifyContent="center">
                            <Texto3D distancia={DISTANCIA} fontSize={26}>{titulo.trim().charAt(0).toUpperCase() || "·"}</Texto3D>
                        </Container>
                        <Texto3D distancia={DISTANCIA} fontSize={16}>{titulo}</Texto3D>
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}

/** Tarjeta honesta de «solo-2d»: el motivo y la única acción real, salir y abrir en 2D. */
function TarjetaSolo2D({ titulo, motivo, posicion, yaw, salirA2D }: PropsTarjeta) {
    return (
        <group position={posicion} rotation={[0, yaw, 0]}>
            <Animado evento="entrada" distancia={DISTANCIA}>
                <PanelCristal nodo="anchor" ancho={ANCHO_TARJETA} alto={ALTO_TARJETA}>
                    <Texto3D distancia={DISTANCIA}>{titulo}</Texto3D>
                    <Texto3D distancia={DISTANCIA} tono="textoSecundario">{motivo}</Texto3D>
                    <Container onClick={salirA2D} cursor="pointer" padding={8} borderWidth={pixeles(0.002)}
                        borderColor={colorConAlfa(colorAcento("anchor"), 0.6)} backgroundColor={colorConAlfa(COLOR_TARJETA, 0.2)}>
                        <Texto3D distancia={DISTANCIA}>Salir y abrir en 2D</Texto3D>
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}


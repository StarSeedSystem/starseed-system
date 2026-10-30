"use client";
/**
 * StarSeed XR · DOCK CURVO 3D (XR1010M · contrato §3 a y b). LAS MISMAS apps del dock 2D
 * (`loadDockConfig()`): cambian en 2D → cambian aquí (evento `storage` de
 * `starseed.dock.items.v2`). Celdas de cristal (XR1010H) en el arco de Anchor con
 * `posicionesDock`, entrada escalonada (XR1010I), objetivo táctil ≥ `OBJETIVO_MIN_TACTO_M` y
 * foco al apuntar. Icono: inicial del nombre en círculo del color del item — los paths SVG de
 * lucide no encajan en `Svg` de uikit sin una sincronía cara. Sin vista 3D se dice con el motivo
 * y se ofrece «Salir y abrir en 2D»: nunca finge (§3 b).
 */
import { useEffect, useState } from "react";
import { Container } from "@react-three/uikit";
import type { Mano, ModoXR, Postura } from "@/lib/xr/tipos";
import { OBJETIVO_MIN_TACTO_M, posicionesDock, type EntradaEspacio } from "@/lib/xr/espacio-trinity";
import { loadDockConfig, type DockItemConfig } from "@/components/layout/dock-config";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import { itemsDelDock, resolverApp, TINTE_CELDA } from "./apps-3d";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { Animado } from "./animado";
import { pixeles } from "./material-cristal";
export interface PropsDock3D {
    modo: ModoXR; postura: Postura; manoDominante: Mano; alturaOjos: number; escala?: number; yawBase?: number;
    // distancia: a las celdas (m), pide el tamaño mínimo del texto; abrir: app nativa en Horizon/Logic;
    // salirYAbrir2D: termina la sesión y navega a la ruta 2D (solo lo sin vista 3D).
    distancia?: number;
    abrir: (id: string) => void;
    salirYAbrir2D: (ruta: string) => void;
}
/** Celdas bien a mano ≥ `OBJETIVO_MIN_TACTO_M` (3 cm) de objetivo táctil; alto extra para el nombre. */
const ANCHO_CELDA = 0.075;
const ALTO_CELDA = 0.115;
const DIAMETRO_CIRCULO = 0.036;
/** Una celda del dock: cristal de Anchor, círculo con la inicial y el nombre debajo. */
function Celda({ item, distancia, evento, alApuntar, alPulsar }: {
    item: DockItemConfig; distancia: number; evento: "entrada" | "foco";
    alApuntar: (id: string | null) => void; alPulsar: (item: DockItemConfig) => void;
}) {
    return (
        <Animado evento={evento} distancia={distancia}>
            <PanelCristal nodo="anchor" ancho={ANCHO_CELDA} alto={ALTO_CELDA}>
                <Container width="100%" height="100%" flexDirection="column" alignItems="center" justifyContent="center" gapRow={pixeles(0.004)}
                    cursor="pointer" onClick={() => alPulsar(item)} onPointerOver={() => alApuntar(item.id)} onPointerOut={() => alApuntar(null)}>
                    <Container width={pixeles(DIAMETRO_CIRCULO)} height={pixeles(DIAMETRO_CIRCULO)} borderRadius={pixeles(DIAMETRO_CIRCULO / 2)}
                        backgroundColor={TINTE_CELDA[item.color]} alignItems="center" justifyContent="center">
                        <Texto3D distancia={distancia} fontSize={10}>{item.label.charAt(0).toUpperCase()}</Texto3D>
                    </Container>
                    <Texto3D distancia={distancia} fontSize={7}>{item.label}</Texto3D>
                </Container>
            </PanelCristal>
        </Animado>
    );
}
/** Tarjeta honesta para una app sin vista 3D (§3 b): el motivo y salir después a 2D. */
function TarjetaSolo2D({ label, ruta, motivo, distancia, salirYAbrir2D, cerrar }: {
    label: string; ruta: string; motivo: string; distancia: number;
    salirYAbrir2D: (ruta: string) => void; cerrar: () => void;
}) {
    return (
        <group position={[0, 0.22, -0.02]}>
            <Animado evento="entrada" distancia={distancia}>
                <PanelCristal nodo="anchor" ancho={0.34} alto={0.21}>
                    <Container width="100%" height="100%" flexDirection="column" alignItems="center" justifyContent="center" gapRow={pixeles(0.008)}
                        paddingLeft={12} paddingRight={12} paddingTop={10} paddingBottom={10}>
                        <Texto3D distancia={distancia}>{label}</Texto3D>
                        <Texto3D distancia={distancia} tono="textoSecundario">{motivo}</Texto3D>
                        <Container cursor="pointer" onClick={() => salirYAbrir2D(ruta)} borderWidth={1} borderColor={CRISTAL.borde.color}
                            paddingTop={6} paddingBottom={6} paddingLeft={14} paddingRight={14}>
                            <Texto3D distancia={distancia}>Salir y abrir en 2D</Texto3D>
                        </Container>
                        <Container onClick={cerrar} cursor="pointer">
                            <Texto3D distancia={distancia} tono="textoSecundario" fontSize={8}>Cerrar tarjeta</Texto3D>
                        </Container>
                    </Container>
                </PanelCristal>
            </Animado>
        </group>
    );
}
/** La celda de «Más»: no es una app; abre el panel con lo que no cabe (nunca un botón sin efecto). */
const MAS: DockItemConfig = { id: "dock-mas", label: "Más", iconKey: "LayoutGrid", path: "", color: "neutral", enabled: true, origin: "preset" };
export function Dock3D({ modo, postura, manoDominante, alturaOjos, escala, yawBase, distancia = 0.62, abrir, salirYAbrir2D }: PropsDock3D) {
    const [items, setItems] = useState<DockItemConfig[]>(loadDockConfig);
    const [masAbierto, setMasAbierto] = useState(false);
    const [tarjeta, setTarjeta] = useState<{ label: string; ruta: string; motivo: string } | null>(null);
    const [foco, setFoco] = useState<string | null>(null);
    // LAS MISMAS apps del dock 2D: el evento `storage` recarga y el oyente se LIMPIA al desmontar.
    useEffect(() => {
        const recargar = () => setItems(loadDockConfig());
        window.addEventListener("storage", recargar);
        return () => window.removeEventListener("storage", recargar);
    }, []);
    const entrada: EntradaEspacio = { alturaOjos, postura, manoDominante, modo, escala, yawBase };
    const { visibles, mas } = itemsDelDock(items, postura);
    const posiciones = posicionesDock(mas.length > 0 ? visibles.length + 1 : visibles.length, entrada);
    const pulsar = (item: DockItemConfig) => {
        setMasAbierto(item.id === MAS.id);
        if (item.id === MAS.id) return;
        const r = resolverApp(item);
        if (r.tipo === "nativa-3d") { setTarjeta(null); abrir(r.id); }
        else if (r.tipo === "solo-2d") setTarjeta({ label: item.label, ruta: r.ruta, motivo: r.motivo });
    };
    const celda = (item: DockItemConfig, i: number) => (
        <group key={item.id} position={posiciones[i]?.posicion} rotation-y={posiciones[i]?.yaw ?? 0}>
            <Celda item={item} distancia={distancia} evento={foco === item.id ? "foco" : "entrada"} alApuntar={setFoco} alPulsar={pulsar} />
        </group>
    );
    return (
        <group>
            {visibles.map(celda)}
            {mas.length > 0 ? celda(MAS, visibles.length) : null}
            {masAbierto && mas.length > 0 ? (
                <group position={[0, 0.15, -0.01]}>
                    <Animado evento="entrada" distancia={distancia}>
                        <PanelCristal nodo="anchor" ancho={0.2} alto={mas.length * 0.03 + 0.03}>
                            <Container flexDirection="column">
                                {mas.map((it) => (
                                    <Container key={it.id} cursor="pointer" onClick={() => pulsar(it)} paddingLeft={10} paddingRight={10} paddingTop={4} paddingBottom={4}>
                                        <Texto3D distancia={distancia} fontSize={8}>{it.label}</Texto3D>
                                    </Container>
                                ))}
                            </Container>
                        </PanelCristal>
                    </Animado>
                </group>
            ) : null}
            {tarjeta ? <TarjetaSolo2D label={tarjeta.label} ruta={tarjeta.ruta} motivo={tarjeta.motivo} distancia={distancia} salirYAbrir2D={salirYAbrir2D} cerrar={() => setTarjeta(null)} /> : null}
        </group>
    );
}

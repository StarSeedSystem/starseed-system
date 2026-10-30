"use client";

/**
 * StarSeed XR · DOCK 3D CURVO (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 * Las MISMAS apps del dock 2D (lee `loadDockConfig()`, escucha `storage` de `starseed.dock.items.v2`).
 * Botón = PanelCristal del color del item (tokens) + nombre debajo, entrada escalonada y foco.
 * Icono: la INICIAL en círculo (los de `DOCK_ICON_MAP` son DOM de lucide: serializarlos sale caro).
 * Sin vista 3D → motivo honesto y «Salir y abrir en 2D»; nada finge.
 */
import { useEffect, useMemo, useState } from "react";
import { Container } from "@react-three/uikit";
import { OBJETIVO_MIN_TACTO_M, posicionesDock, type EntradaEspacio } from "../../../lib/xr/espacio-trinity";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import type { EstiloTransicion } from "../../../lib/xr/transiciones";
import { DOCK_STORAGE_KEY } from "../../../lib/dock/dock-defaults";
import { loadDockConfig, type DockItemConfig } from "../../layout/dock-config";
import { MOTIVO_SIN_VISTA_3D, itemsDelDock, nodoDeColor, resolverApp } from "./apps-3d";
import { colorAcento, colorConAlfa, pixeles } from "./material-cristal";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { Animado } from "./animado";
const CIRCULO_M = Math.max(0.06, OBJETIVO_MIN_TACTO_M), ETIQUETA_M = 0.032; // objetivo táctil ≥ 3 cm (§3 a)

export interface PropsDock3D {
    entrada: EntradaEspacio;
    /** Abre el panel de la app en Horizon o Logic; XR1010AS lo cablea en el nodo Anchor. */
    abrir: (id: string) => void;
    /** Termina la sesión XR y navega a la ruta 2D; quien cablea pone el Router (next/navigation). */
    abrirEn2D?: (ruta: string) => void;
    nivel?: NivelCalidad; estilo?: EstiloTransicion;
    /** Distancia a la persona (m) para el texto y las transiciones; el dock va cerca. */
    distancia?: number; movimientoReducido?: boolean;
}

export function Dock3D({ entrada, abrir, abrirEn2D, nivel, estilo, distancia = 0.6, movimientoReducido }: PropsDock3D) {
    const [items, setItems] = useState<DockItemConfig[]>(() => loadDockConfig());
    const [tarjeta, setTarjeta] = useState<DockItemConfig | null>(null), [masAbierto, setMasAbierto] = useState(false);
    const [foco, setFoco] = useState(-1), [tocado, setTocado] = useState(false); // «tocado»: ya hubo foco
    useEffect(() => {
        const escucha = (e: StorageEvent) => { if (e.key === DOCK_STORAGE_KEY) setItems(loadDockConfig()); };
        window.addEventListener("storage", escucha);
        return () => window.removeEventListener("storage", escucha);
    }, []);
    const reparto = useMemo(() => itemsDelDock(items, entrada.postura), [items, entrada.postura]);
    const n = reparto.visibles.length + (reparto.mas ? 1 : 0);
    const sitios = useMemo(() => posicionesDock(n, entrada), [n, entrada]);
    const anim = { nivel, estilo, distancia, movimientoReducido };
    const pulsar = (item: DockItemConfig) => {
        const res = resolverApp(item);
        if (res.tipo === "solo-2d") return setTarjeta(item);
        abrir(res.tipo === "uispec" ? `uispec:${res.ruta}` : res.id);
        setMasAbierto(false); setTarjeta(null);
    };
    return (
        <>
            {sitios.map((sitio, i) => { const item = reparto.visibles[i], enFoco = foco === i; return (
                    <group key={item ? item.id : "mas"} position={sitio.posicion} rotation={[0, sitio.yaw, 0]}>
                        <Animado evento={enFoco ? "foco" : tocado ? "desfoco" : "entrada"} hermano={{ i, n }} {...anim}>
                            <Boton3D nodo={item ? nodoDeColor(item.color) : "anchor"} inicial={item ? undefined : "+"}
                                nombre={item ? item.label : "Más"} distancia={distancia} enFoco={enFoco}
                                alFoco={(v) => { setFoco(v ? i : -1); if (!v) setTocado(true); }}
                                alPulsar={item ? () => pulsar(item) : () => setMasAbierto((v) => !v)} />
                        </Animado>
                    </group>
                );
            })}
            {masAbierto && reparto.mas && <group position={[0, entrada.alturaOjos - 0.25, -0.58]}><Animado evento="despliegue" {...anim}><MasPanel ocultos={reparto.ocultos} distancia={distancia} nivel={nivel} alPulsar={pulsar} /></Animado></group>}
            {tarjeta && <group position={[0, entrada.alturaOjos - 0.25, -0.58]}><Animado evento="despliegue" {...anim}><TarjetaSin3D item={tarjeta} distancia={distancia} nivel={nivel} abrirEn2D={abrirEn2D} cerrar={() => setTarjeta(null)} /></Animado></group>}
        </>
    );
}
type PropsBoton3D = { nodo: "zenith" | "horizon" | "logic" | "anchor"; nombre: string; inicial?: string; distancia: number; enFoco: boolean; alFoco: (v: boolean) => void; alPulsar: () => void };

function Boton3D({ nodo, nombre, inicial, distancia, enFoco, alFoco, alPulsar }: PropsBoton3D) {
    const radio = pixeles(CIRCULO_M / 2);
    return (
        <PanelCristal nodo={nodo} ancho={CIRCULO_M + 0.012} alto={CIRCULO_M + ETIQUETA_M + 0.014}>
            <Container width={pixeles(CIRCULO_M)} height={pixeles(CIRCULO_M)} justifyContent="center" alignItems="center"
                backgroundColor={colorConAlfa(colorAcento(nodo), enFoco ? 0.95 : 0.75)} borderTopLeftRadius={radio} borderTopRightRadius={radio}
                borderBottomLeftRadius={radio} borderBottomRightRadius={radio}
                onClick={alPulsar} onPointerOver={() => alFoco(true)} onPointerOut={() => alFoco(false)} cursor="pointer">
                <Texto3D distancia={distancia} grados={0.8}>{inicial ?? nombre.charAt(0).toUpperCase()}</Texto3D>
            </Container>
            <Container height={pixeles(ETIQUETA_M)} justifyContent="center" alignItems="center"><Texto3D distancia={distancia} fontSize={pixeles(0.012)}>{nombre}</Texto3D></Container>
        </PanelCristal>
    );
}

/** «Más»: el resto de apps enabled que no caben en la curva; hasta 8 filas y la décima abre la siguiente. */
function MasPanel({ ocultos, distancia, nivel, alPulsar }: { ocultos: DockItemConfig[]; distancia: number; nivel?: NivelCalidad; alPulsar: (i: DockItemConfig) => void }) {
    const filas = ocultos.slice(0, 8);
    return (
        <PanelCristal nodo="anchor" ancho={0.26} alto={0.06 + 0.042 * filas.length} nivel={nivel}>
            {filas.map((item) => (
                <Container key={item.id} height={pixeles(0.042)} justifyContent="center" alignItems="center" onClick={() => alPulsar(item)} cursor="pointer">
                    <Texto3D distancia={distancia} fontSize={pixeles(0.011)}>{item.label}</Texto3D>
                </Container>
            ))}
            {ocultos.length > filas.length && (
                <Container height={pixeles(0.026)} justifyContent="center" alignItems="center" onClick={() => alPulsar(ocultos[filas.length])} cursor="pointer">
                    <Texto3D distancia={distancia} fontSize={pixeles(0.009)} tono="textoSecundario">…más {ocultos.length - filas.length} (esta abre la siguiente)</Texto3D>
                </Container>
            )}
        </PanelCristal>
    );
}

/** Tarjeta honesta de una app sin vista 3D: el motivo y una salida REAL a 2D (solo con `abrirEn2D`). */
function TarjetaSin3D({ item, distancia, nivel, abrirEn2D, cerrar }: { item: DockItemConfig; distancia: number; nivel?: NivelCalidad; abrirEn2D?: (ruta: string) => void; cerrar: () => void }) {
    return (
        <PanelCristal nodo="anchor" ancho={0.26} alto={0.12} nivel={nivel}>
            <Container height={pixeles(0.065)} justifyContent="center" alignItems="center"><Texto3D distancia={distancia} fontSize={pixeles(0.011)}>{MOTIVO_SIN_VISTA_3D}</Texto3D></Container>
            <Container height={pixeles(0.055)} flexDirection="row" justifyContent="space-evenly" alignItems="center">
                <Container height={pixeles(0.035)} onClick={cerrar} cursor="pointer"><Texto3D distancia={distancia} fontSize={pixeles(0.01)} tono="textoSecundario">Cerrar</Texto3D></Container>
                {abrirEn2D && (
                    <Container height={pixeles(0.035)} onClick={() => abrirEn2D(item.path)} cursor="pointer"><Texto3D distancia={distancia} fontSize={pixeles(0.01)}>Salir y abrir en 2D</Texto3D></Container>
                )}
            </Container>
        </PanelCristal>
    );
}

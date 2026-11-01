"use client";

/**
 * StarSeed XR · DOCK CURVO 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 * Cascarón fino de R3F/uikit sobre Anchor con las MISMAS apps del dock 2D (`loadDockConfig`), colocadas
 * por `posicionesDock`. Qué cabe y qué es nativo 3D o solo 2D lo decide `apps-3d.ts` (puro y probado).
 * Icono: la inicial en un círculo (lucide da componentes React, no una cadena SVG barata para uikit).
 * Lo cablea al nodo Anchor XR1010AS.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Container } from "@react-three/uikit";
import { DOCK_STORAGE_KEY } from "@/lib/dock/dock-defaults";
import { loadDockConfig, type DockItemConfig } from "@/components/layout/dock-config";
import { OBJETIVO_MIN_TACTO_M, posicionesDock } from "@/lib/xr/espacio-trinity";
import { CRISTAL } from "@/lib/xr/tokens-3d";
import type { ModoXR, NivelCalidad, Postura, Vec3 } from "@/lib/xr/tipos";
import type { EventoTransicion } from "@/lib/xr/transiciones";
import { entradaDeDock, itemsDelDock, nodoDeColor, resolverApp } from "./apps-3d";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { usePrefsXR } from "./use-prefs-xr";

export interface PropsDock3D {
    postura?: Postura; modo?: ModoXR; nivel?: NivelCalidad; alturaOjos?: number;
    /** Abre el panel nativo 3D (Horizon/Logic) por su id; lo pasa XR1010AS. */
    alAbrir3D?: (id: string) => void;
    /** Salida a 2D inyectable; por defecto cierra la sesión y navega. */
    alSalirA2D?: (ruta: string) => void | Promise<void>;
}
type PosaDock = { posicion: Vec3; yaw: number };
const ANCHO = Math.max(OBJETIVO_MIN_TACTO_M, 0.1);
const ALTO = Math.max(OBJETIVO_MIN_TACTO_M, 0.09);

export function Dock3D({ postura, modo = "vr-inmersivo", nivel, alturaOjos = 1.65, alAbrir3D, alSalirA2D }: PropsDock3D) {
    const { confort } = usePrefsXR();
    const [config, setConfig] = useState<DockItemConfig[]>(() => loadDockConfig());
    const [verMas, setVerMas] = useState(false);
    const [tarjeta, setTarjeta] = useState<{ titulo: string; motivo: string; ruta?: string } | null>(null);
    useEffect(() => {
        const alCambiar = (e: StorageEvent) => { if (e.key === null || e.key === DOCK_STORAGE_KEY) setConfig(loadDockConfig()); };
        window.addEventListener("storage", alCambiar);
        return () => window.removeEventListener("storage", alCambiar);
    }, []);

    const posturaEfectiva = postura ?? confort.postura;
    const { visibles, mas } = useMemo(() => itemsDelDock(config, posturaEfectiva), [config, posturaEfectiva]);
    const mostrados = verMas ? mas : visibles;
    const hayMas = mas.length > 0;
    const total = mostrados.length + (hayMas ? 1 : 0);
    const entrada = useMemo(() => entradaDeDock(posturaEfectiva, { alturaOjos, modo, manoDominante: confort.manoDominante, escala: confort.escala }), [posturaEfectiva, alturaOjos, modo, confort.manoDominante, confort.escala]);
    const posiciones = useMemo(() => posicionesDock(total, entrada), [total, entrada]);

    const pulsar = useCallback((item: DockItemConfig) => {
        const r = resolverApp(item);
        if (r.tipo === "nativa-3d" && alAbrir3D) return alAbrir3D(r.id);
        if (r.tipo === "nativa-3d") return setTarjeta({ titulo: item.label, motivo: `Próximamente: abrir ${item.label} en 3D` });
        if (r.tipo === "uispec") return setTarjeta({ titulo: item.label, motivo: "Próximamente: abrir esta página declarativa en 3D" });
        setTarjeta({ titulo: item.label, motivo: r.motivo, ruta: r.ruta });
    }, [alAbrir3D]);
    const abrirEn2D = useCallback(async (ruta: string) => {
        if (alSalirA2D) { await alSalirA2D(ruta); return; }
        try { const { soltarAlmacenXR } = await import("./almacen-xr"); await soltarAlmacenXR(); } catch { /* sin sesión abierta no hay nada que cerrar */ }
        window.location.assign(ruta);
    }, [alSalirA2D]);

    if (total === 0) return null;
    const distancia = (p: Vec3) => Math.hypot(p[0], p[1] - alturaOjos, p[2]);
    const masItem: DockItemConfig = { id: "mas", label: verMas ? "Menos" : `Más (${mas.length})`, iconKey: "LayoutGrid", path: "", color: "neutral", enabled: true, origin: "preset" };
    return (
        <group>
            {mostrados.map((item, i) => (
                <BotonDock key={item.id} item={item} posa={posiciones[i]} indice={i} total={total} nivel={nivel} distancia={distancia(posiciones[i].posicion)} alPulsar={pulsar} />
            ))}
            {hayMas && <BotonDock item={masItem} posa={posiciones[mostrados.length]} indice={mostrados.length} total={total} nivel={nivel} distancia={distancia(posiciones[mostrados.length].posicion)} alPulsar={() => setVerMas((v) => !v)} />}
            {tarjeta && (
                <group position={[0, alturaOjos + 0.18, -0.7]}>
                    <Animado evento="despliegue" nivel={nivel} distancia={0.7}>
                        <PanelCristal nodo="anchor" ancho={0.34} alto={0.2} curvatura={0.6} nivel={nivel}>
                            <Container flexDirection="column" gap={6} padding={8}>
                                <Texto3D distancia={0.7} fontSize={22}>{tarjeta.titulo}</Texto3D>
                                <Texto3D distancia={0.7} tono="textoSecundario">{tarjeta.motivo}</Texto3D>
                                <Container flexDirection="row" gap={6}>
                                    {tarjeta.ruta && <Container onClick={() => void abrirEn2D(tarjeta.ruta!)} cursor="pointer" backgroundColor={CRISTAL.fondoB.color} padding={6}><Texto3D distancia={0.7}>Salir y abrir en 2D</Texto3D></Container>}
                                    <Container onClick={() => setTarjeta(null)} cursor="pointer" backgroundColor={CRISTAL.fondoB.color} padding={6}><Texto3D distancia={0.7} tono="textoSecundario">Cerrar</Texto3D></Container>
                                </Container>
                            </Container>
                        </PanelCristal>
                    </Animado>
                </group>
            )}
        </group>
    );
}

interface PropsBotonDock {
    item: DockItemConfig; posa: PosaDock; indice: number; total: number;
    nivel?: NivelCalidad; distancia: number; alPulsar: (item: DockItemConfig) => void;
}

function BotonDock({ item, posa, indice, total, nivel, distancia, alPulsar }: PropsBotonDock) {
    const [evento, setEvento] = useState<EventoTransicion>("entrada");
    const inicial = item.label.trim().charAt(0).toUpperCase() || "?";
    return (
        <group position={posa.posicion} rotation={[0, posa.yaw, 0]}>
            <Animado evento={evento} hermano={{ i: indice, n: total }} nivel={nivel} distancia={distancia}>
                <Container flexDirection="column" alignItems="center" gap={4} cursor="pointer"
                    onClick={() => alPulsar(item)} onPointerOver={() => setEvento("foco")} onPointerOut={() => setEvento("desfoco")}>
                    <PanelCristal nodo={nodoDeColor(item.color)} ancho={ANCHO} alto={ALTO} curvatura={0.5} nivel={nivel}>
                        <Container width={40} height={40} alignItems="center" justifyContent="center"
                            borderTopLeftRadius={20} borderTopRightRadius={20} borderBottomLeftRadius={20} borderBottomRightRadius={20}
                            backgroundColor={CRISTAL.fondoB.color}>
                            <Texto3D distancia={distancia} fontSize={20}>{inicial}</Texto3D>
                        </Container>
                    </PanelCristal>
                    <Texto3D distancia={distancia} fontSize={18}>{item.label}</Texto3D>
                </Container>
            </Animado>
        </group>
    );
}

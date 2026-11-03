"use client";

/**
 * StarSeed XR · DOCK 3D (XR1010M · contrato `architecture/starseed-xr.md` §3 a y b).
 * Las MISMAS apps del dock 2D, en un arco curvo delante de la cintura, con el color de su token.
 * Lo que no tiene vista 3D hoy lo dice y ofrece «Salir y abrir en 2D»; nunca un botón sin efecto.
 * El icono es la inicial en un círculo: el SVG de `DOCK_ICON_MAP` es DOM y no cabe en uikit.
 */
import { useEffect, useMemo, useState } from "react";
import { Container } from "@react-three/uikit";
import { UNSAFE_useXRStore } from "@react-three/xr";
import type { DockItemConfig } from "@/components/layout/dock-config";
import { loadDockConfig } from "@/components/layout/dock-config";
import { DOCK_STORAGE_KEY } from "@/lib/dock/dock-defaults";
import type { ModoXR, NivelCalidad, Postura, Vec3 } from "@/lib/xr/tipos";
import { OBJETIVO_MIN_TACTO_M, posicionesDock } from "@/lib/xr/espacio-trinity";
import { CRISTAL, type NodoCardinal } from "@/lib/xr/tokens-3d";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { usePrefsXR } from "./use-prefs-xr";
import { inicialDe, motivoDeApertura, nodoDeColor, paginasDelDock, resolverApp } from "./apps-3d";

const LADO = Math.max(OBJETIVO_MIN_TACTO_M, 0.075);
const DISTANCIA = 0.65;
type Control = { tipo: "app"; item: DockItemConfig } | { tipo: "mas" } | { tipo: "atras" };

export interface PropsDock3D {
    /** Altura de ojos efectiva (m). */
    alturaOjos?: number;
    /** Modo XR vigente. */
    modo?: ModoXR;
    /** Nivel de calidad de las transiciones. */
    nivel?: NivelCalidad;
    /** Fuerza una postura; por defecto, la del confort. */
    postura?: Postura;
    /** Abre el panel 3D de una app nativa. Lo cablea XR1010AS. */
    abrir?: (id: string) => void;
}

interface PropsBoton {
    etiqueta: string;
    glifo: string;
    nodo: NodoCardinal;
    posicion: Vec3;
    yaw: number;
    i: number;
    n: number;
    nivel: NivelCalidad;
    enfocado: boolean;
    alPulsar: () => void;
    alFoco: (v: boolean) => void;
}

function BotonDock({ etiqueta, glifo, nodo, posicion, yaw, i, n, nivel, enfocado, alPulsar, alFoco }: PropsBoton) {
    return (
        <group position={posicion} rotation={[0, yaw, 0]}>
            <Animado evento="entrada" hermano={{ i, n }} nivel={nivel} distancia={DISTANCIA}>
                <group scale={enfocado ? 1.08 : 1} onClick={alPulsar} onPointerOver={() => alFoco(true)} onPointerOut={() => alFoco(false)}>
                    <PanelCristal nodo={nodo} ancho={LADO} alto={LADO}>
                        <Container width="100%" height="100%" alignItems="center" justifyContent="center">
                            <Texto3D distancia={DISTANCIA} fontSize={30}>{glifo}</Texto3D>
                        </Container>
                    </PanelCristal>
                    <group position={[0, -LADO * 0.8, 0]}>
                        <Texto3D distancia={DISTANCIA} fontSize={12}>{etiqueta}</Texto3D>
                    </group>
                </group>
            </Animado>
        </group>
    );
}

interface PropsTarjeta {
    item: DockItemConfig;
    motivo: string;
    alturaOjos: number;
    nivel: NivelCalidad;
    alSalir2D: () => void;
    alCerrar: () => void;
}

function Tarjeta2D({ item, motivo, alturaOjos, nivel, alSalir2D, alCerrar }: PropsTarjeta) {
    return (
        <group position={[0, alturaOjos + 0.02, -0.55]}>
            <PanelCristal nodo="zenith" ancho={0.52} alto={0.28} nivel={nivel}>
                <Container flexDirection="column" gap={8} padding={14} width="100%" height="100%" justifyContent="center">
                    <Texto3D distancia={0.55} fontSize={16}>{item.label}</Texto3D>
                    <Texto3D distancia={0.55} fontSize={12} tono="textoSecundario">{motivo}</Texto3D>
                    <Container flexDirection="row" gap={8} justifyContent="center">
                        <Container cursor="pointer" backgroundColor={CRISTAL.fondoB.color} borderRadius={8} padding={14} onClick={alSalir2D}>
                            <Texto3D distancia={0.55} fontSize={13}>Salir y abrir en 2D</Texto3D>
                        </Container>
                        <Container cursor="pointer" backgroundColor={CRISTAL.fondoB.color} borderRadius={8} padding={14} onClick={alCerrar}>
                            <Texto3D distancia={0.55} fontSize={13}>Volver</Texto3D>
                        </Container>
                    </Container>
                </Container>
            </PanelCristal>
        </group>
    );
}

export function Dock3D({ alturaOjos = 1.6, modo = "vr-inmersivo", nivel = "media", postura, abrir }: PropsDock3D) {
    const { confort } = usePrefsXR();
    const posturaEfectiva = postura ?? confort.postura;
    const almacen = UNSAFE_useXRStore();
    const [items, setItems] = useState<DockItemConfig[]>(() => loadDockConfig());
    const [pagina, setPagina] = useState(0);
    const [foco, setFoco] = useState<string | null>(null);
    const [aviso, setAviso] = useState<{ item: DockItemConfig; motivo: string; ruta: string } | null>(null);

    useEffect(() => {
        const alCambiar = (e: StorageEvent): void => { if (e.key === DOCK_STORAGE_KEY) setItems(loadDockConfig()); };
        window.addEventListener("storage", alCambiar);
        return () => window.removeEventListener("storage", alCambiar);
    }, []);

    const paginas = useMemo(() => paginasDelDock(items, posturaEfectiva), [items, posturaEfectiva]);
    const actual = Math.min(pagina, paginas.length - 1);
    const controles: Control[] = paginas[actual].map((item) => ({ tipo: "app", item }));
    if (actual < paginas.length - 1) controles.push({ tipo: "mas" });
    if (actual > 0) controles.push({ tipo: "atras" });
    const entrada = useMemo(() => ({ alturaOjos, postura: posturaEfectiva, manoDominante: confort.manoDominante, modo }),
        [alturaOjos, posturaEfectiva, confort.manoDominante, modo]);
    const posiciones = posicionesDock(controles.length, entrada);

    const alPulsar = (item: DockItemConfig): void => {
        const r = resolverApp(item);
        if (r.tipo === "nativa-3d" && abrir) return abrir(r.id);
        setAviso({ item, motivo: motivoDeApertura(r), ruta: r.tipo === "solo-2d" ? r.ruta : item.path });
    };
    const salirYABrir = async (ruta: string): Promise<void> => {
        try { await almacen?.getState().session?.end(); } catch { /* sin sesión abierta */ }
        window.location.assign(ruta);
    };

    return (
        <group>
            {controles.map((c, i) => {
                const p = posiciones[i];
                if (!p) return null;
                const esMas = c.tipo === "mas";
                const etiqueta = c.tipo === "app" ? c.item.label : esMas ? `Más (${paginas.length - actual - 1})` : "Atrás";
                const glifo = c.tipo === "app" ? inicialDe(c.item.label) : esMas ? "+" : "←";
                const nodo: NodoCardinal = c.tipo === "app" ? nodoDeColor(c.item.color) : esMas ? "anchor" : "logic";
                const clave = c.tipo === "app" ? c.item.id : c.tipo;
                return (
                    <BotonDock key={clave} etiqueta={etiqueta} glifo={glifo} nodo={nodo} posicion={p.posicion} yaw={p.yaw}
                        i={i} n={controles.length} nivel={nivel} enfocado={foco === clave}
                        alFoco={(v) => setFoco(v ? clave : null)}
                        alPulsar={() => (c.tipo === "app" ? alPulsar(c.item) : setPagina(esMas ? actual + 1 : Math.max(0, actual - 1)))} />
                );
            })}
            {aviso && <Tarjeta2D item={aviso.item} motivo={aviso.motivo} alturaOjos={alturaOjos} nivel={nivel}
                alSalir2D={() => void salirYABrir(aviso.ruta)} alCerrar={() => setAviso(null)} />}
        </group>
    );
}

export default Dock3D;

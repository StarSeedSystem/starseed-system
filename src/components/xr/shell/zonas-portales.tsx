"use client";

/**
 * StarSeed XR · ZONAS Y PORTALES (XR1010X §3 g,h).
 * Marca visual de portales (anillo con el color de acento de su destino, nombre en Texto3D) y, al cruzarlos
 * (distancia < radio), pide confirmación breve si el destino es un servidor o sala PÚBLICA («Vas a entrar en un espacio público.
 * ¿Entrar?») y llama a `alIr(destino)`; alimenta al motor de reglas con `entra-zona`/`sale-zona`.
 * La zona `zona-segura` pone un halo y desactiva agarrar de otras personas; `silencio`/`audio-privado` los consume XR1010AB.
 */
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Vector3 } from "@react-three/fiber";
import type { Vector3 as Vector3Raw } from "three";
import { Line } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ModoSesion } from "./escena-os";
import { dentroDeZona, cambiosDeZona, efectosActivos, destinoDePortal } from "../../lib/xr/zonas";
import type { ZonaMundo, PortalMundo, MundoSpec } from "../../lib/xr/mundo-tipos";
import type { Vec3 } from "../../lib/xr/tipos";
import { COLORES_NODO, CRISTAL } from "../../lib/xr/tokens-3d";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { colorAcento } from "./material-cristal";

export type EfectoZona = ReturnType<typeof efectosActivos>;
export type DestinoPortal = ReturnType<typeof destinoDePortal>;

/** --- Componentes internos ------------------------------------------------------------- */
function AnilloPortal({ pos, rot, radio, destino }: {
    pos: Vec3; rot: Vec3; radio: number; destino: DestinoPortal;
}) {
    const escala = destino.tipo === "punto" ? 0.8 : 1.0;
    const colorDestino = destino.tipo === "punto" ? CRISTAL.textoSecundario : colorAcento(zonaDesdeDestino(destino).nodo);
    return (
        <group position={pos} rotation={rot} scale={[escala, escala, escala]}>
            <Line points={[new THREE.Vector3(0, 0, radio), new THREE.Vector3(0, 0, -radio)]} color={colorDestino} linewidth={2} />
            <Line points={[new THREE.Vector3(-radio, 0, 0), new THREE.Vector3(radio, 0, 0)]} color={colorDestino} linewidth={2} />
        </group>
    );
}
function HaloZonaSegura({ pos, tam, efecto }: {
    pos: Vec3; tam: Vec3; efecto: ZonaMundo["efecto"];
}) {
    if (efecto !== "zona-segura") return null;
    const material = new THREE.MeshBasicMaterial({
        color: COLORES_NODO.anchor.base,
        opacity: 0.3,
        transparent: true,
        wireframe: true,
    });
    const geometry = new THREE.BoxGeometry(tam[0], tam[1], tam[2]);
    return <mesh geometry={geometry} material={material} position={pos} />;
}
function MarcaZona({ zona, esActiva }: { zona: ZonaMundo; esActiva: boolean; }) {
    const colorBase = esActiva ? COLORES_NODO.anchor.vivo : COLORES_NODO.anchor.base;
    const material = new THREE.MeshBasicMaterial({
        color: colorBase,
        opacity: esActiva ? 0.7 : 0.3,
        transparent: true,
    });
    const geometry = zona.forma === "esfera"
        ? new THREE.SphereGeometry(Math.max(zona.tam[0], zona.tam[1], zona.tam[2]) / 2, 16, 16)
        : new THREE.BoxGeometry(zona.tam[0], zona.tam[1], zona.tam[2]);
    return <mesh geometry={geometry} material={material} position={zona.pos} />;
}

/** --- Componente principal ---------------------------------------------------------- */
export interface PropsZonasPortales {
    mundo: MundoSpec;
    posPersona: Vec3;
    alIr?: (destino: DestinoPortal) => void;
    alCambiarEstado?: (entraZonas: string[], saleZonas: string[]) => void;
    alActualizarZonas?: (efectos: EfectoZona) => void;
}
export function ZonasPortales({ mundo, posPersona, alIr, alCambiarEstado, alActualizarZonas }: PropsZonasPortales) {
    const { z } = useThree();
    const [previas, setPrevias] = useState<Set<string>>(new Set());
    const [portalConfirmado, setPortalConfirmado] = useState<{ destino: DestinoPortal; pos: Vec3; rot: Vec3; radio: number } | null>(null);

    const zonaEnCursoRef = useRef<HTMLDivElement>(null);
    const [movimientoReducido, setMovimientoReducido] = useState(false);
    useEffect(() => {
        const pref = localStorage.getItem("prefs-xr-confort-movimientoReducido");
        setMovimientoReducido(pref ? JSON.parse(pref) : false);
        const escuchador = (e: Event) => {
            const custom = e as CustomEvent<{ reduccion: boolean }>;
            if (custom.detail?.reduccion !== undefined) setMovimientoReducido(custom.detail.reduccion);
        };
        window.addEventListener("confort-movimientoReducido", escuchador);
        return () => window.removeEventListener("confort-movimientoReducido", escuchador);
    }, []);

    const cambios = cambiosDeZona(mundo.zonas, previas, posPersona);
    const efectos = efectosActivos(mundo.zonas, cambios.ahora);

    useEffect(() => {
        setPrevias(cambios.ahora);
        if (alCambiarEstado) alCambiarEstado(cambios.entra, cambios.sale);
        if (alActualizarZonas) alActualizarZonas(efectos);

        if (efectos.zonaSegura && !movimientoReducido) {
            zonaEnCursoRef.current?.classList.add("ss-zona-segura");
        } else {
            zonaEnCursoRef.current?.classList.remove("ss-zona-segura");
        }

        cambios.entra.forEach(id => {
            const zona = mundo.zonas.find(z => z.id === id);
            if (zona?.efecto === "silencio") {
                window.dispatchEvent(new CustomEvent("silencio-activado"));
            }
            if (zona?.efecto === "audio-privado") {
                const audioPrivado = new Audio(`/api/audio/${id}`);
                audioPrivado.play();
            }
        });
    }, [cambios, efectos, alCambiarEstado, alActualizarZonas, movimientoReducido, mundo.zonas]);

    const cruzarPortal = (portal: PortalMundo) => {
        const destino = destinoDePortal(portal);
        if (!destino) return;
        if (destino.tipo === "ruta" && !destino.privado) {
            if (alIr) alIr(destino);
        } else {
            setPortalConfirmado({ destino, pos: portal.pos, rot: portal.rot, radio: portal.radio });
        }
    };

    return (
        <>
            <div ref={zonaEnCursoRef} className="sr-only" aria-live="polite">
                {cambios.entra.length > 0 && `Entrando en zona${cambios.entra.length > 1 ? "s" : ""}: ${cambios.entra.join(", ")}`}
                {cambios.sale.length > 0 && `Saliendo de zona${cambios.sale.length > 1 ? "s" : ""}: ${cambios.sale.join(", ")}`}
                {efectos.zonaSegura && !movimientoReducido && "Estás en una zona segura: no puedes agarrar objetos de otras personas."}
                {efectos.silencio && "Silencio activado."}
                {efectos.audioPrivado && `Audio privado: ${efectos.audioPrivado}`}
                {efectos.escenario && `Escenario: ${efectos.escenario}`}
            </div>

            {mundo.portales.map(p => (
                <AnilloPortal key={p.id} pos={p.pos} rot={p.rot} radio={p.radio} destino={destinoDePortal(p)} />
            ))}

            {mundo.zonas.map(z => (
                <React.Fragment key={z.id}>
                    <MarcaZona zona={z} esActiva={cambios.ahora.has(z.id)} />
                    <HaloZonaSegura pos={z.pos} tam={z.tam} efecto={z.efecto} />
                </React.Fragment>
            ))}

            {portalConfirmado && (
                <PortalConfirmacion
                    destino={portalConfirmado.destino}
                    onConfirmar={() => {
                        if (alIr) alIr(portalConfirmado.destino);
                        setPortalConfirmado(null);
                    }}
                    onCancelar={() => setPortalConfirmado(null)}
                />
            )}
        </>
    );
}

function zonaDesdeDestino(destino: DestinoPortal): { nodo: "zenith" | "horizon" | "logic" | "anchor" } {
    if (destino.tipo === "punto") return { nodo: "anchor" };
    if (destino.tipo === "ruta") {
        if (destino.ruta.includes("/servidores")) return { nodo: "anchor" };
        if (destino.ruta.includes("/salas")) return { nodo: "logic" };
        if (destino.ruta.includes("/estaciones")) return { nodo: "horizon" };
        return { nodo: "anchor" };
    }
    return { nodo: "anchor" };
}

function PortalConfirmacion({ destino, onConfirmar, onCancelar }: {
    destino: DestinoPortal;
    onConfirmar: () => void;
    onCancelar: () => void;
}) {
    const esPublico = destino.tipo === "ruta" && !destino.privado;
    return (
        <group position={[0, 1.5, -2]}>
            <PanelCristal nodo="logic" ancho={0.8} alto={0.4} curvatura={2.5}>
                <Texto3D distancia={1.5}>Vas a entrar en un espacio público. ¿Entrar?</Texto3D>
                {esPublico && (
                    <div className="cursor-pointer mt-4" onClick={onConfirmar}>
                        <Texto3D distancia={1.5} fontSize={14}>Sí, entrar</Texto3D>
                    </div>
                )}
                {onCancelar && (
                    <div className="cursor-pointer mt-4" onClick={onCancelar}>
                        <Texto3D distancia={1.5} fontSize={14} tono="textoSecundario">Cancelar</Texto3D>
                    </div>
                )}
            </PanelCristal>
        </group>
    );
}

export default ZonasPortales;
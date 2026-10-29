"use client";
/**
 * StarSeed XR · ZONAS Y PORTALES (XR1010X · contrato §3 g y h). Cascarón fino de R3F: dibuja el
 * anillo de cada portal con el acento de su destino y el halo de las zonas seguras, y delega
 * toda la decisión en `src/lib/xr/zonas.ts`. Alimenta al motor de reglas con `entra-zona`/
 * `sale-zona`; los efectos (`silencio`, `audio-privado`…) se entregan a quien los consuma.
 */
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "../../../lib/xr/tipos";
import type { PortalMundo, ZonaMundo } from "../../../lib/xr/mundo-tipos";
import { COLORES_NODO } from "../../../lib/xr/tokens-3d";
import { ACENTO_SIN_DESTINO, acentoDeDestino, anuncioDeZona, cambiosDeZona, destinoDePortal, efectosActivos,
    eventosDeZona, portalesAlcanzados, radioDeZona, requiereConfirmacion, type DestinoResuelto, type EfectosZona, type EventoZona } from "../../../lib/xr/zonas";
import { Texto3D } from "./panel-cristal";
type RutaDestino = Extract<DestinoResuelto, { tipo: "ruta" }>;
export interface PropsZonasPortales {
    zonas: readonly ZonaMundo[];
    portales: readonly PortalMundo[];
    /** Posición de la persona, actualizada por quien monta la escena (cabeza o jugador). */
    posicion: { current: Vec3 };
    alIr(destino: DestinoResuelto): void;
    alEventoRegla?(evento: EventoZona): void;
    alEfectos?(efectos: EfectosZona): void;
    alAnunciar?(texto: string): void;
    alZonaSegura?(activa: boolean): void;
}
export function ZonasPortales({ zonas, portales, posicion, alIr, alEventoRegla, alEfectos, alAnunciar, alZonaSegura }: PropsZonasPortales) {
    const previas = useRef<Set<string>>(new Set());
    const dentro = useRef<Set<string>>(new Set());
    const firma = useRef("");
    const [pendiente, setPendiente] = useState<{ portal: PortalMundo; destino: RutaDestino } | null>(null);
    useFrame(() => {
        const p = posicion.current;
        const cambios = cambiosDeZona(zonas, previas.current, p);
        previas.current = cambios.ahora;
        if (cambios.entra.length || cambios.sale.length) {
            for (const evento of eventosDeZona(cambios)) alEventoRegla?.(evento);
            for (const id of cambios.entra) {
                const z = zonas.find((x) => x.id === id);
                const aviso = z ? anuncioDeZona(z) : null;
                if (aviso) alAnunciar?.(aviso);
            }
            const efectos = efectosActivos(zonas, cambios.ahora);
            const actual = JSON.stringify(efectos);
            if (actual !== firma.current) {
                firma.current = actual;
                alEfectos?.(efectos);
                alZonaSegura?.(efectos.zonaSegura);
            }
        }
        const cerca = portalesAlcanzados(portales, p);
        for (const portal of cerca) {
            if (dentro.current.has(portal.id)) continue;
            dentro.current.add(portal.id);
            const destino = destinoDePortal(portal);
            if (destino.tipo === "no-disponible") { alAnunciar?.(destino.motivo); continue; }
            if (requiereConfirmacion(portal, destino)) { setPendiente({ portal, destino }); continue; }
            alIr(destino);
        }
        for (const id of [...dentro.current]) if (!cerca.some((x) => x.id === id)) dentro.current.delete(id);
    });
    return (
        <>
            {portales.map((portal) => <AnilloPortal key={portal.id} portal={portal} />)}
            {zonas.filter((z) => z.efecto === "zona-segura").map((z) => <HaloSeguro key={z.id} zona={z} />)}
            {pendiente && (
                <Confirmacion
                    portal={pendiente.portal}
                    alEntrar={() => { alIr(pendiente.destino); setPendiente(null); }}
                    alCancelar={() => setPendiente(null)}
                />
            )}
        </>
    );
}
function AnilloPortal({ portal }: { portal: PortalMundo }) {
    const destino = destinoDePortal(portal);
    const acento = destino.tipo === "no-disponible" ? ACENTO_SIN_DESTINO : acentoDeDestino(portal.destino);
    return (
        <group position={portal.pos} rotation={portal.rot}>
            <mesh>
                <torusGeometry args={[portal.radio, 0.03, 12, 48]} />
                <meshBasicMaterial color={acento} transparent opacity={0.9} />
            </mesh>
            <group position={[0, portal.radio + 0.12, 0]}>
                <Texto3D distancia={1.4}>{portal.nombre}</Texto3D>
            </group>
        </group>
    );
}
function HaloSeguro({ zona }: { zona: ZonaMundo }) {
    const radio = radioDeZona(zona);
    return (
        <mesh position={[zona.pos[0], zona.pos[1] + zona.tam[1] / 2, zona.pos[2]]}>
            <cylinderGeometry args={[radio, radio, 0.02, 40, 1, true]} />
            <meshBasicMaterial color={COLORES_NODO.horizon.vivo} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
    );
}
function Confirmacion({ portal, alEntrar, alCancelar }: { portal: PortalMundo; alEntrar(): void; alCancelar(): void }) {
    return (
        <group position={[portal.pos[0], portal.pos[1] + 0.4, portal.pos[2]]}>
            <group position={[0, 0.16, 0]}>
                <Texto3D distancia={1.2}>Vas a entrar en un espacio público. ¿Entrar?</Texto3D>
            </group>
            <group position={[-0.16, 0, 0]} onClick={alEntrar}>
                <mesh><planeGeometry args={[0.28, 0.12]} /><meshBasicMaterial color={COLORES_NODO.horizon.vivo} /></mesh>
                <Texto3D distancia={1.2}>Entrar</Texto3D>
            </group>
            <group position={[0.16, 0, 0]} onClick={alCancelar}>
                <mesh><planeGeometry args={[0.28, 0.12]} /><meshBasicMaterial color={COLORES_NODO.anchor.vivo} /></mesh>
                <Texto3D distancia={1.2}>Cancelar</Texto3D>
            </group>
        </group>
    );
}

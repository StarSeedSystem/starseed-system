"use client";

/**
 * StarSeed XR · ZONAS Y PORTALES (XR1010X · contrato §3 g y h): cascarón fino de R3F. La lógica vive en
 * `src/lib/xr/zonas.ts`; aquí sólo se dibuja el anillo de cada portal, se avisa al cruzarlo y se enciende
 * el halo de `zona-segura`. Las zonas alimentan al motor de reglas con `entra-zona`/`sale-zona`.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, Vector3 } from "three";
import { COLORES_NODO, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import type { PortalMundo, ZonaMundo } from "../../../lib/xr/mundo-tipos";
import type { Vec3 } from "../../../lib/xr/tipos";
import {
    HISTERESIS_M, anuncioDeEntrada, cambiosDeZona, destinoDePortal, efectosActivos,
    type DestinoResuelto, type EfectosZona,
} from "../../../lib/xr/zonas";
import { PanelCristal, Texto3D } from "./panel-cristal";
export const PREGUNTA_PUBLICA = "Vas a entrar en un espacio público. ¿Entrar?";
export interface EventoZona { tipo: "entra-zona" | "sale-zona"; zona: string }

export interface PropsZonasPortales {
    portales: readonly PortalMundo[];
    zonas: readonly ZonaMundo[];
    posicion?: () => Vec3;
    alIr: (destino: DestinoResuelto) => void;
    alZona?: (evento: EventoZona) => void;
    alEfectos?: (efectos: EfectosZona) => void;
    alAgarre?: (permitido: boolean) => void;
    alAnunciar?: (texto: string) => void;
    confirmar?: (pregunta: string) => boolean;
    distanciaTexto?: number;
}
const NODO_DESTINO: Record<PortalMundo["destino"]["tipo"], NodoCardinal> = {
    punto: "anchor", mundo: "horizon", sala: "horizon", estacion: "zenith", servidor: "logic",
};
function iguales(a: EfectosZona | null, b: EfectosZona): boolean {
    return !!a && a.silencio === b.silencio && a.audioPrivado === b.audioPrivado
        && a.gravedadCero === b.gravedadCero && a.zonaSegura === b.zonaSegura && a.escenario === b.escenario;
}
export function ZonasPortales({
    portales, zonas, posicion, alIr, alZona, alEfectos, alAgarre, alAnunciar, confirmar, distanciaTexto = 1.8,
}: PropsZonasPortales) {
    const previas = useRef<Set<string>>(new Set());
    const dentroPortales = useRef<Set<string>>(new Set());
    const efectosPrevios = useRef<EfectosZona | null>(null);
    const agarre = useRef(true);
    const camara = useThree((s) => s.camera);
    const punto = useRef<Vec3>([0, 0, 0]);
    const auxiliar = useRef(new Vector3());

    useFrame(() => {
        if (posicion) punto.current = posicion();
        else {
            camara.getWorldPosition(auxiliar.current);
            punto.current = [auxiliar.current.x, auxiliar.current.y, auxiliar.current.z];
        }
        const p = punto.current;
        const cambio = cambiosDeZona(zonas, previas.current, p);
        previas.current = cambio.ahora;
        for (const id of cambio.entra) {
            alZona?.({ tipo: "entra-zona", zona: id });
            const aviso = anuncioDeEntrada(zonas.find((z) => z.id === id));
            if (aviso) alAnunciar?.(aviso);
        }
        for (const id of cambio.sale) alZona?.({ tipo: "sale-zona", zona: id });

        const efectos = efectosActivos(zonas, cambio.ahora);
        if (!iguales(efectosPrevios.current, efectos)) {
            efectosPrevios.current = efectos;
            alEfectos?.(efectos);
        }
        if (agarre.current !== !efectos.zonaSegura) {
            agarre.current = !efectos.zonaSegura;
            alAgarre?.(agarre.current);
        }

        for (const portal of portales) {
            const distancia = Math.hypot(p[0] - portal.pos[0], p[1] - portal.pos[1], p[2] - portal.pos[2]);
            if (distancia >= portal.radio) { dentroPortales.current.delete(portal.id); continue; }
            if (dentroPortales.current.has(portal.id)) continue;
            dentroPortales.current.add(portal.id);
            const destino = destinoDePortal(portal);
            const publico = (portal.destino.tipo === "servidor" || portal.destino.tipo === "sala")
                && destino.tipo === "ruta" && !destino.privado;
            const preguntar = confirmar ?? ((texto: string) => window.confirm(texto));
            if (publico && !preguntar(PREGUNTA_PUBLICA)) continue;
            alIr(destino);
        }
    });

    return (
        <group>
            {portales.map((portal) => {
                const nodo = NODO_DESTINO[portal.destino.tipo];
                return (
                    <group key={portal.id} position={portal.pos} rotation={portal.rot}>
                        <mesh rotation={[-Math.PI / 2, 0, 0]}>
                            <ringGeometry args={[portal.radio * 0.78, portal.radio, 48]} />
                            <meshBasicMaterial color={COLORES_NODO[nodo].vivo} transparent opacity={0.72} side={DoubleSide} />
                        </mesh>
                        <group position={[0, 0.18, 0]}>
                            <PanelCristal nodo={nodo} ancho={0.6} alto={0.12}>
                                <Texto3D distancia={distanciaTexto}>{portal.nombre}</Texto3D>
                            </PanelCristal>
                        </group>
                    </group>
                );
            })}
            {zonas.filter((z) => z.efecto === "zona-segura").map((z) => (
                <mesh key={z.id} position={z.pos}>
                    {z.forma === "esfera"
                        ? <sphereGeometry args={[Math.max(z.tam[0], z.tam[1], z.tam[2]) / 2 + HISTERESIS_M, 24, 16]} />
                        : <boxGeometry args={[z.tam[0] + 2 * HISTERESIS_M, z.tam[1] + 2 * HISTERESIS_M, z.tam[2] + 2 * HISTERESIS_M]} />}
                    <meshBasicMaterial color={COLORES_NODO.zenith.vivo} transparent opacity={0.08} depthWrite={false} />
                </mesh>
            ))}
        </group>
    );
}

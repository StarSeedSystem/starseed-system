"use client";
/**
 * StarSeed XR · ZONAS Y PORTALES (XR1010X · contrato §3 g y h).
 * Cascarón fino de R3F/uikit: la decisión vive en `src/lib/xr/zonas.ts`. Pinta
 * el anillo de cada portal con el color de su destino, pide confirmación al
 * cruzar uno público y alimenta al motor de reglas con `entra-zona`/`sale-zona`.
 * La zona segura pinta un halo y avisa por `alEfectos` para desactivar agarrar a
 * otras personas. `silencio`/`audio-privado` los consume XR1010AB desde ese aviso.
 */
import { useEffect, useRef, useState } from "react";
import { Container } from "@react-three/uikit";
import type { Vec3 } from "../../../lib/xr/tipos";
import type { PortalMundo, ZonaMundo } from "../../../lib/xr/mundo-tipos";
import { COLORES_NODO, CRISTAL } from "../../../lib/xr/tokens-3d";
import {
    SIN_EFECTOS, cambiosDeZona, colorDeDestino, destinoDePortal, efectosActivos, portalesCruzados,
    type DestinoRegistrado, type EfectosZona, type ResultadoPortal,
} from "../../../lib/xr/zonas";
import { Texto3D } from "./panel-cristal";

export interface EventoReglasZona { tipo: "entra-zona" | "sale-zona"; zona: string }
export interface PropsZonasPortales {
    posicion: Vec3;
    zonas?: readonly ZonaMundo[];
    portales?: readonly PortalMundo[];
    conocidos?: readonly DestinoRegistrado[];
    alIr?: (destino: ResultadoPortal) => void;
    alEvento?: (evento: EventoReglasZona) => void;
    alEfectos?: (efectos: EfectosZona) => void;
}
const SIN_ZONAS: readonly ZonaMundo[] = [];
const SIN_PORTALES: readonly PortalMundo[] = [];
const MENSAJE_PUBLICO = "Vas a entrar en un espacio público. ¿Entrar?";

export function ZonasPortales({ posicion, zonas = SIN_ZONAS, portales = SIN_PORTALES, conocidos, alIr, alEvento, alEfectos }: PropsZonasPortales) {
    const zonasPrevias = useRef<Set<string>>(new Set());
    const portalesPrevios = useRef<Set<string>>(new Set());
    const esperando = useRef(false);
    const [efectos, setEfectos] = useState<EfectosZona>(SIN_EFECTOS);
    const [confirmacion, setConfirmacion] = useState<{ portal: PortalMundo; destino: ResultadoPortal } | null>(null);

    useEffect(() => {
        const c = cambiosDeZona(zonas, zonasPrevias.current, posicion);
        zonasPrevias.current = c.ahora;
        for (const id of c.entra) alEvento?.({ tipo: "entra-zona", zona: id });
        for (const id of c.sale) alEvento?.({ tipo: "sale-zona", zona: id });
        const e = efectosActivos(zonas, c.ahora);
        setEfectos(e);
        alEfectos?.(e);
    }, [zonas, posicion, alEvento, alEfectos]);

    useEffect(() => {
        const { entran, ahora } = portalesCruzados(portales, portalesPrevios.current, posicion);
        portalesPrevios.current = ahora;
        const portal = entran[0];
        if (!portal || esperando.current) return;
        const destino = destinoDePortal(portal, conocidos);
        if (destino.tipo === "punto" || (destino.tipo === "ruta" && destino.privado)) {
            alIr?.(destino);
            return;
        }
        esperando.current = true;
        setConfirmacion({ portal, destino });
    }, [portales, posicion, conocidos, alIr]);

    const cerrar = (entrar: boolean) => {
        const destino = confirmacion?.destino;
        setConfirmacion(null);
        esperando.current = false;
        if (entrar && destino) alIr?.(destino);
    };

    return (
        <group>
            {zonas.map((z) => z.efecto === "zona-segura" ? (
                <mesh key={`halo-${z.id}`} position={[z.pos[0], z.pos[1] + 0.02, z.pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[Math.max(0.2, Math.max(z.tam[0], z.tam[2]) / 2 - 0.08), Math.max(0.3, Math.max(z.tam[0], z.tam[2]) / 2), 48]} />
                    <meshBasicMaterial color={efectos.zonaSegura ? COLORES_NODO.horizon.vivo : COLORES_NODO.horizon.base} transparent opacity={0.45} />
                </mesh>
            ) : null)}
            {portales.map((p) => (
                <group key={`portal-${p.id}`}>
                    <mesh position={p.pos} rotation={p.rot}>
                        <torusGeometry args={[Math.max(0.1, p.radio), 0.02, 12, 48]} />
                        <meshBasicMaterial color={colorDeDestino(p.destino)} transparent opacity={0.85} />
                    </mesh>
                    <group position={[p.pos[0], p.pos[1] + Math.max(0.3, p.radio * 0.6), p.pos[2]]}>
                        <Container flexDirection="column" alignItems="center">
                            <Texto3D distancia={2} tono="texto">{p.nombre}</Texto3D>
                        </Container>
                    </group>
                </group>
            ))}
            {confirmacion ? (
                <group position={[confirmacion.portal.pos[0], confirmacion.portal.pos[1] + 0.9, confirmacion.portal.pos[2]]}>
                    <Container flexDirection="column" alignItems="center" paddingTop={16} paddingBottom={16} paddingLeft={16} paddingRight={16} gapRow={8}
                        backgroundColor={CRISTAL.fondoA.color} borderWidth={1} borderColor={colorDeDestino(confirmacion.portal.destino)}>
                        <Texto3D distancia={1.5} tono="texto">
                            {confirmacion.destino.tipo === "ruta" ? MENSAJE_PUBLICO
                                : confirmacion.destino.tipo === "no-disponible" ? confirmacion.destino.motivo
                                    : "Vas a volver al inicio del mundo."}
                        </Texto3D>
                        <Container flexDirection="row" gapColumn={12}>
                            <Container cursor="pointer" paddingTop={6} paddingBottom={6} paddingLeft={10} paddingRight={10} borderWidth={1} borderColor={CRISTAL.borde.color}
                                onClick={() => cerrar(confirmacion.destino.tipo !== "no-disponible")}>
                                <Texto3D distancia={1.5} tono="texto">{confirmacion.destino.tipo === "no-disponible" ? "Cerrar" : "Entrar"}</Texto3D>
                            </Container>
                            {confirmacion.destino.tipo !== "no-disponible" ? (
                                <Container cursor="pointer" paddingTop={6} paddingBottom={6} paddingLeft={10} paddingRight={10} borderWidth={1} borderColor={CRISTAL.borde.color} onClick={() => cerrar(false)}>
                                    <Texto3D distancia={1.5} tono="textoSecundario">Cancelar</Texto3D>
                                </Container>
                            ) : null}
                        </Container>
                    </Container>
                </group>
            ) : null}
        </group>
    );
}
